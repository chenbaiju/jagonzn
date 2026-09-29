"""Disposable V5d cross-project notification shared-pool probe.

Run against a fixed, isolated NONCOMMERCIAL jagonzn candidate. Two projects
belong to one new tenant; a third project belongs to another new tenant.
Each project emits one alarm EMAIL and one failed Webhook delivery intent.
The probe checks source rows, async UTC-day counters, project and tenant quota
projections, replay stability, and cross-tenant isolation. It does not claim
successful external delivery or a real UTC midnight crossing.
"""

import argparse
import importlib.util
import json
import secrets
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v5d_base", HERE / "smoke-noncommercial-daily-v5b2.py")
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)


def utc_day():
    return datetime.now(timezone.utc).date().isoformat()


def require_same_day(day):
    base.require(utc_day() == day, "探针穿越 UTC 午夜；本轮不得合并为单日回执")


def new_account(api, pg, suffix):
    email = f"v5d-{suffix}@example.test"
    password = secrets.token_urlsafe(36)
    base.register(api, email, password)
    verified = base.integer(pg, "WITH verified AS (UPDATE sys_account SET email_verified_at=now() "
                            f"WHERE email='{email}' AND email_verified_at IS NULL RETURNING 1) "
                            "SELECT count(*) FROM verified")
    base.require(verified == 1, "一次性账号验证失败")
    login = api.call("POST", "/api/v1/auth/login", {"email": email, "password": password})
    api.token = login["accessToken"]
    return email


def create_projects(api, pg, email, suffix, count):
    projects = []
    for ordinal in range(1, count + 1):
        created = api.call("POST", "/api/v1/projects", {
            "name": f"v5d-{suffix}-{ordinal}", "region": "sh-1"})
        pid = base.checked_uuid(created["id"])
        tenant = base.checked_uuid(base.db(pg, f"SELECT tenant_id FROM sys_project WHERE id='{pid}'"))
        projects.append({"pid": pid, "pkey": created["projectKey"], "tenant": tenant,
                         "suffix": f"{suffix}_{ordinal}", "email": email})
    base.require(len({item["tenant"] for item in projects}) == 1,
                 "同一账号的项目未归于同一租户")
    for item in projects:
        selected = api.call("POST", "/api/v1/auth/switch-project", {"projectId": item["pid"]})
        api.token = item["token"] = selected["accessToken"]
        did, key, secret = base.device_fixture(api, item["pid"], item["suffix"])
        item["device"] = did
        item["key"] = key
        item["secret"] = secret
        item["subscription"] = base.notification_fixture(
            api, item["pid"], did, email, item["suffix"])
    return projects


def send_and_reconcile(api, pg, item, day):
    require_same_day(day)
    api.token = item["token"]
    mid = base.uuid7()
    body = base.report(item["pkey"], item["key"], item["secret"], mid)
    first = base.wait_deliveries(pg, item["pid"], mid, item["subscription"])
    deadline = time.monotonic() + 60
    while first[2] < 2 and time.monotonic() < deadline:
        time.sleep(1)
        first = base.delivery(pg, item["pid"], mid, item["subscription"])
    base.require(first and first[2] >= 2, "Webhook 有界失败重试未发生")
    facts, counts = base.wait_counters(pg, item["tenant"], item["pid"], day)
    base.require(facts["alarm"] == 1 and facts["webhook"] == 1
                 and facts["NOTIFICATION_DELIVERY"] == counts["NOTIFICATION_DELIVERY"] == 2,
                 "项目 EMAIL/Webhook 唯一意图与日计数不符")
    item["mid"], item["body"], item["delivery"], item["attempts"] = (
        mid, body, first[0], first[2])


def check_projection(api, pg, item, day, project_used, tenant_used, limit):
    api.token = item["token"]
    response = api.call("GET", f"/api/v1/projects/{item['pid']}/quota")
    base.require(response.get("policyCode") == "NONCOMMERCIAL_TECHNICAL"
                 and response.get("windowStart") == day + "T00:00:00Z",
                 "配额策略或 UTC 日窗口不符")
    def row(scope):
        matches = [value for value in response[scope]["dailyMetrics"]
                   if value.get("metric") == "NOTIFICATION_DELIVERY"]
        base.require(len(matches) == 1, "通知配额投影缺失或重复")
        return matches[0]
    project, tenant = row("project"), row("tenantSharedPool")
    base.require(project["used"] == project_used and tenant["used"] == tenant_used,
                 "项目贡献或租户共享通知用量不符")
    base.require(project["limit"] == tenant["limit"] == limit
                 and tenant["remaining"] == max(0, limit - tenant_used),
                 "通知容量或共享剩余投影不符")
    base.require(project["status"] == tenant["status"] == "NORMAL",
                 "高容量基线下通知状态异常")
    base.wait_counters(pg, item["tenant"], item["pid"], day)


def replay_stable(pg, item, day):
    base.report(item["pkey"], item["key"], item["secret"], item["mid"], item["body"])
    time.sleep(2)
    replay = base.delivery(pg, item["pid"], item["mid"], item["subscription"])
    facts, counts = base.wait_counters(pg, item["tenant"], item["pid"], day)
    base.require(replay and replay[0] == item["delivery"]
                 and facts["NOTIFICATION_DELIVERY"] == counts["NOTIFICATION_DELIVERY"] == 2,
                 "同 ID 重放改变唯一通知意图或日计数")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy-dir", required=True)
    parser.add_argument("--candidate-jar", required=True)
    parser.add_argument("--candidate-sha256", required=True)
    parser.add_argument("--admin-port", type=int, default=18080)
    parser.add_argument("--device-port", type=int, default=18443)
    args = parser.parse_args()
    base.require(all(1 <= port <= 65535 for port in (args.admin_port, args.device_port)),
                 "回环端口无效")
    base.ADMIN = f"http://127.0.0.1:{args.admin_port}"
    base.DEVICE = f"https://127.0.0.1:{args.device_port}/device-access/v1/property/report"
    deploy = Path(args.deploy_dir).expanduser().resolve()
    jar = Path(args.candidate_jar).expanduser().resolve()
    pg, limits = base.preflight(deploy, jar, args.candidate_sha256)
    base.require(limits["NOTIFICATION_DELIVERY"] >= 10,
                 "本探针须使用通知高容量基线")
    day = utc_day()
    shared_api = base.Api()
    first_email = new_account(shared_api, pg, secrets.token_hex(5))
    shared = create_projects(shared_api, pg, first_email, secrets.token_hex(5), 2)
    other_api = base.Api()
    second_email = new_account(other_api, pg, secrets.token_hex(5))
    isolated = create_projects(other_api, pg, second_email, secrets.token_hex(5), 1)[0]
    base.require(shared[0]["tenant"] != isolated["tenant"], "隔离租户身份未分离")
    for item in shared:
        send_and_reconcile(shared_api, pg, item, day)
    send_and_reconcile(other_api, pg, isolated, day)
    require_same_day(day)
    for item in shared:
        check_projection(shared_api, pg, item, day, 2, 4,
                         limits["NOTIFICATION_DELIVERY"])
    check_projection(other_api, pg, isolated, day, 2, 2,
                     limits["NOTIFICATION_DELIVERY"])
    other_api.token = isolated["token"]
    denied, _ = other_api.request("GET", f"/api/v1/projects/{shared[0]['pid']}/quota")
    base.require(denied in (403, 404), "另一租户已选项目令牌可读取其他项目路径")
    for item in shared:
        replay_stable(pg, item, day)
    require_same_day(day)
    base.preflight(deploy, jar, args.candidate_sha256, limits)
    print(json.dumps({"result": "PASS", "candidateSha256": args.candidate_sha256,
                      "utcDay": day, "sharedTenant": shared[0]["tenant"],
                      "sharedProjects": [item["pid"] for item in shared],
                      "sharedNotificationUsed": 4, "perProjectUsed": [2, 2],
                      "sharedWebhookAttempts": [item["attempts"] for item in shared],
                      "otherTenant": isolated["tenant"], "otherProject": isolated["pid"],
                      "otherTenantUsed": 2, "otherWebhookAttempts": isolated["attempts"],
                      "replayStable": True,
                      "otherTenantTokenCannotReadSharedProjectPath": True,
                      "unverified": ["actual UTC midnight crossing",
                                     "successful external SMTP/HTTPS delivery"]}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        message = str(error) if isinstance(error, base.ProbeError) else "探针运行失败，需核对隔离环境"
        print("V5d FAIL: " + message, file=sys.stderr)
        sys.exit(1)

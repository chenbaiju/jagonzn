"""V5b-2 two-phase, disposable low-capacity boundary probe.

Run ``prepare`` with generous temporary REST/notification limits. It writes a
mode-0600 fixture file outside the repository and prints the exact REST limit
to apply next. Restart only the isolated app with a temporary Compose override
setting that REST limit and notification limit 3; retain the original access
and Redis timeout Compose files. Run ``verify`` against the same fixed JAR and
database on the same UTC day. Neither phase restarts Docker or changes quotas.

The fixture file contains temporary login/device credentials. Never commit or
print it. The probe leaves named disposable facts in the isolated database.
"""

import argparse
import importlib.util
import json
import os
import re
import secrets
import stat
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
DAY = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}\Z")


def base_module():
    source = HERE / "smoke-noncommercial-daily-v5b2.py"
    if not source.is_file():
        raise RuntimeError("V5b-2 基线探针缺失")
    spec = importlib.util.spec_from_file_location("v5b2_base", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def now_day():
    return datetime.now(timezone.utc).date().isoformat()


def current_day(base, saved):
    base.require(DAY.fullmatch(saved) and now_day() == saved,
                 "准备与边界执行不在同一真实 UTC 日")


def save_state(base, path, state):
    base.require(not path.exists() and path.parent.is_dir(), "私有状态文件路径必须尚不存在")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(state, output, separators=(",", ":"), sort_keys=True)
            output.write("\n")
    except Exception:
        path.unlink(missing_ok=True)
        raise


def load_state(base, path):
    metadata = path.stat()
    base.require(metadata.st_uid == os.getuid()
                 and stat.S_IMODE(metadata.st_mode) == 0o600,
                 "私有状态文件须归当前用户所有且权限为 0600")
    with path.open(encoding="utf-8") as source:
        value = json.load(source)
    base.require(value.get("schema") == 1 and isinstance(value.get("password"), str)
                 and isinstance(value.get("deviceSecret"), str), "边界状态文件结构无效")
    return value


def fresh_account(base, api, pg, suffix):
    email = f"v5b2-boundary-{suffix}@example.test"
    password = secrets.token_urlsafe(36)
    base.register(api, email, password)
    verified = base.integer(pg, "WITH verified AS (UPDATE sys_account SET email_verified_at=now() "
                            f"WHERE email='{email}' AND email_verified_at IS NULL RETURNING 1) "
                            "SELECT count(*) FROM verified")
    base.require(verified == 1, "一次性账号验证失败")
    login = api.call("POST", "/api/v1/auth/login", {"email": email, "password": password})
    api.token = login["accessToken"]
    project = api.call("POST", "/api/v1/projects", {
        "name": f"v5b2-boundary-{suffix}", "region": "sh-1"})
    pid, pkey = base.checked_uuid(project["id"]), project["projectKey"]
    tenant = base.checked_uuid(base.db(pg, f"SELECT tenant_id FROM sys_project WHERE id='{pid}'"))
    switched = api.call("POST", "/api/v1/auth/switch-project", {"projectId": pid})
    api.token = switched["accessToken"]
    return email, password, pid, pkey, tenant


def prepare(base, args, deploy, jar, state_path):
    pg, limits = base.preflight(deploy, jar, args.candidate_sha256)
    base.require(limits["REST_API_CALL"] >= 50
                 and limits["NOTIFICATION_DELIVERY"] >= 10,
                 "准备阶段须使用充足的临时日容量")
    day = now_day()
    suffix = secrets.token_hex(5)
    api = base.Api()
    email, password, pid, pkey, tenant = fresh_account(base, api, pg, suffix)
    did, key, secret = base.device_fixture(api, pid, suffix)
    subscription = base.notification_fixture(api, pid, did, email, suffix)
    current_day(base, day)
    facts, counter = base.wait_counters(pg, tenant, pid, day)
    base.require(facts["NOTIFICATION_DELIVERY"] == 0
                 and counter["NOTIFICATION_DELIVERY"] == 0,
                 "准备阶段不应产生通知意图")
    rest_used = facts["REST_API_CALL"]
    base.require(rest_used > 0, "准备阶段 REST 事实缺失")
    target = rest_used + 2
    state = {"schema": 1, "candidateSha256": args.candidate_sha256,
             "utcDay": day, "tenant": tenant, "project": pid, "projectKey": pkey,
             "device": did, "deviceKey": key, "deviceSecret": secret,
             "subscription": subscription, "email": email, "password": password,
             "restUsedAtPrepare": rest_used, "restLimit": target,
             "notificationLimit": 3}
    save_state(base, state_path, state)
    print(json.dumps({"result": "PREPARED", "candidateSha256": args.candidate_sha256,
                      "tenant": tenant, "project": pid, "utcDay": day,
                      "restUsedAtPrepare": rest_used,
                      "requiredOverride": {
                          "JAGONZN_TECHNICAL_DAILY_REST_API_CALL": target,
                          "JAGONZN_TECHNICAL_DAILY_NOTIFICATION_DELIVERY": 3},
                      "statePath": str(state_path)}, sort_keys=True))


def login(base, api, state):
    value = api.call("POST", "/api/v1/auth/login", {
        "email": state["email"], "password": state["password"]})
    api.token = value["accessToken"]
    switched = api.call("POST", "/api/v1/auth/switch-project", {
        "projectId": base.checked_uuid(state["project"])})
    api.token = switched["accessToken"]


def metric_row(base, response, metric, scope="tenantSharedPool"):
    rows = {item["metric"]: item for item in response[scope]["dailyMetrics"]
            if item.get("metric") == metric}
    base.require(metric in rows, "公开配额缺目标指标")
    return rows[metric]


def quota_read(base, api, pg, state, status=None):
    pid, day = state["project"], state["utcDay"]
    before = base.source(pg, pid, day)["REST_API_CALL"]
    response = api.call("GET", f"/api/v1/projects/{pid}/quota")
    after = base.source(pg, pid, day)["REST_API_CALL"]
    base.require(after == before + 1, "公开额度 GET 未恰好新增一个 REST 事实")
    base.require(response.get("policyCode") == "NONCOMMERCIAL_TECHNICAL"
                 and response.get("windowStart") == day + "T00:00:00Z",
                 "公开额度策略或 UTC 窗口不符")
    rest = metric_row(base, response, "REST_API_CALL")
    notification = metric_row(base, response, "NOTIFICATION_DELIVERY")
    base.require(rest["limit"] == state["restLimit"]
                 and notification["limit"] == 3, "公开额度限额不符")
    if status is not None:
        base.require(notification["status"] == status,
                     "公开通知共享池状态与实算水位不符")
    return response


def wait_count(base, pg, state, expected, seconds=150):
    pid, day = state["project"], state["utcDay"]
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        facts = base.source(pg, pid, day)
        actual = base.counter(pg, state["tenant"], pid, day)
        if facts["NOTIFICATION_DELIVERY"] == expected and all(
                facts[metric] == actual[metric] for metric in base.METRICS):
            return facts
        time.sleep(2)
    raise base.ProbeError("通知源事实与 UTC 日计数未在有界时间内到达目标值")


def send_report(base, pg, state, value):
    pid = base.checked_uuid(state["project"])
    mid = base.uuid7()
    body = json.dumps({"messageId": mid,
        "occurredAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "payload": {"temperature": value}}, separators=(",", ":")).encode()
    # Use the baseline HTTPS transport while preserving the exact chosen value.
    # The baseline helper's default payload is 28.5, so this path sends the
    # custom clear/activate body over the same entry and checks its receipt.
    import ssl
    import urllib.error
    import urllib.request
    request = urllib.request.Request(base.DEVICE, body, {
        "Content-Type": "application/json",
        "X-TC-Device-Key": state["projectKey"] + "/" + state["deviceKey"],
        "X-TC-Device-Secret": state["deviceSecret"]}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=15,
                                    context=ssl._create_unverified_context()) as response:
            status, raw = response.status, response.read(4096)
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read(4096)
    except (urllib.error.URLError, TimeoutError):
        raise base.ProbeError("设备 HTTPS 网络失败") from None
    base.require(status == 202 and mid in raw.decode("utf-8"),
                 "设备 HTTPS 上报收据无效")
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        count = base.integer(pg, f"SET app.project_id='{pid}'; "
                             f"SELECT count(*) FROM sys_inbox_message WHERE message_id='{mid}'")
        if count == 1:
            return mid
        time.sleep(0.5)
    raise base.ProbeError("设备上报未形成唯一 inbox 事实")


def alarm_delivery(base, pg, pid, mid):
    pid, mid = base.checked_uuid(pid), base.checked_uuid(mid)
    rows = base.db(pg, f"SET app.project_id='{pid}'; SELECT d.status, "
                   "(d.last_outbox_event_id IS NOT NULL)::int FROM alarm_notification_delivery d "
                   "JOIN alarm_event e ON e.project_id=d.project_id AND e.id=d.alarm_event_id "
                   f"WHERE d.project_id='{pid}' AND e.source_message_id='{mid}'").splitlines()
    base.require(len(rows) <= 1, "同一告警事件生成重复投递意图")
    if not rows:
        return None
    status, sep, outbox = rows[0].partition("|")
    base.require(sep and outbox in ("0", "1"), "告警投递事实格式无效")
    return status, outbox == "1"


def wait_alarm(base, pg, pid, mid, expected, outbox, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        row = alarm_delivery(base, pg, pid, mid)
        if row and (expected is None or row[0] == expected):
            base.require(row[1] == outbox, "告警 Outbox 与额度状态不符")
            return row
        time.sleep(0.5)
    raise base.ProbeError("告警唯一投递未进入预期额度状态")


def wait_cleared(base, pg, pid, mid, seconds=45):
    pid, mid = base.checked_uuid(pid), base.checked_uuid(mid)
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        count = base.integer(pg, f"SET app.project_id='{pid}'; "
                             "SELECT count(*) FROM alarm_event "
                             f"WHERE project_id='{pid}' AND source_message_id='{mid}' "
                             "AND event_type='CLEARED'")
        if count == 1:
            return
        time.sleep(0.5)
    raise base.ProbeError("低温报告未使告警进入 CLEARED 状态")


def webhook_count(base, pg, pid):
    pid = base.checked_uuid(pid)
    return base.integer(pg, f"SET app.project_id='{pid}'; "
                        "SELECT count(*) FROM integ_webhook_delivery "
                        f"WHERE project_id='{pid}' AND event_type='device.property.report'")


def webhook_rejected(base, pg, pid):
    pid = base.checked_uuid(pid)
    return base.integer(pg, f"SET app.project_id='{pid}'; "
                        "SELECT count(*) FROM integ_webhook_event "
                        f"WHERE project_id='{pid}' AND event_type='device.property.report' "
                        "AND result='QUOTA_DEGRADED'")


def wait_webhook(base, pg, pid, expected, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        actual = webhook_count(base, pg, pid)
        if actual == expected:
            return
        time.sleep(0.5)
    raise base.ProbeError("Webhook 唯一意图数未达到预期")


def wait_rejected(base, pg, pid, expected, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        actual = webhook_rejected(base, pg, pid)
        if actual == expected:
            return
        time.sleep(0.5)
    raise base.ProbeError("Webhook 降级拒绝事实未达到预期")


def verify_rest(base, api, pg, state):
    pid, day = state["project"], state["utcDay"]
    start = state["restUsedAtPrepare"]
    base.require(base.source(pg, pid, day)["REST_API_CALL"] == start,
                 "准备与边界间 REST 事实漂移")
    quota_read(base, api, pg, state)
    base.wait_counters(pg, state["tenant"], pid, day)
    quota_read(base, api, pg, state)
    base.wait_counters(pg, state["tenant"], pid, day)
    base.require(base.source(pg, pid, day)["REST_API_CALL"] == state["restLimit"],
                 "REST 日额度未到达精确 HARD_LIMIT")
    path = f"/api/v1/projects/{pid}/device-types"
    status, raw = api.request("POST", path, {
        "typeKey": "v5b2_denied", "name": "Must not exist", "deviceKind": "DIRECT",
        "payloadProtocol": "STANDARD", "networkType": "WIFI"})
    try:
        parsed = json.loads(raw)
        code = parsed.get("code", parsed.get("errorCode"))
    except (ValueError, AttributeError, TypeError):
        code = None
    base.require(status == 429 and str(code) == "10029",
                 "REST 日硬限未拒绝写请求")
    base.require(base.source(pg, pid, day)["REST_API_CALL"] == state["restLimit"],
                 "REST 拒绝写请求仍新增计量事实")
    visible = quota_read(base, api, pg, state)
    base.require(metric_row(base, visible, "REST_API_CALL")["status"] == "HARD_LIMIT",
                 "REST 硬限后读接口未展示原 HARD_LIMIT 快照")
    base.wait_counters(pg, state["tenant"], pid, day)
    base.require(base.source(pg, pid, day)["REST_API_CALL"] == state["restLimit"] + 1,
                 "REST 硬限后读接口未继续形成计量事实")


def verify_notification(base, api, pg, state):
    pid = state["project"]
    base.require(webhook_count(base, pg, pid) == 0
                 and webhook_rejected(base, pg, pid) == 0,
                 "边界前已有 Webhook 来源事实")
    base.require(base.source(pg, pid, state["utcDay"])["NOTIFICATION_DELIVERY"] == 0,
                 "边界前已有通知投递意图")

    # First property report creates one alarm EMAIL and one public Webhook
    # intent. At 2/3 the notification pool is still NORMAL.
    first = send_report(base, pg, state, 28.5)
    wait_alarm(base, pg, pid, first, None, True)
    wait_webhook(base, pg, pid, 1)
    wait_count(base, pg, state, 2)
    quota_read(base, api, pg, state, "NORMAL")

    # Alarm remains ACTIVE: the next property report creates only Webhook.
    second = send_report(base, pg, state, 28.6)
    wait_webhook(base, pg, pid, 2)
    base.require(alarm_delivery(base, pg, pid, second) is None,
                 "活动告警重复创建通知意图")
    wait_count(base, pg, state, 3)
    quota_read(base, api, pg, state, "HARD_LIMIT")

    # Positive notification capacity treats HARD_LIMIT as soft admission;
    # 4/3 then reaches DEGRADED after asynchronous reconciliation.
    third = send_report(base, pg, state, 28.7)
    wait_webhook(base, pg, pid, 3)
    base.require(alarm_delivery(base, pg, pid, third) is None,
                 "活动告警重复创建通知意图")
    wait_count(base, pg, state, 4)
    quota_read(base, api, pg, state, "DEGRADED")

    # Clear the alarm under DEGRADED, then activate it once more. Both
    # property sources are rejected for public Webhook; the reactivation
    # retains one SUPPRESSED_QUOTA alarm intent without an Outbox.
    before_rejected = webhook_rejected(base, pg, pid)
    clear = send_report(base, pg, state, 5.0)
    wait_rejected(base, pg, pid, before_rejected + 1)
    wait_cleared(base, pg, pid, clear)
    base.require(alarm_delivery(base, pg, pid, clear) is None,
                 "告警清除不应产生投递意图")
    base.require(webhook_count(base, pg, pid) == 3,
                 "通知降级后仍新增 Webhook 意图")
    reactivated = send_report(base, pg, state, 29.0)
    wait_alarm(base, pg, pid, reactivated, "SUPPRESSED_QUOTA", False)
    wait_rejected(base, pg, pid, before_rejected + 2)
    wait_count(base, pg, state, 5)
    base.require(webhook_count(base, pg, pid) == 3,
                 "降级报告形成新 Webhook 意图")
    quota_read(base, api, pg, state, "DEGRADED")
    return {"webhookIntents": 3, "alarmIntents": 2,
            "webhookQuotaRejectedEvents": before_rejected + 2,
            "suppressedAlarmIntents": 1}


def verify(base, args, deploy, jar, state_path):
    state = load_state(base, state_path)
    current_day(base, state["utcDay"])
    base.require(state["candidateSha256"] == args.candidate_sha256,
                 "边界状态与候选摘要不符")
    pg, limits = base.preflight(deploy, jar, args.candidate_sha256)
    base.require(limits == {"REST_API_CALL": state["restLimit"],
                            "NOTIFICATION_DELIVERY": 3},
                 "隔离 app 未应用准备阶段要求的临时日容量")
    api = base.Api()
    login(base, api, state)
    verify_rest(base, api, pg, state)
    result = verify_notification(base, api, pg, state)
    current_day(base, state["utcDay"])
    base.preflight(deploy, jar, args.candidate_sha256, limits)
    print(json.dumps({"result": "PASS", "candidateSha256": args.candidate_sha256,
                      "tenant": state["tenant"], "project": state["project"],
                      "utcDay": state["utcDay"], "limits": limits,
                      "restHardWriteRejected": True,
                      "restReadAfterHardRecorded": True,
                      "notification": result,
                      "unverified": ["actual UTC midnight crossing",
                                     "external SMTP and successful HTTPS Webhook delivery",
                                     "multi-project notification shared pool"]}, sort_keys=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("prepare", "verify"))
    parser.add_argument("--deploy-dir", required=True)
    parser.add_argument("--candidate-jar", required=True)
    parser.add_argument("--candidate-sha256", required=True)
    parser.add_argument("--state-file", required=True,
                        help="源码目录外、仅当前用户可读的临时状态文件")
    args = parser.parse_args()
    base = base_module()
    deploy = Path(args.deploy_dir).expanduser().resolve()
    jar = Path(args.candidate_jar).expanduser().resolve()
    state_path = Path(args.state_file).expanduser().resolve()
    base.require(HERE.parent not in state_path.parents, "状态文件不得写进源码目录")
    if args.phase == "prepare":
        prepare(base, args, deploy, jar, state_path)
    else:
        verify(base, args, deploy, jar, state_path)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # External response bodies, command stderr, tokens and state-file
        # contents are never printed. Only explicit, non-sensitive probe
        # assertions may be surfaced.
        label = str(error) if error.__class__.__name__ == "ProbeError" \
            else "边界探针运行失败，需核对隔离环境与输入结构"
        print("V5b-2 boundary FAIL: " + label, file=sys.stderr)
        sys.exit(1)

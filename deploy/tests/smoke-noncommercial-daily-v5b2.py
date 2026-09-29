"""V5b-2 fixed-candidate REST and notification UTC daily usage probe.

Run only on a disposable, isolated jagonzn stack with generous temporary
REST/notification limits. This probe creates a new tenant and one project,
then uses real Console REST, device HTTPS and a deliberately unreachable
.invalid Webhook destination. No external receiver or SMTP credential is used.
It leaves the named fixture in the isolated database for audit.

This baseline checks authoritative intent/fact rows, asynchronous daily
reconciliation and the public quota projection. It does not claim an actual
UTC midnight crossing or a low-limit rejection boundary.
"""

import argparse
import hashlib
import http.cookiejar
import json
import re
import secrets
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path


ADMIN = "http://127.0.0.1:18080"
DEVICE = "https://127.0.0.1:18443/device-access/v1/property/report"
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
METRICS = ("REST_API_CALL", "NOTIFICATION_DELIVERY")
LIMIT_ENV = {"REST_API_CALL": "JAGONZN_TECHNICAL_DAILY_REST_API_CALL",
             "NOTIFICATION_DELIVERY": "JAGONZN_TECHNICAL_DAILY_NOTIFICATION_DELIVERY"}


class ProbeError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ProbeError(message)


def checked_uuid(value):
    require(isinstance(value, str) and UUID.fullmatch(value), "业务 ID 格式错误")
    return value


def uuid7():
    value = (int(time.time() * 1000) << 80) | secrets.randbits(80)
    value = (value & ~(0xF << 76)) | (7 << 76)
    value = (value & ~(0x3 << 62)) | (0x2 << 62)
    return str(uuid.UUID(int=value))


def command(*argv):
    try:
        result = subprocess.run(argv, capture_output=True, text=True,
                                check=False, timeout=45)
    except (OSError, subprocess.TimeoutExpired):
        raise ProbeError("本机依赖命令无法完成") from None
    require(result.returncode == 0, "本机依赖命令失败")
    return result.stdout.strip()


def compose(deploy, *args):
    return command("docker", "compose", "--env-file", str(deploy / ".env.local"),
                   "-f", str(deploy / "compose.yml"), *args)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def preflight(deploy, jar, expected, previous=None):
    require(deploy != Path(__file__).resolve().parent.parent and (deploy / "compose.yml").is_file()
            and (deploy / ".env.local").is_file(), "须使用源码外独立部署目录")
    require(SHA.fullmatch(expected) and jar.is_file() and sha256(jar) == expected,
            "宿主固定候选 JAR 摘要不符")
    app = compose(deploy, "--profile", "app", "ps", "-q", "app")
    pg = compose(deploy, "ps", "-q", "postgres")
    require(app and pg, "独立 app 或 PostgreSQL 容器未运行")
    running = command("docker", "exec", app, "sha256sum", "/app/jagonzn-service.jar")
    require(running.split() and running.split()[0] == expected, "运行 JAR 摘要不符")
    inspected = json.loads(command("docker", "inspect", app))
    require(len(inspected) == 1 and inspected[0]["State"]["Running"], "app 未运行")
    names = set(LIMIT_ENV.values()) | {"JAGONZN_ENTITLEMENT_MODE"}
    values = {}
    for entry in inspected[0]["Config"]["Env"]:
        key, sep, value = entry.partition("=")
        if sep and key in names:
            require(key not in values, "权益环境变量重复")
            values[key] = value
    require(values.get("JAGONZN_ENTITLEMENT_MODE") == "NONCOMMERCIAL",
            "运行模式非 NONCOMMERCIAL")
    limits = {}
    for metric, name in LIMIT_ENV.items():
        raw = values.get(name, "")
        require(re.fullmatch(r"[1-9][0-9]*", raw), "日容量缺失或非正整数")
        limits[metric] = int(raw)
    if previous is not None:
        require(limits == previous, "探针期间运行容量改变")
    return pg, limits


def db(pg, sql):
    return command("docker", "exec", pg, "psql", "-U", "jagonzn", "-d", "jagonzn",
                   "-v", "ON_ERROR_STOP=1", "-Atqc", sql)


def integer(pg, sql):
    value = db(pg, sql)
    require(re.fullmatch(r"[0-9]+", value), "数据库聚合数值无效")
    return int(value)


class Api:
    def __init__(self):
        self.token = ""
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.last = 0.0

    def request(self, method, path, data=None, headers=None):
        delay = 0.45 - (time.monotonic() - self.last)
        if delay > 0:
            time.sleep(delay)
        self.last = time.monotonic()
        h = dict(headers or {})
        if self.token:
            h["Authorization"] = "Bearer " + self.token
        body = None
        if data is not None:
            h["Content-Type"] = "application/json"
            body = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()
        request = urllib.request.Request(ADMIN + path, body, h, method=method)
        try:
            with self.opener.open(request, timeout=15) as response:
                return response.status, response.read(65536)
        except urllib.error.HTTPError as error:
            return error.code, error.read(4096)
        except (urllib.error.URLError, TimeoutError):
            raise ProbeError("管理 API 网络失败") from None

    def call(self, method, path, data=None, expected=200, headers=None):
        status, raw = self.request(method, path, data, headers)
        require(status == expected, f"管理 API {method} {path.split('?')[0]} 状态 {status}，预期 {expected}")
        if not raw:
            return None
        try:
            return json.loads(raw)
        except ValueError:
            raise ProbeError("管理 API 响应 JSON 无效") from None


def register(api, email, password):
    # Preserve the real 3/5-minute registration limit; never flush Redis.
    for attempt in range(3):
        status, _ = api.request("POST", "/api/v1/auth/register",
                                {"email": email, "password": password})
        if status == 204:
            return
        require(status == 429 and attempt < 2, "注册状态无效或短窗未恢复")
        print("V5b-2: 注册短窗已满，等待原窗口恢复", flush=True)
        time.sleep(305)


def setup(api, pg, suffix):
    email = f"v5b2-{suffix}@example.test"
    password = secrets.token_urlsafe(36)
    register(api, email, password)
    verified = integer(pg, "WITH verified AS (UPDATE sys_account SET email_verified_at=now() "
                       f"WHERE email='{email}' AND email_verified_at IS NULL RETURNING 1) "
                       "SELECT count(*) FROM verified")
    require(verified == 1, "一次性账号验证失败")
    login = api.call("POST", "/api/v1/auth/login", {"email": email, "password": password})
    require(isinstance(login, dict) and isinstance(login.get("accessToken"), str), "登录失败")
    api.token = login["accessToken"]
    project = api.call("POST", "/api/v1/projects", {"name": f"v5b2-{suffix}", "region": "sh-1"})
    pid, pkey = checked_uuid(project["id"]), project["projectKey"]
    tenant = checked_uuid(db(pg, f"SELECT tenant_id FROM sys_project WHERE id='{pid}'"))
    switched = api.call("POST", "/api/v1/auth/switch-project", {"projectId": pid})
    api.token = switched["accessToken"]
    return email, pid, pkey, tenant


def device_fixture(api, pid, suffix):
    dtype = api.call("POST", f"/api/v1/projects/{pid}/device-types", {
        "typeKey": f"v5b2_{suffix}", "name": "V5b2 daily notification",
        "deviceKind": "DIRECT", "payloadProtocol": "STANDARD", "networkType": "WIFI"}, 201)
    tid = checked_uuid(dtype["id"])
    api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/properties", {
        "propertyKey": "temperature", "name": "Temperature", "accessType": "REPORT",
        "dataType": "NUMBER", "unit": "C", "decimalPlaces": 1,
        "minimumValue": 0, "maximumValue": 100, "sortOrder": 0}, 201)
    api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/publish")
    key = f"v5b2-{suffix}"
    device = api.call("POST", f"/api/v1/projects/{pid}/devices", {
        "deviceTypeId": tid, "deviceKey": key, "name": "V5b2 HTTP device"}, 201)
    did = checked_uuid(device["id"])
    credential = api.call("POST", f"/api/v1/projects/{pid}/devices/{did}/credentials",
                          expected=201)
    secret = credential.get("plainSecret")
    require(isinstance(secret, str) and secret, "设备秘密签发失败")
    path = f"/api/v1/projects/{pid}/devices/{did}/access-config"
    config = api.call("GET", path)
    if config["protocol"] != "HTTP" or not config["enabled"]:
        api.call("PUT", path, {"protocol": "HTTP", "enabled": True,
                                "expectedConfigVersion": config["configVersion"]})
    return did, key, secret


def notification_fixture(api, pid, did, email, suffix):
    # The .invalid target produces durable failed attempts without an external
    # receiver. Its one frozen delivery shares the daily pool with alarm email.
    path = f"/api/v1/projects/{pid}/webhooks"
    operation = str(uuid.uuid4())
    issued = api.call("POST", path, {"operationId": operation,
        "name": f"v5b2-{suffix}", "targetUrl": "https://receiver.example.invalid/events",
        "eventTypes": ["device.property.report"], "deviceIds": [did]}, 201,
        {"Idempotency-Key": operation})
    require(isinstance(issued.get("signingSecret"), str), "Webhook 首次秘密缺失")
    subscription = checked_uuid(issued["subscription"]["id"])
    group = api.call("POST", f"/api/v1/projects/{pid}/alarm-notification-groups", {
        "name": f"v5b2-{suffix}", "enabled": True}, 201)
    gid = checked_uuid(group["id"])
    api.call("POST", f"/api/v1/projects/{pid}/alarm-notification-groups/{gid}/recipients", {
        "channel": "EMAIL", "target": email, "enabled": True}, 201)
    template = api.call("POST", f"/api/v1/projects/{pid}/alarm-notification-templates", {
        "name": f"v5b2-{suffix}", "channel": "EMAIL", "subjectTemplate": f"v5b2-{suffix}",
        "bodyTemplate": "V5b2 notification daily usage", "enabled": True}, 201)
    rule = api.call("POST", f"/api/v1/projects/{pid}/alarm-rules", {
        "name": f"v5b2-{suffix}", "alarmType": "REUSE_V5B2", "deviceId": did,
        "propertyKey": "temperature", "triggerOperator": "GT", "triggerThreshold": 20,
        "triggerDurationSeconds": 0, "clearOperator": "LT", "clearThreshold": 10,
        "clearDurationSeconds": 0, "severity": "WARNING", "enabled": True}, 201)
    api.call("POST", f"/api/v1/projects/{pid}/alarm-rules/{checked_uuid(rule['id'])}/notification-bindings", {
        "groupId": gid, "templateId": checked_uuid(template["id"]),
        "channel": "EMAIL", "enabled": True}, 201)
    return subscription


def report(pkey, key, secret, message_id, body=None):
    if body is None:
        body = json.dumps({"messageId": checked_uuid(message_id),
            "occurredAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "payload": {"temperature": 28.5}}, separators=(",", ":")).encode()
    request = urllib.request.Request(DEVICE, body, {
        "Content-Type": "application/json", "X-TC-Device-Key": pkey + "/" + key,
        "X-TC-Device-Secret": secret}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=15,
                                    context=ssl._create_unverified_context()) as response:
            status, raw = response.status, response.read(4096)
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read(4096)
    except (urllib.error.URLError, TimeoutError):
        raise ProbeError("设备 HTTPS 网络失败") from None
    require(status == 202 and message_id in raw.decode("utf-8"),
            "设备 HTTPS 上报收据无效")
    return body


def source(pg, pid, day):
    pid = checked_uuid(pid)
    require(re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", day), "UTC 日期无效")
    start = f"'{day} 00:00:00+00'::timestamptz"
    end = f"({start} + interval '1 day')"
    sql = (f"SET app.project_id='{pid}'; SELECT "
           f"(SELECT count(*) FROM sys_usage_fact WHERE project_id='{pid}' "
           f"AND metric='REST_API_CALL' AND usage_date='{day}'),"
           f"(SELECT count(*) FROM alarm_notification_delivery WHERE project_id='{pid}' "
           f"AND created_at >= {start} AND created_at < {end}),"
           f"(SELECT count(*) FROM integ_webhook_delivery WHERE project_id='{pid}' "
           f"AND created_at >= {start} AND created_at < {end})")
    parts = db(pg, sql).split("|")
    require(len(parts) == 3 and all(re.fullmatch(r"[0-9]+", item) for item in parts),
            "UTC 源事实聚合无效")
    rest, alarm, webhook = map(int, parts)
    return {"REST_API_CALL": rest, "NOTIFICATION_DELIVERY": alarm + webhook,
            "alarm": alarm, "webhook": webhook}


def counter(pg, tenant, pid, day):
    tid, pid = checked_uuid(tenant), checked_uuid(pid)
    rows = db(pg, "SELECT metric || '|' || used_value FROM sys_usage_counter_daily "
              f"WHERE tenant_id='{tid}' AND project_id='{pid}' AND usage_date='{day}' "
              "AND metric IN ('REST_API_CALL','NOTIFICATION_DELIVERY')")
    values = dict.fromkeys(METRICS, 0)
    for row in rows.splitlines() if rows else ():
        metric, sep, used = row.partition("|")
        require(sep and metric in values and re.fullmatch(r"[0-9]+", used),
                "UTC 归并计数无效")
        values[metric] = int(used)
    return values


def wait_counters(pg, tenant, pid, day, timeout=150):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        facts = source(pg, pid, day)
        actual = counter(pg, tenant, pid, day)
        if all(actual[m] == facts[m] for m in METRICS):
            return facts, actual
        time.sleep(2)
    raise ProbeError("REST/通知 UTC 源事实与日计数未在有界时间内一致")


def delivery(pg, pid, message_id, subscription):
    pid, mid, sub = checked_uuid(pid), checked_uuid(message_id), checked_uuid(subscription)
    sql = (f"SET app.project_id='{pid}'; SELECT d.id, d.attempt_count, "
           "(SELECT count(*) FROM integ_webhook_attempt a WHERE a.delivery_id=d.id) "
           "FROM integ_webhook_delivery d JOIN integ_webhook_event e ON "
           "e.tenant_id=d.tenant_id AND e.project_id=d.project_id "
           "AND e.event_type=d.event_type AND e.event_id=d.event_id "
           f"WHERE d.project_id='{pid}' AND d.subscription_id='{sub}' "
           f"AND e.event_text::jsonb #>> '{{payload,sourceMessageId}}'='{mid}'")
    rows = db(pg, sql).splitlines()
    require(len(rows) <= 1, "Webhook 重复创建同一意图")
    if not rows:
        return None
    parts = rows[0].split("|")
    require(len(parts) == 3 and re.fullmatch(r"[0-9]+", parts[1])
            and re.fullmatch(r"[0-9]+", parts[2]), "Webhook 意图事实格式无效")
    return checked_uuid(parts[0]), int(parts[1]), int(parts[2])


def wait_deliveries(pg, pid, mid, subscription, timeout=75):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        webhook = delivery(pg, pid, mid, subscription)
        alarm = integer(pg, f"SET app.project_id='{checked_uuid(pid)}'; "
                        "SELECT count(*) FROM alarm_notification_delivery d "
                        "JOIN alarm_event e ON e.project_id=d.project_id AND e.id=d.alarm_event_id "
                        f"WHERE d.project_id='{pid}' AND e.source_message_id='{checked_uuid(mid)}'")
        if webhook and webhook[2] >= 1 and alarm == 1:
            return webhook
        time.sleep(1)
    raise ProbeError("Webhook/告警唯一投递意图未形成")


def quota(api, pid, day, limits, before, pg, tenant):
    # This GET itself is a billable business REST call. A reconciliation scan
    # may race it, so its snapshot can contain either the prior or new fact.
    response = api.call("GET", f"/api/v1/projects/{checked_uuid(pid)}/quota")
    after = source(pg, pid, day)
    require(after["REST_API_CALL"] == before["REST_API_CALL"] + 1,
            "配额 GET 未恰好新增一次 REST 事实")
    require(response.get("policyCode") == "NONCOMMERCIAL_TECHNICAL"
            and response.get("windowStart") == day + "T00:00:00Z",
            "配额策略或 UTC 窗口不符")
    for scope in ("project", "tenantSharedPool"):
        rows = {item["metric"]: item for item in response[scope]["dailyMetrics"]
                if item.get("metric") in METRICS}
        require(set(rows) == set(METRICS), "配额公开投影缺指标")
        for metric in METRICS:
            item = rows[metric]
            require(item["limit"] == limits[metric], "技术额度投影不符")
            low, high = before[metric], after[metric]
            require(low <= item["used"] <= high, "配额快照超出事实边界")
            require(item["remaining"] == max(0, limits[metric] - item["used"]),
                    "配额共享剩余计算不符")
    wait_counters(pg, tenant, pid, day)
    return after


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy-dir", required=True)
    parser.add_argument("--candidate-jar", required=True)
    parser.add_argument("--candidate-sha256", required=True)
    args = parser.parse_args()
    deploy = Path(args.deploy_dir).expanduser().resolve()
    jar = Path(args.candidate_jar).expanduser().resolve()
    pg, limits = preflight(deploy, jar, args.candidate_sha256)
    require(limits["REST_API_CALL"] >= 50 and limits["NOTIFICATION_DELIVERY"] >= 10,
            "本探针要求高容量基线；低额度边界须另行受控验证")
    day = datetime.now(timezone.utc).date()
    suffix = secrets.token_hex(5)
    api = Api()
    email, pid, pkey, tenant = setup(api, pg, suffix)
    did, key, secret = device_fixture(api, pid, suffix)
    subscription = notification_fixture(api, pid, did, email, suffix)
    mid = uuid7()
    body = report(pkey, key, secret, mid)
    first = wait_deliveries(pg, pid, mid, subscription)
    require(datetime.now(timezone.utc).date() == day, "探针穿越真实 UTC 午夜，须按跨日场景另验")
    facts, _ = wait_counters(pg, tenant, pid, day.isoformat())
    require(facts["alarm"] == 1 and facts["webhook"] == 1,
            "两种通知来源未各形成一个唯一意图")
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline and first[2] < 2:
        time.sleep(1)
        first = delivery(pg, pid, mid, subscription)
    require(first[2] >= 2, "Webhook 有界失败重试未发生")
    report(pkey, key, secret, mid, body)
    time.sleep(2)
    replay = delivery(pg, pid, mid, subscription)
    require(replay and replay[0] == first[0]
            and source(pg, pid, day.isoformat())["NOTIFICATION_DELIVERY"] == 2,
            "同消息重放或网络重试重复计入通知意图")
    before, _ = wait_counters(pg, tenant, pid, day.isoformat())
    after = quota(api, pid, day.isoformat(), limits, before, pg, tenant)
    require(datetime.now(timezone.utc).date() == day, "探针穿越真实 UTC 午夜")
    preflight(deploy, jar, args.candidate_sha256, limits)
    print(json.dumps({"result": "PASS", "candidateSha256": args.candidate_sha256,
                      "project": pid, "utcDay": day.isoformat(), "limits": limits,
                      "restFacts": after["REST_API_CALL"],
                      "notificationIntents": after["NOTIFICATION_DELIVERY"],
                      "alarmIntents": after["alarm"], "webhookIntents": after["webhook"],
                      "webhookAttempts": first[2],
                      "unverified": ["actual UTC midnight crossing",
                                     "REST daily hard-limit refusal",
                                     "notification degraded suppression"]}, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (ProbeError, KeyError, IndexError, TypeError, ValueError) as error:
        label = str(error) if isinstance(error, ProbeError) else "响应结构或本地输入无效"
        print(f"V5b-2 FAIL: {label}", file=sys.stderr)
        sys.exit(1)

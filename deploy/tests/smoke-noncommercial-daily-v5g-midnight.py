"""V5g real UTC midnight probe for all nine noncommercial daily metrics.

Use only an isolated, disposable stack and the same fixed candidate throughout.
Run ``prepare`` well before midnight, ``before`` at 23:45-23:55 UTC and
``after`` after 00:01 UTC on the next real day. Keep the app and database
containers running between before and after. State contains disposable account
and device credentials and must live outside the repository with mode 0600.
The state ownership/mode check requires POSIX Python; native Windows must add
an equivalent ACL check before use rather than bypassing this safety gate.

Optional REST hard-limit reset: after prepare, restart only the isolated app
with an external Compose override setting REST_API_CALL to the printed
``suggestedRestLimit``; retain every other limit and the same JAR. Pass
``--rest-reset`` to before and after. Before fills the day's REST usage with
quota GETs, checks a command write rejects without a command row, and after
checks the same kind of write is accepted under the new UTC window.

The probe deliberately does not change clocks, owner-provisioned automation
limits, quota policy rows, or external SMTP/HTTPS resources.
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
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
METRICS = ("UPLINK_MESSAGE", "DOWNLINK_MESSAGE", "UPLINK_BYTES", "TIME_SERIES_POINT",
           "REST_API_CALL", "NOTIFICATION_DELIVERY", "SCRIPT_EXECUTION",
           "AUTOMATION_EXECUTION", "SCRIPT_CPU_MILLIS")
DAY = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}\Z")
ENV = {"UPLINK_MESSAGE": "JAGONZN_TECHNICAL_DAILY_UPLINK_MESSAGE",
       "DOWNLINK_MESSAGE": "JAGONZN_TECHNICAL_DAILY_DOWNLINK_MESSAGE",
       "UPLINK_BYTES": "JAGONZN_TECHNICAL_DAILY_UPLINK_BYTES",
       "TIME_SERIES_POINT": "JAGONZN_TECHNICAL_DAILY_TIME_SERIES_POINT",
       "REST_API_CALL": "JAGONZN_TECHNICAL_DAILY_REST_API_CALL",
       "NOTIFICATION_DELIVERY": "JAGONZN_TECHNICAL_DAILY_NOTIFICATION_DELIVERY",
       "SCRIPT_EXECUTION": "JAGONZN_TECHNICAL_DAILY_SCRIPT_EXECUTION",
       "AUTOMATION_EXECUTION": "JAGONZN_TECHNICAL_DAILY_AUTOMATION_EXECUTION",
       "SCRIPT_CPU_MILLIS": "JAGONZN_TECHNICAL_DAILY_SCRIPT_CPU_MILLIS"}


def helper(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


b1 = helper("v5g_b1", "smoke-noncommercial-daily-v5b1.py")
b2 = helper("v5g_b2", "smoke-noncommercial-daily-v5b2.py")
c = helper("v5g_c", "smoke-noncommercial-daily-v5c.py")


def require(condition, message):
    b2.require(condition, message)


def now():
    return datetime.now(timezone.utc)


def day_now():
    return now().date().isoformat()


def checked_day(value):
    require(isinstance(value, str) and DAY.fullmatch(value), "UTC 日期无效")
    date.fromisoformat(value)
    return value


def set_ports(args):
    require(1 <= args.admin_port <= 65535 and 1 <= args.device_port <= 65535,
            "回环端口无效")
    b2.ADMIN = f"http://127.0.0.1:{args.admin_port}"
    b2.DEVICE = (f"https://127.0.0.1:{args.device_port}"
                 "/device-access/v1/property/report")


def db_clock(pg):
    host_before = time.time()
    value = b2.db(pg, "SELECT extract(epoch from clock_timestamp())::numeric(18,3) || '|' || "
                  "current_setting('TimeZone') || '|' || "
                  "to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')")
    host_after = time.time()
    fields = value.split("|")
    require(len(fields) == 3 and re.fullmatch(r"[0-9]+\.[0-9]{3}", fields[0]),
            "数据库 UTC 时钟格式无效")
    epoch = float(fields[0])
    require(host_before - 5 <= epoch <= host_after + 5,
            "主机与数据库时钟偏差超过五秒")
    return {"hostUtc": datetime.fromtimestamp(host_after, timezone.utc).isoformat(),
            "dbUtc": fields[2].replace(" ", "T") + "Z", "dbZone": fields[1],
            "dbDay": datetime.fromtimestamp(epoch, timezone.utc).date().isoformat()}


def app_clock(app):
    host_before = time.time()
    raw = b2.command("docker", "exec", app, "date", "-u", "+%s")
    host_after = time.time()
    require(re.fullmatch(r"[0-9]+", raw), "应用容器 UTC 时钟无效")
    epoch = int(raw)
    require(host_before - 5 <= epoch <= host_after + 5,
            "主机与应用容器时钟偏差超过五秒")
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat()


def preflight(args, expected_limits=None, identities=None):
    deploy = args.deploy_dir.expanduser().resolve()
    jar = args.candidate_jar.expanduser().resolve()
    pg, _ = b2.preflight(deploy, jar, args.candidate_sha256)
    app = b2.compose(deploy, "--profile", "app", "ps", "-q", "app")
    inspected = json.loads(b2.command("docker", "inspect", app, pg))
    require(len(inspected) == 2 and all(x["State"]["Running"] for x in inspected),
            "应用或数据库容器停止")
    by_id = {x["Id"]: x for x in inspected}
    require(app in by_id and pg in by_id, "容器身份读取不一致")
    values = {}
    for row in by_id[app]["Config"]["Env"]:
        key, separator, value = row.partition("=")
        if separator and key in set(ENV.values()) | {
                "JAGONZN_ENTITLEMENT_MODE", "THINGS_CLOUD_AUTOMATION_PROPERTY_ENABLED"}:
            require(key not in values, "权益配置键重复")
            values[key] = value
    require(values.get("JAGONZN_ENTITLEMENT_MODE") == "NONCOMMERCIAL"
            and values.get("THINGS_CLOUD_AUTOMATION_PROPERTY_ENABLED", "").lower() == "true",
            "运行模式或属性自动化开关不符")
    limits = {}
    for metric, key in ENV.items():
        raw = values.get(key, "")
        require(re.fullmatch(r"[1-9][0-9]*", raw), f"{metric} 日额度无效")
        limits[metric] = int(raw)
    owner = b2.db(pg, "SELECT entitlement_mode || '|' || automation_execution_daily_limit "
                  "FROM sys_deployment_automation_entitlement WHERE singleton")
    require(owner == f"NONCOMMERCIAL|{limits['AUTOMATION_EXECUTION']}",
            "owner 自动化限额与运行配置不符")
    require(all(limits[m] >= 10 for m in METRICS if m != "REST_API_CALL")
            and limits["UPLINK_BYTES"] >= 2048 and limits["REST_API_CALL"] >= 20,
            "九项日容量不足以完成探针")
    if expected_limits is not None:
        require(limits == expected_limits, "午夜前后运行容量发生改变")
    current_ids = {kind: {"id": cid, "startedAt": by_id[cid]["State"]["StartedAt"]}
                   for kind, cid in (("app", app), ("postgres", pg))}
    if identities is not None:
        require(current_ids == identities, "午夜前后应用或数据库容器被替换/重启")
    clock = db_clock(pg)
    clock["appUtc"] = app_clock(app)
    require(clock["dbDay"] == day_now(), "主机与数据库 UTC 日期不一致")
    return pg, limits, current_ids, clock


def save_new(path, state):
    require(not path.exists() and path.parent.is_dir(), "私有状态文件必须位于仓外且尚不存在")
    require(not path.is_symlink(), "私有状态路径不得为符号链接")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(state, stream, separators=(",", ":"), sort_keys=True)
        stream.write("\n")


def load(path, expected):
    require(path.is_file() and not path.is_symlink(), "私有状态文件不存在或为符号链接")
    metadata = path.stat()
    require(metadata.st_uid == os.getuid() and stat.S_IMODE(metadata.st_mode) == 0o600,
            "私有状态文件必须由当前用户拥有且权限 0600")
    state = json.loads(path.read_text(encoding="utf-8"))
    require(state.get("schema") == 1 and state.get("candidateSha256") == expected,
            "私有状态候选或结构不符")
    checked_day(state["dayD"])
    b2.checked_uuid(state["project"])
    b2.checked_uuid(state["tenant"])
    return state


def replace_state(path, state):
    temporary = path.with_name(path.name + ".tmp-" + secrets.token_hex(4))
    save_new(temporary, state)
    os.replace(temporary, path)


def login(api, state):
    status, raw = api.request("POST", "/api/v1/auth/login", {
        "email": state["email"], "password": state["password"]})
    if status != 200:
        try:
            error = json.loads(raw)
            code = error.get("code", error.get("errorCode"))
        except (ValueError, AttributeError, TypeError):
            code = None
        code = str(code) if code is not None else "unavailable"
        if not re.fullmatch(r"[0-9]{1,8}", code):
            code = "unavailable"
        raise b2.ProbeError(f"管理 API 登录状态 {status}，预期 200，响应错误码 {code}")
    try:
        token = json.loads(raw)
    except ValueError:
        raise b2.ProbeError("管理 API 登录响应 JSON 无效") from None
    api.token = token["accessToken"]
    selected = api.call("POST", "/api/v1/auth/switch-project", {
        "projectId": state["project"]})
    api.token = selected["accessToken"]


def fixture(api, pg, suffix):
    email = f"v5g-{suffix}@example.test"
    password = secrets.token_urlsafe(36)
    b2.register(api, email, password)
    verified = b2.integer(pg, "WITH verified AS (UPDATE sys_account SET email_verified_at=now() "
                          f"WHERE email='{email}' AND email_verified_at IS NULL RETURNING 1) "
                          "SELECT count(*) FROM verified")
    require(verified == 1, "一次性账号验证失败")
    token = api.call("POST", "/api/v1/auth/login", {"email": email, "password": password})
    api.token = token["accessToken"]
    project = api.call("POST", "/api/v1/projects", {
        "name": f"v5g-{suffix}", "region": "sh-1"})
    pid, pkey = b2.checked_uuid(project["id"]), project["projectKey"]
    tenant = b2.checked_uuid(b2.db(pg, f"SELECT tenant_id FROM sys_project WHERE id='{pid}'"))
    selected = api.call("POST", "/api/v1/auth/switch-project", {"projectId": pid})
    api.token = selected["accessToken"]
    type_path = f"/api/v1/projects/{pid}/device-types"
    dtype = api.call("POST", type_path, {
        "typeKey": f"v5g_{suffix}", "name": "V5g real UTC midnight",
        "deviceKind": "DIRECT", "payloadProtocol": "STANDARD", "networkType": "WIFI"}, 201)
    tid = b2.checked_uuid(dtype["id"])
    api.call("POST", f"{type_path}/{tid}/properties", {
        "propertyKey": "temperature", "name": "Temperature", "accessType": "REPORT",
        "dataType": "NUMBER", "unit": "C", "decimalPlaces": 1,
        "minimumValue": 0, "maximumValue": 100, "sortOrder": 0}, 201)
    api.call("POST", f"{type_path}/{tid}/commands", {
        "commandKey": "v5g_ping", "name": "V5g ping", "description": "UTC daily reset probe",
        "inputSchema": '{"type":"object"}', "outputSchema": '{"type":"object"}',
        "timeoutSeconds": 120, "sortOrder": 0}, 201)
    api.call("POST", f"{type_path}/{tid}/publish")
    dkey = f"v5g-{suffix}"
    created = api.call("POST", f"/api/v1/projects/{pid}/devices", {
        "deviceTypeId": tid, "deviceKey": dkey, "name": "V5g HTTP device"}, 201)
    did = b2.checked_uuid(created["id"])
    credential = api.call("POST", f"/api/v1/projects/{pid}/devices/{did}/credentials", expected=201)
    secret = credential.get("plainSecret")
    require(isinstance(secret, str) and secret, "设备秘密签发失败")
    access_path = f"/api/v1/projects/{pid}/devices/{did}/access-config"
    config = api.call("GET", access_path)
    if config["protocol"] != "HTTP" or not config["enabled"]:
        api.call("PUT", access_path, {"protocol": "HTTP", "enabled": True,
                                      "expectedConfigVersion": config["configVersion"]})
    rule_path = f"/api/v1/projects/{pid}/message-rules"
    rule = api.call("POST", rule_path, {
        "name": f"v5g-rule-{suffix}", "source": "input => input", "actions": []}, 201)
    rid = b2.checked_uuid(rule["id"])
    versions = api.call("GET", f"{rule_path}/{rid}/version-history")
    version = b2.checked_uuid(versions["items"][0]["id"])
    api.call("POST", f"{rule_path}/{rid}/versions/{version}/activate?expectedVersion=1")
    auto_path = f"/api/v1/projects/{pid}/automations"
    automation = api.call("POST", auto_path, {
        "name": f"v5g-auto-{suffix}", "triggerType": "PROPERTY_REPORTED",
        "triggerConfig": {"deviceId": did},
        "conditions": [{"nodeType": "payload-property-compare",
                        "config": {"pointer": "/temperature", "operator": "GT", "value": 100}}],
        "actions": [{"nodeType": "notification-action",
                     "config": {"channel": "EMAIL", "recipient": email}}]}, 201)
    aid = b2.checked_uuid(automation["id"])
    history = api.call("GET", f"{auto_path}/{aid}/version-history")
    aversion = b2.checked_uuid(history["items"][0]["id"])
    api.call("POST", f"{auto_path}/{aid}/versions/{aversion}/activate?expectedVersion=1")
    subscription = b2.notification_fixture(api, pid, did, email, suffix)
    return {"email": email, "password": password, "project": pid, "projectKey": pkey,
            "tenant": tenant, "device": did, "deviceKey": dkey, "deviceSecret": secret,
            "subscription": subscription}


def all_sources(pg, state, day):
    checked_day(day)
    pid = state["project"]
    telemetry = b1.source_usage(pg, pid, day)
    rest_notify = b2.source(pg, pid, day)
    rules = c.sources(pg, {**state, "utcDay": day})
    result = {**telemetry, **{m: rest_notify[m] for m in b2.METRICS}, **rules}
    require(set(result) == set(METRICS), "九项源事实不完整")
    return result, {"alarm": rest_notify["alarm"], "webhook": rest_notify["webhook"]}


def all_counters(pg, state, day):
    checked_day(day)
    rows = b2.db(pg, "SELECT metric || '|' || used_value FROM sys_usage_counter_daily "
                 f"WHERE tenant_id='{state['tenant']}' AND project_id='{state['project']}' "
                 f"AND usage_date='{day}' AND metric IN ("
                 + ",".join("'" + m + "'" for m in METRICS) + ")")
    values = dict.fromkeys(METRICS, 0)
    for line in rows.splitlines() if rows else ():
        metric, separator, amount = line.partition("|")
        require(separator and metric in values and re.fullmatch(r"[0-9]+", amount),
                "九项日计数行格式无效")
        values[metric] = int(amount)
    return values


def converge(pg, state, days, expected=None, seconds=180):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        sources = {day: all_sources(pg, state, day) for day in days}
        counters = {day: all_counters(pg, state, day) for day in days}
        if all(sources[day][0] == counters[day] for day in days) and (expected is None or
                all(sources[day][0] == expected[day] for day in days)):
            return sources
        time.sleep(2)
    raise b2.ProbeError("九项 UTC 源事实与日计数未在三分钟内收敛")


def quota(api, pg, state, day, limits):
    before = all_sources(pg, state, day)[0]
    counted = all_counters(pg, state, day)
    response = api.call("GET", f"/api/v1/projects/{state['project']}/quota")
    after = all_sources(pg, state, day)[0]
    require(after["REST_API_CALL"] == before["REST_API_CALL"] + 1,
            "配额读取未恰好增加一次 REST 事实")
    require(response.get("policyCode") == "NONCOMMERCIAL_TECHNICAL"
            and response.get("windowStart") == day + "T00:00:00Z",
            "公开配额 UTC 窗口不符")
    for scope in ("project", "tenantSharedPool"):
        rows = {item["metric"]: item for item in response[scope]["dailyMetrics"]
                if item.get("metric") in METRICS}
        require(set(rows) == set(METRICS), "公开配额未列齐九项指标")
        for metric in METRICS:
            item = rows[metric]
            require(item["limit"] == limits[metric]
                    and counted[metric] <= item["used"] <= after[metric]
                    and item["remaining"] == max(0, limits[metric] - item["used"]),
                    f"{scope} 的 {metric} 用量、容量或剩余值不符")
    return response


def send_report(pg, state, occurred_at, temperature):
    mid = b2.uuid7()
    body = json.dumps({"messageId": mid, "occurredAt": occurred_at,
                       "payload": {"temperature": temperature}},
                      separators=(",", ":")).encode()
    b2.report(state["projectKey"], state["deviceKey"], state["deviceSecret"], mid, body)
    b1.wait_message(pg, state["project"], mid, 1, len(body))
    return mid, len(body)


def command(api, pg, state, tag, expected=202):
    path = (f"/api/v1/projects/{state['project']}/devices/{state['device']}/commands")
    key = "v5g-" + tag + "-" + secrets.token_hex(8)
    body = {"commandKey": "v5g_ping", "input": {"phase": tag}}
    if expected == 202:
        answer = api.call("POST", path, body, 202, {"Idempotency-Key": key})
        cid = b2.checked_uuid(answer["id"])
        require(answer.get("status") == "ACCEPTED", "真实下行命令未受理")
        return cid
    before = b2.integer(pg, f"SET app.project_id='{state['project']}'; "
                        "SELECT count(*) FROM ts_device_command "
                        f"WHERE project_id='{state['project']}'")
    status, raw = api.request("POST", path, body, {"Idempotency-Key": key})
    try:
        parsed = json.loads(raw)
        code = parsed.get("code", parsed.get("errorCode"))
    except (ValueError, AttributeError, TypeError):
        code = None
    after = b2.integer(pg, f"SET app.project_id='{state['project']}'; "
                       "SELECT count(*) FROM ts_device_command "
                       f"WHERE project_id='{state['project']}'")
    require(status == expected and str(code) == "10029" and after == before,
            "REST 硬限写请求未拒绝或新增了命令副作用")
    return None


def wait_command(pg, cid, state, day):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        source = b1.source_usage(pg, state["project"], day)
        rows = b2.integer(pg, f"SET app.project_id='{state['project']}'; "
                          "SELECT count(*) FROM ts_device_command "
                          f"WHERE id='{b2.checked_uuid(cid)}' AND project_id='{state['project']}'")
        if rows == 1 and source["DOWNLINK_MESSAGE"] >= 1:
            return
        time.sleep(1)
    raise b2.ProbeError("下行命令源事实未在一分钟内形成")


def wait_webhook(pg, state, mid):
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        row = b2.delivery(pg, state["project"], mid, state["subscription"])
        if row is not None:
            return row
        time.sleep(1)
    raise b2.ProbeError("Webhook 唯一投递意图未形成")


def wait_alarm(pg, state, mid):
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        count = b2.integer(pg, f"SET app.project_id='{state['project']}'; "
                           "SELECT count(*) FROM alarm_notification_delivery d "
                           "JOIN alarm_event e ON e.project_id=d.project_id "
                           "AND e.id=d.alarm_event_id "
                           f"WHERE d.project_id='{state['project']}' "
                           f"AND e.source_message_id='{b2.checked_uuid(mid)}'")
        if count == 1:
            return
        time.sleep(1)
    raise b2.ProbeError("告警通知唯一投递意图未形成")


def wait_alarm_clear(pg, state, mid):
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        count = b2.integer(pg, f"SET app.project_id='{state['project']}'; "
                           "SELECT count(*) FROM alarm_event "
                           f"WHERE project_id='{state['project']}' "
                           f"AND source_message_id='{b2.checked_uuid(mid)}' "
                           "AND event_type='CLEARED'")
        if count == 1:
            return
        time.sleep(1)
    raise b2.ProbeError("迟到低温报告未清除 D 日活动告警")


def message_timestamps(pg, state, mid):
    pid = state["project"]
    raw = b2.db(pg, f"SET app.project_id='{pid}'; SELECT "
                "to_char(i.received_at AT TIME ZONE 'UTC','YYYY-MM-DD'),"
                "to_char(p.ts AT TIME ZONE 'UTC','YYYY-MM-DD'),"
                "to_char(l.received_at AT TIME ZONE 'UTC','YYYY-MM-DD') "
                "FROM sys_inbox_message i JOIN ts_property_point p "
                "ON p.project_id=i.project_id AND p.message_id=i.message_id "
                "JOIN ts_device_message_log l ON l.project_id=i.project_id "
                "AND l.message_id=i.message_id AND l.direction='UP' "
                f"WHERE i.project_id='{pid}' AND i.message_id='{b2.checked_uuid(mid)}'")
    fields = raw.split("|")
    require(len(fields) == 3 and all(DAY.fullmatch(item) for item in fields),
            "上行 inbox/点/原始日志 UTC 时间事实无效")
    return fields


def prepare(args):
    pg, limits, _, clock = preflight(args)
    require(limits["REST_API_CALL"] >= 100 and all(v >= 100 for v in limits.values()),
            "准备阶段需要高容量九指标，不能使用边界覆盖")
    suffix = secrets.token_hex(5)
    api = b2.Api()
    data = fixture(api, pg, suffix)
    day = day_now()
    require(day == clock["dbDay"] == db_clock(pg)["dbDay"], "准备阶段穿越 UTC 日期")
    facts = converge(pg, data, (day,))[day][0]
    require(facts["NOTIFICATION_DELIVERY"] == 0 and facts["SCRIPT_EXECUTION"] == 0,
            "准备阶段意外触发通知或规则")
    suggested = facts["REST_API_CALL"] + 30
    state = {**data, "schema": 1, "candidateSha256": args.candidate_sha256,
             "dayD": day, "phase": "prepared", "suggestedRestLimit": suggested,
             "prepareRestUsed": facts["REST_API_CALL"]}
    save_new(args.state_file, state)
    print(json.dumps({"result": "PREPARED", "dayD": day, "project": data["project"],
                      "candidateSha256": args.candidate_sha256,
                      "suggestedRestLimit": suggested, "statePath": str(args.state_file),
                      "hostUtc": clock["hostUtc"], "dbUtc": clock["dbUtc"]}, sort_keys=True))


def check_before_window(day):
    instant = now()
    require(instant.date().isoformat() == day and instant.hour == 23
            and 45 <= instant.minute <= 55,
            "before 必须于准备日真实 UTC 23:45-23:55 启动")


def check_after_window(day):
    next_day = (date.fromisoformat(day) + timedelta(days=1)).isoformat()
    instant = now()
    require(instant.date().isoformat() == next_day and instant.hour == 0
            and 1 <= instant.minute <= 20,
            "after 必须在次日真实 UTC 00:01-00:20 启动")
    return next_day


def before(args):
    state = load(args.state_file, args.candidate_sha256)
    require(state["phase"] == "prepared", "before 阶段不可重跑或顺序错误")
    check_before_window(state["dayD"])
    pg, limits, identities, clock = preflight(args)
    require(clock["dbDay"] == state["dayD"], "数据库尚未处于 D 日")
    require(not args.rest_reset or limits["REST_API_CALL"] == state["suggestedRestLimit"],
            "REST 重置分支须先应用准备阶段打印的外部低额度覆盖")
    api = b2.Api()
    login(api, state)
    day = state["dayD"]
    baseline = converge(pg, state, (day,))[day][0]
    mid, raw_bytes = send_report(pg, state, now().isoformat().replace("+00:00", "Z"), 28.5)
    c.wait_event(pg, {**state, "utcDay": day}, mid, "1|0|1", timeout=120)
    wait_webhook(pg, state, mid)
    wait_alarm(pg, state, mid)
    cid = command(api, pg, state, "before")
    wait_command(pg, cid, state, day)
    converge(pg, state, (day,))
    quota(api, pg, state, day, limits)
    facts = converge(pg, state, (day,))[day][0]
    require(facts["UPLINK_MESSAGE"] == baseline["UPLINK_MESSAGE"] + 1
            and facts["DOWNLINK_MESSAGE"] == baseline["DOWNLINK_MESSAGE"] + 1
            and facts["UPLINK_BYTES"] == baseline["UPLINK_BYTES"] + raw_bytes
            and facts["TIME_SERIES_POINT"] == baseline["TIME_SERIES_POINT"] + 1
            and facts["NOTIFICATION_DELIVERY"] == baseline["NOTIFICATION_DELIVERY"] + 2
            and facts["SCRIPT_EXECUTION"] == baseline["SCRIPT_EXECUTION"] + 1
            and facts["AUTOMATION_EXECUTION"] == baseline["AUTOMATION_EXECUTION"] + 1
            and facts["SCRIPT_CPU_MILLIS"] > baseline["SCRIPT_CPU_MILLIS"]
            and facts["REST_API_CALL"] > baseline["REST_API_CALL"],
            "午夜前九指标真实增量不符")
    require(message_timestamps(pg, state, mid) == [day, day, day],
            "午夜前上报时间归属不符")
    if args.rest_reset:
        target = limits["REST_API_CALL"]
        require(facts["REST_API_CALL"] < target, "REST 覆盖未给午夜前动作留余量")
        while facts["REST_API_CALL"] < target:
            time.sleep(1.0)
            api.call("GET", f"/api/v1/projects/{state['project']}/quota")
            facts = all_sources(pg, state, day)[0]
        require(facts["REST_API_CALL"] == target, "REST 当日用量未精确到硬限")
        converge(pg, state, (day,))
        command(api, pg, state, "before-hard", expected=429)
        visible = quota(api, pg, state, day, limits)
        require(next(item for item in visible["tenantSharedPool"]["dailyMetrics"]
                     if item["metric"] == "REST_API_CALL")["status"] == "HARD_LIMIT",
                "REST 硬限状态未展示")
        facts = converge(pg, state, (day,))[day][0]
        require(facts["REST_API_CALL"] == target + 1,
                "REST 拒绝不得计量，硬限后的配额读取应继续计量")
    require(now().date().isoformat() == day and db_clock(pg)["dbDay"] == day,
            "before 阶段越过真实 UTC 午夜")
    _, stable_limits, stable_ids, final_clock = preflight(args, limits, identities)
    require(stable_limits == limits and stable_ids == identities, "午夜前容器或容量漂移")
    state.update({"phase": "before", "restReset": args.rest_reset, "limits": limits,
                  "identities": identities, "before": facts, "beforeBaseline": baseline,
                  "beforeMessage": mid, "beforeCommand": cid,
                  "beforeClock": final_clock})
    replace_state(args.state_file, state)
    print(json.dumps({"result": "BEFORE_PASS", "dayD": day, "project": state["project"],
                      "candidateSha256": args.candidate_sha256, "limits": limits,
                      "sourceAndCounter": facts, "containerIdentities": identities,
                      "hostUtc": final_clock["hostUtc"], "dbUtc": final_clock["dbUtc"],
                      "restHardRejected": args.rest_reset}, sort_keys=True))


def after(args):
    state = load(args.state_file, args.candidate_sha256)
    require(state["phase"] == "before" and state["restReset"] == args.rest_reset,
            "after 阶段顺序或 REST 重置分支与 before 不符")
    next_day = check_after_window(state["dayD"])
    pg, limits, identities, clock = preflight(args, state["limits"], state["identities"])
    require(clock["dbDay"] == next_day, "数据库尚未真实换至 D+1 日")
    zero = dict.fromkeys(METRICS, 0)
    require(all_sources(pg, state, next_day)[0] == zero
            and all_counters(pg, state, next_day) == zero,
            "D+1 首笔业务写入前九项窗口不为零")
    api = b2.Api()
    login(api, state)
    require(all_sources(pg, state, next_day)[0] == zero
            and all_counters(pg, state, next_day) == zero,
            "登录与项目切换意外计入 D+1 九项用量")
    # The first business write in the new window proves the old REST hard
    # limit is no longer rejecting, if that optional branch was selected.
    cid = command(api, pg, state, "after")
    wait_command(pg, cid, state, next_day)
    before_d = state["before"]
    prior = converge(pg, state, (state["dayD"], next_day))
    require(prior[state["dayD"]][0] == before_d,
            "D 日其他来源在午夜后、迟到报告前发生漂移")
    # Clear the still-active D alarm using a D+1 receipt but a D 23:59
    # occurrence. Then raise it again with a current D+1 occurrence.
    late_occurred = state["dayD"] + "T23:59:00Z"
    late_mid, late_bytes = send_report(pg, state, late_occurred, 5.0)
    c.wait_event(pg, {**state, "utcDay": next_day}, late_mid, "1|0|1", timeout=120)
    wait_webhook(pg, state, late_mid)
    wait_alarm_clear(pg, state, late_mid)
    high_mid, high_bytes = send_report(pg, state, now().isoformat().replace("+00:00", "Z"), 28.5)
    c.wait_event(pg, {**state, "utcDay": next_day}, high_mid, "1|0|1", timeout=120)
    wait_webhook(pg, state, high_mid)
    wait_alarm(pg, state, high_mid)
    converge(pg, state, (state["dayD"], next_day))
    quota(api, pg, state, next_day, limits)
    final = converge(pg, state, (state["dayD"], next_day))
    d, d1 = final[state["dayD"]][0], final[next_day][0]
    require(message_timestamps(pg, state, late_mid) ==
            [next_day, state["dayD"], next_day],
            "迟到报告的接收日与点发生日未分离")
    require(message_timestamps(pg, state, high_mid) == [next_day] * 3,
            "D+1 正常报告时间归属不符")
    require(all(d[m] == before_d[m] for m in METRICS if m != "TIME_SERIES_POINT")
            and d["TIME_SERIES_POINT"] == before_d["TIME_SERIES_POINT"] + 1,
            "迟到点之外 D 日计数发生变化")
    require(d1["UPLINK_MESSAGE"] == 2 and d1["DOWNLINK_MESSAGE"] == 1
            and d1["UPLINK_BYTES"] == late_bytes + high_bytes
            and d1["TIME_SERIES_POINT"] == 1
            and d1["NOTIFICATION_DELIVERY"] == 3
            and d1["SCRIPT_EXECUTION"] == 2
            and d1["AUTOMATION_EXECUTION"] == 2
            and d1["SCRIPT_CPU_MILLIS"] > 0
            and d1["REST_API_CALL"] > 0,
            "D+1 九指标真实来源与窗口重置不符")
    require(db_clock(pg)["dbDay"] == next_day and day_now() == next_day,
            "after 阶段越过 D+1 日")
    preflight(args, limits, identities)
    state.update({"phase": "after", "dayD1": next_day, "afterD": d,
                  "afterD1": d1, "lateMessage": late_mid, "afterMessage": high_mid,
                  "afterCommand": cid, "afterClock": clock})
    replace_state(args.state_file, state)
    print(json.dumps({"result": "AFTER_PASS", "dayD": state["dayD"],
                      "dayD1": next_day, "project": state["project"],
                      "candidateSha256": args.candidate_sha256,
                      "sourceAndCounterD": d, "sourceAndCounterD1": d1,
                      "restHardResetVerified": args.rest_reset,
                      "containerIdentities": identities,
                      "hostUtc": clock["hostUtc"], "dbUtc": clock["dbUtc"]}, sort_keys=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("prepare", "before", "after"))
    parser.add_argument("--deploy-dir", required=True, type=Path)
    parser.add_argument("--candidate-jar", required=True, type=Path)
    parser.add_argument("--candidate-sha256", required=True)
    parser.add_argument("--state-file", required=True, type=Path,
                        help="仓库外、当前用户拥有、0600 的私有状态文件")
    parser.add_argument("--admin-port", type=int, default=28080)
    parser.add_argument("--device-port", type=int, default=28443)
    parser.add_argument("--rest-reset", action="store_true",
                        help="before/after: 同配置的 REST 硬限拒绝与新日恢复")
    args = parser.parse_args()
    require(os.name == "posix" and hasattr(os, "getuid"),
            "状态文件属主和 0600 权限校验仅支持 POSIX；Windows 原生环境须先提供等价 ACL 校验")
    set_ports(args)
    require(not args.state_file.expanduser().resolve().is_relative_to(HERE.parents[2]),
            "私有状态文件须位于仓库外")
    args.state_file = args.state_file.expanduser().absolute()
    require(b2.SHA.fullmatch(args.candidate_sha256), "固定候选 SHA-256 无效")
    if args.phase == "prepare":
        require(not args.rest_reset, "prepare 不接受 --rest-reset")
        prepare(args)
    elif args.phase == "before":
        before(args)
    else:
        after(args)


if __name__ == "__main__":
    try:
        main()
    except (b2.ProbeError, KeyError, IndexError, TypeError, ValueError,
            OSError) as error:
        label = str(error) if isinstance(error, b2.ProbeError) else "本地输入或响应结构无效"
        print(f"V5g FAIL: {label}", file=sys.stderr)
        sys.exit(1)

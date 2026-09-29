"""V5b-1 disposable, fixed-candidate noncommercial daily telemetry probe.

Run with Python 3.11+ against the isolated jagonzn stack after V5a-2. This
creates one disposable tenant, two projects and five devices. It uses the
existing MQTT, TCP and CoAP device clients in this directory. The source JAR,
running JAR and selected entitlement values are checked before and after.

The probe checks real protocol ingress, identical-message replay, a late
device timestamp, one MQTT command with three delivery attempts, source facts,
the asynchronous daily counter and the current-day quota API. It does not
claim an actual midnight crossing or a limit+1 synchronous rejection. It
never prints credentials, JWTs, request bodies or database error output.
"""

import argparse
import hashlib
import http.cookiejar
import json
import re
import secrets
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
ADMIN = "http://127.0.0.1:18080"
DEVICE = "https://127.0.0.1:18443"
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")
SHA = re.compile(r"[0-9a-f]{64}\Z")
METRICS = ("UPLINK_MESSAGE", "DOWNLINK_MESSAGE", "UPLINK_BYTES", "TIME_SERIES_POINT")
ENV = {
    "UPLINK_MESSAGE": "JAGONZN_TECHNICAL_DAILY_UPLINK_MESSAGE",
    "DOWNLINK_MESSAGE": "JAGONZN_TECHNICAL_DAILY_DOWNLINK_MESSAGE",
    "UPLINK_BYTES": "JAGONZN_TECHNICAL_DAILY_UPLINK_BYTES",
    "TIME_SERIES_POINT": "JAGONZN_TECHNICAL_DAILY_TIME_SERIES_POINT",
}
COAP_JARS = (
    "org/eclipse/californium/californium-core/3.14.0/californium-core-3.14.0.jar",
    "org/eclipse/californium/element-connector/3.14.0/element-connector-3.14.0.jar",
    "org/eclipse/californium/scandium/3.14.0/scandium-3.14.0.jar",
    "org/slf4j/slf4j-api/2.0.18/slf4j-api-2.0.18.jar",
)


class ProbeError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ProbeError(message)


def checked_uuid(value):
    require(isinstance(value, str) and UUID.fullmatch(value), "业务 ID 格式错误")
    return value


def uuid7():
    millis = int(time.time() * 1000)
    value = (millis << 80) | secrets.randbits(80)
    value = (value & ~(0xF << 76)) | (7 << 76)
    value = (value & ~(0x3 << 62)) | (0x2 << 62)
    return str(uuid.UUID(int=value))


def utc_now():
    return datetime.now(timezone.utc)


def stamp(value):
    return value.isoformat().replace("+00:00", "Z")


def command(*argv, input_text=None, timeout=60):
    try:
        result = subprocess.run(argv, input=input_text, capture_output=True,
                                text=True, check=False, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise ProbeError("本机探针依赖命令无法完成") from None
    require(result.returncode == 0, "本机探针依赖命令失败")
    return result.stdout.strip()


def compose(deploy, *args):
    return command("docker", "compose", "--env-file", str(deploy / ".env.local"),
                   "-f", str(deploy / "compose.yml"), *args)


def file_sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def preflight(deploy, jar, expected, prior=None):
    require(deploy != HERE.parent and (deploy / "compose.yml").is_file()
            and (deploy / ".env.local").is_file(), "须使用源码外独立部署目录")
    require(SHA.fullmatch(expected) and jar.is_file() and file_sha(jar) == expected,
            "宿主固定候选 JAR 摘要不符")
    app = compose(deploy, "--profile", "app", "ps", "-q", "app")
    pg = compose(deploy, "ps", "-q", "postgres")
    require(app and pg, "独立 app 或 PostgreSQL 容器未运行")
    digest = command("docker", "exec", app, "sha256sum", "/app/jagonzn-service.jar")
    require(digest.split() and digest.split()[0] == expected, "运行 JAR 摘要不符")
    inspected = json.loads(command("docker", "inspect", app))
    require(len(inspected) == 1 and inspected[0]["State"]["Running"], "app 容器状态无效")
    names = set(ENV.values()) | {"JAGONZN_ENTITLEMENT_MODE"}
    values = {}
    for entry in inspected[0]["Config"]["Env"]:
        name, separator, value = entry.partition("=")
        if separator and name in names:
            require(name not in values, "权益环境变量重复")
            values[name] = value
    require(values.get("JAGONZN_ENTITLEMENT_MODE") == "NONCOMMERCIAL",
            "运行容器非 NONCOMMERCIAL")
    limits = {}
    for metric, name in ENV.items():
        value = values.get(name, "")
        require(re.fullmatch(r"[1-9][0-9]*", value), "四项日容量缺失或非正整数")
        limits[metric] = int(value)
    if prior is not None:
        require(limits == prior, "探针期间四项运行容量改变")
    return app, pg, limits


def db(pg, sql):
    # SQL values below are generated from checked UUIDs or restricted dates.
    return command("docker", "exec", pg, "psql", "-U", "jagonzn", "-d", "jagonzn",
                   "-v", "ON_ERROR_STOP=1", "-Atqc", sql)


def db_int(pg, sql):
    result = db(pg, sql)
    require(re.fullmatch(r"[0-9]+", result), "数据库聚合数值无效")
    return int(result)


def owner(pg, project):
    return checked_uuid(db(pg, f"SELECT tenant_id FROM sys_project WHERE id='{checked_uuid(project)}'"))


class Api:
    def __init__(self):
        self.token = ""
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.last_request = 0.0

    def call(self, method, path, data=None, expected=200, headers=None):
        request_headers = dict(headers or {})
        if self.token:
            request_headers["Authorization"] = "Bearer " + self.token
        body = None
        if data is not None:
            body = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()
            request_headers["Content-Type"] = "application/json"
        for attempt in range(5):
            delay = 0.4 - (time.monotonic() - self.last_request)
            if delay > 0:
                time.sleep(delay)
            self.last_request = time.monotonic()
            request = urllib.request.Request(ADMIN + path, body, request_headers, method=method)
            try:
                with self.opener.open(request, timeout=15) as response:
                    status, raw = response.status, response.read(65536)
            except urllib.error.HTTPError as error:
                status, raw = error.code, error.read(4096)
                if status == 429 and attempt < 4:
                    try:
                        parsed = json.loads(raw)
                        code = parsed.get("code", parsed.get("errorCode"))
                    except (ValueError, AttributeError, TypeError):
                        code = None
                    if str(code) == "10029":
                        time.sleep(1.2)
                        continue
            except (urllib.error.URLError, TimeoutError):
                raise ProbeError("管理 API 网络失败") from None
            require(status == expected, f"管理 API {method} {path} 状态 {status}，预期 {expected}")
            if not raw:
                return None
            try:
                return json.loads(raw)
            except ValueError:
                raise ProbeError("管理 API 响应 JSON 无效") from None
        raise ProbeError("管理 API 原有限流窗口未恢复")


def setup(api, pg, suffix):
    email = f"v5b1-{suffix}@example.test"
    password = secrets.token_urlsafe(36)
    api.call("POST", "/api/v1/auth/register", {"email": email, "password": password}, 204)
    changed = db_int(pg, "WITH verified AS (UPDATE sys_account SET email_verified_at=now() "
                     f"WHERE email='{email}' AND email_verified_at IS NULL RETURNING 1) "
                     "SELECT count(*) FROM verified")
    require(changed == 1, "一次性账号验证失败")
    login = api.call("POST", "/api/v1/auth/login", {"email": email, "password": password})
    require(isinstance(login, dict) and isinstance(login.get("accessToken"), str), "登录失败")
    api.token = login["accessToken"]
    projects = []
    for ordinal in (1, 2):
        project = api.call("POST", "/api/v1/projects", {
            "name": f"v5b1-{suffix}-{ordinal}", "region": "sh-1"})
        projects.append((checked_uuid(project["id"]), project["projectKey"]))
    require(owner(pg, projects[0][0]) == owner(pg, projects[1][0]), "项目不属于同一租户")
    devices = {}
    for ordinal, (pid, _) in enumerate(projects, 1):
        switched = api.call("POST", "/api/v1/auth/switch-project", {"projectId": pid})
        api.token = switched["accessToken"]
        dtype = api.call("POST", f"/api/v1/projects/{pid}/device-types", {
            "typeKey": f"v5b1_{suffix}_{ordinal}", "name": "V5b1 daily probe",
            "deviceKind": "DIRECT", "payloadProtocol": "STANDARD", "networkType": "WIFI"}, 201)
        tid = checked_uuid(dtype["id"])
        for key in ("temperature", "humidity"):
            api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/properties", {
                "propertyKey": key, "name": key, "accessType": "REPORT", "dataType": "NUMBER",
                "unit": "C" if key == "temperature" else "%", "decimalPlaces": 1,
                "minimumValue": 0, "maximumValue": 100, "sortOrder": 0}, 201)
        if ordinal == 1:
            api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/commands", {
                "commandKey": "v5b1_ping", "name": "V5b1 ping", "description": "Quota retry probe",
                "inputSchema": '{"type":"object"}', "outputSchema": '{"type":"object"}',
                "timeoutSeconds": 8, "sortOrder": 0}, 201)
        api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/publish")
        protocols = ("HTTP", "MQTT", "TCP", "COAP") if ordinal == 1 else ("HTTP",)
        for protocol in protocols:
            key = f"v5b1-{protocol.lower()}-{suffix}-{ordinal}"
            created = api.call("POST", f"/api/v1/projects/{pid}/devices", {
                "deviceTypeId": tid, "deviceKey": key, "name": f"V5b1 {protocol}"}, 201)
            did = checked_uuid(created["id"])
            credential = api.call("POST", f"/api/v1/projects/{pid}/devices/{did}/credentials",
                                  expected=201)
            require(isinstance(credential.get("plainSecret"), str), "设备凭据创建失败")
            route = f"/api/v1/projects/{pid}/devices/{did}/access-config"
            config = api.call("GET", route)
            if config["protocol"] != protocol or not config["enabled"]:
                api.call("PUT", route, {"protocol": protocol, "enabled": True,
                                        "expectedConfigVersion": config["configVersion"]})
            devices[(ordinal, protocol)] = {"id": did, "key": key,
                                             "secret": credential["plainSecret"]}
    return projects, devices


def payload(message_id, occurred_at, properties):
    return {"messageId": message_id, "occurredAt": stamp(occurred_at), "payload": properties}


def http_report(project_key, device, report):
    raw = json.dumps(report, separators=(",", ":")).encode()
    request = urllib.request.Request(DEVICE + "/device-access/v1/property/report", raw, {
        "Content-Type": "application/json", "X-TC-Device-Key": project_key + "/" + device["key"],
        "X-TC-Device-Secret": device["secret"]}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=15,
                                    context=ssl._create_unverified_context()) as response:
            status = response.status
            body = response.read(4096)
    except urllib.error.HTTPError as error:
        status, body = error.code, error.read(4096)
    except (urllib.error.URLError, TimeoutError):
        raise ProbeError("设备 HTTPS 上报网络失败") from None
    require(status == 202, f"设备 HTTPS 上报状态 {status}，预期 202")
    require(report["messageId"] in body.decode("utf-8"), "设备 HTTPS 上报收据不匹配")
    return len(raw)


def helper_report(filename, request):
    source = HERE / filename
    require(source.is_file(), "设备协议客户端缺失")
    command(sys.executable, str(source), input_text=json.dumps(request), timeout=30)


def mqtt_report(project_key, device, report):
    raw = json.dumps(report, separators=(",", ":"))
    helper_report("smoke_mqtt.py", {
        "host": "127.0.0.1", "port": 21883, "clientId": "v5b1-" + secrets.token_hex(8),
        "username": project_key + "/" + device["key"], "password": device["secret"],
        "topic": f"tc/v1/{project_key}/{device['key']}/up/property/report", "payload": raw})
    return len(raw.encode())


def tcp_report(project_key, device, report):
    helper_report("smoke_tcp.py", {
        "host": "127.0.0.1", "port": 18883, "projectKey": project_key,
        "deviceKey": device["key"], "password": device["secret"], "payload": report})
    return len(json.dumps(report, separators=(",", ":")).encode())


class CoapClient:
    def __init__(self, app, maven_repo, deploy):
        self.app = app
        self.work = tempfile.TemporaryDirectory(prefix="v5b1-coap-")
        self.root = Path(self.work.name)
        libs = self.root / "lib"
        libs.mkdir()
        repo = Path(maven_repo).expanduser().resolve()
        jars = [repo / part for part in COAP_JARS]
        require(all(jar.is_file() for jar in jars), "CoAP 探针 Maven 依赖缺失")
        for jar in jars:
            shutil.copy2(jar, libs / jar.name)
        require((HERE / "SmokeCoap.java").is_file(), "CoAP 属性辅助程序缺失")
        command("javac", "-cp", str(libs / "*"), "-d", str(self.root),
                str(HERE / "SmokeCoap.java"))
        self.certs = deploy / "certs.local"
        require((self.certs / "device.crt").is_file()
                and (self.certs / "device.key").is_file(), "CoAP 本机证书缺失")

    def report(self, project_key, device, report):
        # Existing SmokeCoap.java has a frozen, single-temperature report body.
        require(report["payload"] == {"temperature": 31.5}, "CoAP 辅助程序载荷不匹配")
        fields = (project_key, device["key"], device["secret"],
                  report["messageId"], report["occurredAt"])
        output = command("docker", "run", "--rm", "-i", "--network", f"container:{self.app}",
                         "-v", f"{self.root}:/work:ro", "-v", f"{self.certs}:/certs:ro",
                         "eclipse-temurin:21-jre", "java", "-cp", "/work:/work/lib/*",
                         "SmokeCoap", "/certs", input_text="\n".join(fields) + "\n", timeout=75)
        require("2.04 Changed acceptance passed" in output, "CoAP/DTLS 上报未受理")
        raw = (f'{{"messageId":"{report["messageId"]}","occurredAt":"{report["occurredAt"]}",'
               '"payload":{"temperature":31.5}}').encode()
        return len(raw)

    def close(self):
        self.work.cleanup()


def message_fact(pg, project, message_id):
    pid, mid = checked_uuid(project), checked_uuid(message_id)
    sql = (f"SET app.project_id='{pid}'; SELECT "
           "(SELECT count(*) FROM sys_inbox_message WHERE message_id='" + mid + "'),"
           "(SELECT count(*) FROM ts_device_message_log WHERE message_id='" + mid + "' AND direction='UP'),"
           "(SELECT coalesce(sum(raw_bytes),0) FROM ts_device_message_log WHERE message_id='" + mid + "' AND direction='UP'),"
           "(SELECT count(*) FROM ts_property_point WHERE message_id='" + mid + "')")
    values = db(pg, sql).split("|")
    require(len(values) == 4 and all(re.fullmatch(r"[0-9]+", item) for item in values),
            "上行持久事实格式无效")
    return tuple(map(int, values))


def wait_message(pg, project, message_id, points, raw_bytes):
    deadline = time.monotonic() + 35
    while time.monotonic() < deadline:
        fact = message_fact(pg, project, message_id)
        if fact == (1, 1, raw_bytes, points):
            return
        time.sleep(0.5)
    raise ProbeError("上行 inbox、日志字节或时序点事实未按预期落库")


def source_usage(pg, project, day):
    pid = checked_uuid(project)
    require(re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", day), "UTC 日期无效")
    start = f"'{day} 00:00:00+00'::timestamptz"
    end = f"({start} + interval '1 day')"
    # Every source is filtered by its own authoritative timestamp, never by
    # the time at which this probe happens to query the reconciliation table.
    def window(column):
        return f"{column} >= {start} AND {column} < {end}"
    sql = (f"SET app.project_id='{pid}'; SELECT "
           f"(SELECT count(*) FROM sys_inbox_message WHERE project_id='{pid}' AND {window('received_at')}),"
           f"(SELECT count(*) FROM ts_device_command WHERE project_id='{pid}' AND {window('accepted_at')}),"
           f"(SELECT coalesce(sum(raw_bytes),0) FROM ts_device_message_log WHERE project_id='{pid}' "
           f"AND direction='UP' AND {window('received_at')}),"
           f"(SELECT count(*) FROM ts_property_point WHERE project_id='{pid}' AND {window('ts')})")
    parts = db(pg, sql).split("|")
    require(len(parts) == 4 and all(re.fullmatch(r"[0-9]+", part) for part in parts),
            "源事实日聚合格式无效")
    return dict(zip(METRICS, map(int, parts)))


def counter_usage(pg, tenant, project, day):
    tid, pid = checked_uuid(tenant), checked_uuid(project)
    require(re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", day), "UTC 日期无效")
    rows = db(pg, "SELECT metric || '|' || used_value FROM sys_usage_counter_daily "
              f"WHERE tenant_id='{tid}' AND project_id='{pid}' AND usage_date='{day}' "
              "AND metric IN ('UPLINK_MESSAGE','DOWNLINK_MESSAGE','UPLINK_BYTES','TIME_SERIES_POINT')")
    result = dict.fromkeys(METRICS, 0)
    for row in rows.splitlines() if rows else ():
        metric, separator, value = row.partition("|")
        require(separator and metric in result and re.fullmatch(r"[0-9]+", value),
                "归并计数行无效")
        result[metric] = int(value)
    return result


def wait_counters(pg, tenant, projects, days, seconds=150):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        expected = {(pid, day): source_usage(pg, pid, day) for pid in projects for day in days}
        actual = {(pid, day): counter_usage(pg, tenant, pid, day) for pid in projects for day in days}
        if actual == expected:
            return expected
        time.sleep(2)
    raise ProbeError("UTC 日源事实与异步归并计数未在有界时间内一致")


def quota(api, project, limits, expected_project, expected_tenant, day):
    response = api.call("GET", f"/api/v1/projects/{checked_uuid(project)}/quota")
    require(response.get("policyCode") == "NONCOMMERCIAL_TECHNICAL", "额度展示非技术模式")
    require(response.get("windowStart") == day + "T00:00:00Z", "配额 UTC 窗口错误")
    def indexed(scope):
        return {item["metric"]: item for item in response[scope]["dailyMetrics"]
                if item.get("metric") in METRICS}
    project_rows, tenant_rows = indexed("project"), indexed("tenantSharedPool")
    require(set(project_rows) == set(METRICS) and set(tenant_rows) == set(METRICS),
            "配额接口缺四项指标")
    statuses = {}
    for metric in METRICS:
        p, t = project_rows[metric], tenant_rows[metric]
        require(p["used"] == expected_project[metric] and t["used"] == expected_tenant[metric],
                "项目贡献或租户共享用量不符")
        require(p["limit"] == limits[metric] and t["limit"] == limits[metric],
                "非商业技术容量展示不符")
        require(t["remaining"] == max(0, limits[metric] - expected_tenant[metric]),
                "共享剩余额度不符")
        require(p["status"] == t["status"], "共享池状态在项目/租户投影中不一致")
        statuses[metric] = t["status"]
    return statuses


def mqtt_retry(api, pg, project, project_key, device):
    # The existing V3a client exercises the real MQTT subscription. Do not
    # acknowledge the command, so the original logical command has 3 attempts.
    import importlib.util
    source = HERE / "smoke-command-downlink-v3a.py"
    require(source.is_file(), "MQTT 命令客户端缺失")
    spec = importlib.util.spec_from_file_location("v5b1_v3a_device", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    transport = module.MqttDevice(project_key, device)
    path = f"/api/v1/projects/{project}/devices/{device['id']}/commands"
    key = "v5b1-" + secrets.token_hex(10)
    body = {"commandKey": "v5b1_ping", "input": {"probe": "v5b1"}}
    try:
        accepted = api.call("POST", path, body, 202, {"Idempotency-Key": key})
        cid = checked_uuid(accepted["id"])
        require(accepted.get("status") == "ACCEPTED", "逻辑下行命令未受理")
        for attempt in (1, 2, 3):
            observed, frame = transport.receive(time.monotonic() + 23)
            require(observed == cid and frame.get("attempt") == attempt,
                    "MQTT 下行重试未归于同一命令")
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            state = api.call("GET", path + "/" + cid)
            if state.get("status") in ("SUCCEEDED", "FAILED", "TIMED_OUT"):
                break
            time.sleep(0.5)
        require(state.get("status") == "TIMED_OUT" and state.get("attemptCount") == 3
                and state.get("failureCode") == "RESPONSE_TIMEOUT", "命令重试终态不符")
        replay = api.call("POST", path, body, 202, {"Idempotency-Key": key})
        require(replay.get("id") == cid, "同键命令重放产生新逻辑命令")
        pid = checked_uuid(project)
        counts = db(pg, f"SET app.project_id='{pid}'; SELECT "
                    f"(SELECT count(*) FROM ts_device_command WHERE id='{cid}'),"
                    f"(SELECT count(*) FROM ts_device_command_attempt WHERE command_id='{cid}')")
        require(counts == "1|3", "命令/attempt 持久归因不符")
        return cid
    finally:
        transport.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy-dir", required=True, help="源码外独立部署目录")
    parser.add_argument("--candidate-jar", required=True, help="固定候选 JAR 宿主绝对路径")
    parser.add_argument("--candidate-sha256", required=True, help="固定候选 JAR 小写 SHA-256")
    parser.add_argument("--maven-repo", default=str(Path.home() / ".m2/repository"),
                        help="现有 Californium 探针依赖缓存")
    args = parser.parse_args()
    deploy = Path(args.deploy_dir).expanduser().resolve()
    jar = Path(args.candidate_jar).expanduser().resolve()
    app, pg, limits = preflight(deploy, jar, args.candidate_sha256)
    # Baseline work should not accidentally enter historical-storage DEGRADED
    # merely because a former capacity experiment left tiny test limits active.
    require(limits["UPLINK_MESSAGE"] >= 10 and limits["UPLINK_BYTES"] >= 2048
            and limits["TIME_SERIES_POINT"] >= 10 and limits["DOWNLINK_MESSAGE"] >= 2,
            "四项容量过小，不适合本探针基线；降级边界须另行受控验证")
    day = utc_now().date()
    suffix = secrets.token_hex(5)
    api = Api()
    projects, devices = setup(api, pg, suffix)
    p1, p2 = projects[0][0], projects[1][0]
    tenant = owner(pg, p1)
    reports = []
    coap = CoapClient(app, args.maven_repo, deploy)
    try:
        for protocol, properties in (("HTTP", {"temperature": 28.5, "humidity": 60.0}),
                                     ("MQTT", {"temperature": 29.5}),
                                     ("TCP", {"temperature": 30.5}),
                                     ("COAP", {"temperature": 31.5})):
            device = devices[(1, protocol)]
            report = payload(uuid7(), utc_now(), properties)
            sender = {"HTTP": http_report, "MQTT": mqtt_report,
                      "TCP": tcp_report, "COAP": coap.report}[protocol]
            raw_bytes = sender(projects[0][1], device, report)
            wait_message(pg, p1, report["messageId"], len(properties), raw_bytes)
            require(sender(projects[0][1], device, report) == raw_bytes,
                    "同 ID 重放原始字节预期变化")
            time.sleep(1.5)
            wait_message(pg, p1, report["messageId"], len(properties), raw_bytes)
            reports.append((protocol, report["messageId"], raw_bytes))

        report = payload(uuid7(), utc_now(), {"temperature": 32.5})
        size = http_report(projects[1][1], devices[(2, "HTTP")], report)
        wait_message(pg, p2, report["messageId"], 1, size)
        reports.append(("HTTP-P2", report["messageId"], size))

        # A received-today/occurred-yesterday report deliberately splits the
        # accounting days of inbox+bytes and the persisted time-series point.
        late = payload(uuid7(), utc_now() - timedelta(days=1), {"temperature": 27.5})
        size = http_report(projects[0][1], devices[(1, "HTTP")], late)
        wait_message(pg, p1, late["messageId"], 1, size)
        reports.append(("HTTP-LATE", late["messageId"], size))

        require(utc_now().date() == day, "探针穿越真实 UTC 午夜；本轮不宣称单日基线")
        switched = api.call("POST", "/api/v1/auth/switch-project", {"projectId": p1})
        api.token = switched["accessToken"]
        command_id = mqtt_retry(api, pg, p1, projects[0][1], devices[(1, "MQTT")])
        require(utc_now().date() == day, "命令期间穿越真实 UTC 午夜；须分日另验")
        yesterday, today = (day - timedelta(days=1)).isoformat(), day.isoformat()
        expected = wait_counters(pg, tenant, (p1, p2), (yesterday, today))
        today_tenant = {metric: sum(expected[(pid, today)][metric] for pid in (p1, p2))
                        for metric in METRICS}
        require(today_tenant["UPLINK_MESSAGE"] == 6
                and today_tenant["DOWNLINK_MESSAGE"] == 1
                and today_tenant["UPLINK_BYTES"] == sum(item[2] for item in reports)
                and today_tenant["TIME_SERIES_POINT"] == 6,
                "四项今日源事实与夹具精确期望不符")
        require(expected[(p1, yesterday)]["TIME_SERIES_POINT"] == 1
                and expected[(p1, yesterday)]["UPLINK_MESSAGE"] == 0
                and expected[(p1, yesterday)]["UPLINK_BYTES"] == 0,
                "迟到属性的 UTC 归日不符")
        first = quota(api, p1, limits, expected[(p1, today)], today_tenant, today)
        switched = api.call("POST", "/api/v1/auth/switch-project", {"projectId": p2})
        api.token = switched["accessToken"]
        second = quota(api, p2, limits, expected[(p2, today)], today_tenant, today)
        require(first == second, "同租户跨项目共享池状态不一致")
        _, _, after = preflight(deploy, jar, args.candidate_sha256, limits)
        require(after == limits, "候选容量运行中改变")
        print(json.dumps({"result": "PASS", "candidateSha256": args.candidate_sha256,
                          "tenant": tenant, "projects": [p1, p2], "logicalCommand": command_id,
                          "utcDay": today, "todayTenantUsed": today_tenant,
                          "yesterdayLatePoint": 1, "limits": limits, "statuses": first,
                          "messageCount": len(reports), "commandAttempts": 3,
                          "unverified": ["actual UTC midnight crossing", "limit+1 degradation boundary",
                                         "HTTP/CoAP downlink claim retry accounting"]}, sort_keys=True))
    finally:
        coap.close()


if __name__ == "__main__":
    try:
        main()
    except (ProbeError, KeyError, IndexError, TypeError, ValueError) as error:
        # Neither exception bodies from external tools nor HTTP response bodies
        # are printed. The explicit probe messages contain only route names and
        # small counts; never interpolate a secret or a request payload here.
        label = str(error) if isinstance(error, ProbeError) else "响应结构或本地输入无效"
        print(f"V5b-1 FAIL: {label}", file=sys.stderr)
        sys.exit(1)

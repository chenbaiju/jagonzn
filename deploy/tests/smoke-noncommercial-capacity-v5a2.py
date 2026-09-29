"""V5a-2 black-box capacity probe for a disposable, fixed-candidate jagonzn stack.

Python 3.11+ standard library only. Creates disposable tenants, projects,
dashboards, memberships, a device, and two historical telemetry points. The
fixture is retained for audit. Run only against an isolated local deployment.
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
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path


BASE = "http://127.0.0.1:18080"
DEVICE_URL = "https://127.0.0.1:18443/device-access/v1/property/report"
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")
CAPACITY = {
    "JAGONZN_ENTITLEMENT_MODE": "NONCOMMERCIAL",
    "JAGONZN_TECHNICAL_DASHBOARDS": "2",
    "JAGONZN_TECHNICAL_EXTERNAL_SEATS": "2",
    "JAGONZN_TECHNICAL_HISTORY_DAYS": "30",
}
REGISTRATION_WINDOW_SECONDS = 5 * 60


class ProbeError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ProbeError(message)


def run(*argv):
    result = subprocess.run(argv, capture_output=True, text=True, check=False, timeout=30)
    require(result.returncode == 0, "本机 Docker 命令失败")
    return result.stdout.strip()


def compose(deploy, *args):
    return run("docker", "compose", "--env-file", str(deploy / ".env.local"),
               "-f", str(deploy / "compose.yml"), *args)


def file_sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def preflight(deploy, jar, expected):
    require(deploy != Path(__file__).resolve().parent.parent,
            "须提供源码目录之外的一次性隔离部署目录")
    require((deploy / "compose.yml").is_file() and (deploy / ".env.local").is_file(),
            "部署目录缺少 compose.yml 或 .env.local")
    require(SHA256.fullmatch(expected), "候选摘要须为小写 SHA-256")
    require(jar.is_file() and file_sha256(jar) == expected, "宿主候选 JAR 摘要不符")
    app = compose(deploy, "--profile", "app", "ps", "-q", "app")
    require(app, "jagonzn app 容器未运行")
    running = run("docker", "exec", app, "sha256sum", "/app/jagonzn-service.jar").split()
    require(running and running[0] == expected, "运行中的 app JAR 摘要不符")
    inspect = json.loads(run("docker", "inspect", app))
    require(len(inspect) == 1 and inspect[0]["State"]["Running"], "app 容器状态不正确")
    values = {}
    for entry in inspect[0]["Config"]["Env"]:
        name, separator, value = entry.partition("=")
        if separator and name in CAPACITY:
            require(name not in values, "运行容器权益环境变量重复")
            values[name] = value
    require(values == CAPACITY, "运行容器并非 NONCOMMERCIAL 或 V5a-2 技术容量不符")
    pg = compose(deploy, "ps", "-q", "postgres")
    require(pg, "jagonzn PostgreSQL 容器未运行")
    return pg


def db(pg, statement):
    # Interpolated values below are checked UUIDs, fixed SQL, or restricted suffixes.
    return run("docker", "exec", pg, "psql", "-U", "jagonzn", "-d", "jagonzn",
               "-v", "ON_ERROR_STOP=1", "-Atqc", statement)


def identifier(value):
    require(isinstance(value, str) and UUID.fullmatch(value), "业务响应 ID 格式错误")
    return value


def number(pg, statement):
    value = db(pg, statement)
    require(re.fullmatch(r"[0-9]+", value), "数据库权威计数回执无效")
    return int(value)


def equal(actual, expected, label):
    require(actual == expected, f"{label} 不符")


def uuid7():
    # Python 3.11 has no uuid.uuid7(). Set RFC 9562 version and variant bits.
    value = (int(time.time() * 1000) << 80) | secrets.randbits(80)
    value = (value & ~(0xF << 76)) | (7 << 76)
    value = (value & ~(0x3 << 62)) | (0x2 << 62)
    return str(uuid.UUID(int=value))


def utc_text(instant):
    return instant.isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Api:
    def __init__(self):
        self.token = ""
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.last_request = 0.0

    def request(self, method, path, data=None, headers=None):
        elapsed = time.monotonic() - self.last_request
        if elapsed < 0.35:
            time.sleep(0.35 - elapsed)
        self.last_request = time.monotonic()
        request_headers = dict(headers or {})
        if self.token:
            request_headers["Authorization"] = "Bearer " + self.token
        body = None
        if data is not None:
            body = json.dumps(data, separators=(",", ":")).encode()
            request_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(BASE + path, body, request_headers, method=method)
        try:
            with self.opener.open(request, timeout=15) as response:
                return response.status, response.read(65536)
        except urllib.error.HTTPError as error:
            return error.code, error.read(65536)
        except (urllib.error.URLError, TimeoutError):
            raise ProbeError("本机 HTTP 请求失败") from None

    def call(self, method, path, data=None, status=200, code=None, headers=None):
        actual, raw = self.request(method, path, data, headers)
        require(actual == status, f"{method} {path.split('?')[0]} HTTP 状态不符：{actual}")
        if code is not None:
            try:
                parsed = json.loads(raw)
                actual_code = parsed.get("code", parsed.get("errorCode"))
            except (ValueError, AttributeError, TypeError):
                actual_code = None
            require(str(actual_code) == str(code), f"{method} 配额拒绝业务码不符")
            return None
        if not raw:
            return None
        try:
            return json.loads(raw)
        except ValueError:
            raise ProbeError("HTTP 成功响应不是 JSON") from None


def register(api, email, password):
    # The real per-IP limit is 3 registrations in a fixed 5-minute Redis window.
    # Earlier V5a-1 attempts may still occupy it. Wait for expiry; never clear it.
    for attempt in range(4):
        status, _ = api.request("POST", "/api/v1/auth/register",
                                {"email": email, "password": password})
        if status == 204:
            return
        if status != 429:
            raise ProbeError(f"注册 HTTP 状态不符：{status}")
        if attempt == 3:
            raise ProbeError("注册在三个完整短窗后仍受限")
        print("V5a-2: 注册短窗已满，等待五分钟后继续", flush=True)
        time.sleep(REGISTRATION_WINDOW_SECONDS + 5)


def account(api, pg, suffix, ordinal, login):
    email = f"v5a2-{suffix}-{ordinal}@example.test"
    password = secrets.token_urlsafe(36)
    register(api, email, password)
    if login:
        verified = number(pg, "WITH verified AS (UPDATE sys_account SET email_verified_at=now() "
                          f"WHERE email='{email}' AND email_verified_at IS NULL RETURNING 1) "
                          "SELECT count(*) FROM verified")
        equal(verified, 1, "一次性账号验证")
        response = api.call("POST", "/api/v1/auth/login",
                            {"email": email, "password": password})
        require(isinstance(response, dict) and isinstance(response.get("accessToken"), str),
                "登录令牌缺失")
        api.token = response["accessToken"]
    return email


def project(api, suffix, ordinal):
    response = api.call("POST", "/api/v1/projects", {
        "name": f"v5a2-{suffix}-{ordinal}", "region": "sh-1"})
    require(isinstance(response, dict), "创建项目响应无效")
    return identifier(response.get("id")), response.get("projectKey")


def switch(api, project_id):
    response = api.call("POST", "/api/v1/auth/switch-project", {"projectId": project_id})
    require(isinstance(response, dict) and isinstance(response.get("accessToken"), str),
            "切换项目令牌缺失")
    api.token = response["accessToken"]


def tenant(pg, project_id):
    return identifier(db(pg, f"SELECT tenant_id FROM sys_project WHERE id='{identifier(project_id)}'"))


def dashboard_count(pg, tenant_id):
    return number(pg, "SELECT count(*) FROM dash_dashboard "
                  f"WHERE tenant_id='{identifier(tenant_id)}' AND deleted_at IS NULL")


def project_dashboard_count(pg, project_id):
    return number(pg, "SELECT count(*) FROM dash_dashboard "
                  f"WHERE project_id='{identifier(project_id)}' AND deleted_at IS NULL")


def dashboard(api, project_id, suffix, ordinal, status=201, code=None):
    content = {
        "schemaVersion": "tc.dashboard/v1",
        "presentation": {"mode": "RESPONSIVE_GRID"},
        "models": [], "variables": [],
        "pages": [{"id": "overview", "title": "Quota", "components": []}],
    }
    return api.call("POST", f"/api/v1/projects/{project_id}/dashboards",
                    {"managementName": f"V5a2 {ordinal}", "content": content},
                    status, code, {"Idempotency-Key": f"v5a2-{suffix}-{ordinal}"})


def external_count(pg, tenant_id):
    return number(pg, "SELECT count(DISTINCT m.account_id) FROM sys_project_member m "
                  "JOIN sys_project p ON p.id=m.project_id "
                  "WHERE NOT EXISTS (SELECT 1 FROM sys_tenant_member tm "
                  "WHERE tm.tenant_id=p.tenant_id AND tm.account_id=m.account_id) "
                  f"AND p.tenant_id='{identifier(tenant_id)}'")


def project_external_count(pg, project_id):
    return number(pg, "SELECT count(DISTINCT m.account_id) FROM sys_project_member m "
                  "JOIN sys_project p ON p.id=m.project_id "
                  "WHERE NOT EXISTS (SELECT 1 FROM sys_tenant_member tm "
                  "WHERE tm.tenant_id=p.tenant_id AND tm.account_id=m.account_id) "
                  f"AND p.id='{identifier(project_id)}'")


def invite(api, project_id, email, status=200, code=None):
    return api.call("POST", f"/api/v1/projects/{project_id}/members",
                    {"email": email, "role": "VIEWER"}, status, code)


def make_device(api, project_id, suffix):
    base = f"/api/v1/projects/{project_id}"
    kind = api.call("POST", base + "/device-types", {
        "typeKey": f"v5a2_{suffix}", "name": "V5a2 history",
        "deviceKind": "DIRECT", "payloadProtocol": "STANDARD", "networkType": "WIFI"}, 201)
    type_id = identifier(kind.get("id") if isinstance(kind, dict) else None)
    api.call("POST", base + f"/device-types/{type_id}/properties", {
        "propertyKey": "temperature", "name": "Temperature", "accessType": "REPORT",
        "dataType": "NUMBER", "unit": "C", "decimalPlaces": 1,
        "minimumValue": 0, "maximumValue": 100, "sortOrder": 0}, 201)
    api.call("POST", base + f"/device-types/{type_id}/publish", status=200)
    key = f"v5a2-{suffix}"
    device = api.call("POST", base + "/devices", {
        "deviceTypeId": type_id, "deviceKey": key, "name": "V5a2 history"}, 201)
    device_id = identifier(device.get("id") if isinstance(device, dict) else None)
    credential = api.call("POST", base + f"/devices/{device_id}/credentials", status=201)
    require(isinstance(credential, dict) and isinstance(credential.get("plainSecret"), str),
            "设备凭据响应无效")
    route = base + f"/devices/{device_id}/access-config"
    configuration = api.call("GET", route)
    require(isinstance(configuration, dict) and configuration.get("configVersion") is not None,
            "设备接入配置响应无效")
    enabled = api.call("PUT", route, {
        "protocol": "HTTP", "enabled": True,
        "expectedConfigVersion": str(configuration["configVersion"])})
    require(isinstance(enabled, dict) and enabled.get("enabled") is True,
            "设备 HTTPS 接入未启用")
    return device_id, key, credential["plainSecret"]


def report(project_key, device_key, secret, message_id, occurred_at, value):
    body = json.dumps({"messageId": message_id, "occurredAt": utc_text(occurred_at),
                       "payload": {"temperature": value}}, separators=(",", ":")).encode()
    request = urllib.request.Request(DEVICE_URL, body, {
        "Content-Type": "application/json",
        "X-TC-Device-Key": f"{project_key}/{device_key}",
        "X-TC-Device-Secret": secret,
    }, method="POST")
    # The isolated fixture uses the test certificate generated by start.ps1.
    context = ssl._create_unverified_context()
    try:
        with urllib.request.urlopen(request, context=context, timeout=20) as response:
            status = response.status
    except urllib.error.HTTPError as error:
        status = error.code
    except (urllib.error.URLError, TimeoutError):
        raise ProbeError("设备 HTTPS 上报失败") from None
    equal(status, 202, "设备 HTTPS 上报状态")


def point_counts(pg, project_id, message_id):
    return db(pg, "SELECT "
              f"(SELECT count(*) FROM sys_inbox_message WHERE project_id='{identifier(project_id)}' "
              f"AND message_id='{identifier(message_id)}'),"
              f"(SELECT count(*) FROM ts_property_point_internal WHERE project_id='{identifier(project_id)}' "
              f"AND message_id='{identifier(message_id)}' AND property_key='temperature')")


def await_points(pg, project_id, messages):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if all(point_counts(pg, project_id, message_id) == "1|1" for message_id in messages):
            return
        time.sleep(1)
    raise ProbeError("受理消息未在 60 秒内形成各一份 inbox 和原始点")


def history(api, project_id, device_id, recent_at, from_time, to_time):
    params = urllib.parse.urlencode({
        "propertyKey": "temperature", "from": utc_text(from_time),
        "to": utc_text(to_time), "limit": 100,
    })
    response = api.call("GET", f"/api/v1/projects/{project_id}/devices/{device_id}"
                        f"/telemetry/property?{params}")
    require(isinstance(response, dict) and isinstance(response.get("items"), list),
            "历史分页响应无效")
    require(response.get("hasMore") is False, "历史响应未穷尽，不能判定旧点缺席")
    points = response["items"]
    require(len(points) == 1, "历史窗口应恰好返回一条样例点")
    require(points[0].get("value") == 29.0 and points[0].get("propertyKey") == "temperature",
            "窗口内样例点不符")
    # Raw DTO does not expose messageId; the sentinel, persisted message IDs,
    # and the actual timestamp together identify the visible sample.
    try:
        visible_at = datetime.fromisoformat(points[0]["ts"].replace("Z", "+00:00"))
    except (KeyError, AttributeError, ValueError):
        raise ProbeError("历史点时间字段无效") from None
    require(visible_at.tzinfo is not None and abs((visible_at - recent_at).total_seconds()) < 1,
            "REST 返回点并非 29 天内样例")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy-dir", required=True, help="隔离栈部署目录，含 compose.yml 和 .env.local")
    parser.add_argument("--candidate-jar", required=True, help="固定候选 JAR 的宿主路径")
    parser.add_argument("--candidate-sha256", required=True, help="固定候选 JAR 的小写 SHA-256")
    args = parser.parse_args()
    deploy = Path(args.deploy_dir).expanduser().resolve()
    jar = Path(args.candidate_jar).expanduser().resolve()
    pg = preflight(deploy, jar, args.candidate_sha256)

    suffix = secrets.token_hex(5)
    owner = Api()
    account(owner, pg, suffix, 0, True)
    p1, project_key = project(owner, suffix, 1)
    require(isinstance(project_key, str) and project_key, "项目短键缺失")
    owner_tenant = tenant(pg, p1)
    p2, _ = project(owner, suffix, 2)
    equal(tenant(pg, p2), owner_tenant, "跨项目租户归属")

    switch(owner, p1)
    first = dashboard(owner, p1, suffix, 1)
    first_id = identifier(first.get("id") if isinstance(first, dict) else None)
    equal(dashboard_count(pg, owner_tenant), 1, "首个看板权威计数")
    switch(owner, p2)
    second = dashboard(owner, p2, suffix, 2)
    identifier(second.get("id") if isinstance(second, dict) else None)
    equal(dashboard_count(pg, owner_tenant), 2, "跨项目看板共享额度")
    equal([project_dashboard_count(pg, p1), project_dashboard_count(pg, p2)], [1, 1],
          "看板项目归属")
    listing = owner.call("GET", f"/api/v1/projects/{p2}/dashboards")
    require(isinstance(listing, dict) and isinstance(listing.get("items"), list)
            and all(item.get("id") != first_id for item in listing["items"]),
            "另一项目看板目录泄露")
    switch(owner, p1)
    dashboard(owner, p1, suffix, 3, 409, 60059)
    equal(dashboard_count(pg, owner_tenant), 2, "看板拒绝后权威计数")

    # Four registrations total including owner. A prior V5a-1 run may have
    # filled the shared per-IP window; register() waits for the real expiry.
    for ordinal, target in ((1, p1), (2, p2), (3, p1)):
        external_email = account(Api(), pg, suffix, ordinal, False)
        if target != p1:
            switch(owner, target)
        invite(owner, target, external_email, 200 if ordinal <= 2 else 409,
               None if ordinal <= 2 else 50049)
        equal(external_count(pg, owner_tenant), min(ordinal, 2),
              "外部席位拒绝后或跨项目权威计数")
        equal([project_external_count(pg, p1), project_external_count(pg, p2)],
              [1 if ordinal >= 1 else 0, 1 if ordinal >= 2 else 0],
              "外部席位项目归属")
        if target != p1:
            switch(owner, p1)

    device_id, device_key, device_secret = make_device(owner, p1, suffix)
    db_epoch = float(db(pg, "SELECT extract(epoch FROM statement_timestamp())"))
    anchor = datetime.fromtimestamp(db_epoch, timezone.utc)
    old_at, recent_at = anchor - timedelta(days=31), anchor - timedelta(days=29)
    old_id, recent_id = uuid7(), uuid7()
    report(project_key, device_key, device_secret, old_id, old_at, 31.0)
    report(project_key, device_key, device_secret, recent_id, recent_at, 29.0)
    await_points(pg, p1, (old_id, recent_id))
    history(owner, p1, device_id, recent_at,
            anchor - timedelta(days=32), anchor)
    preflight(deploy, jar, args.candidate_sha256)
    print("V5a-2 PASS: 固定候选；看板和外部席位 1/2/3 与跨项目共享；"
          "拒绝后权威计数；31/29 天设备原始点入库且 REST 只见窗口内点")


if __name__ == "__main__":
    try:
        main()
    except ProbeError as error:
        # Errors are locally constructed and omit response bodies, tokens, and secrets.
        print("V5a-2 FAIL: " + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        print("V5a-2 FAIL: 探针异常；检查隔离部署的私有日志", file=sys.stderr)
        sys.exit(1)

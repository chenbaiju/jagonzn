"""V5a-1 fixed-candidate HTTP capacity probe for an isolated jagonzn stack.

Python 3.11+ standard library only. This creates two disposable tenants, two
projects in the first tenant, device types, devices, and end users. It also
marks only its own new accounts email-verified in the isolated database.
Run only against a disposable deployment; the fixture is intentionally retained.
"""

import argparse
import hashlib
import http.cookiejar
import json
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path


BASE = "http://127.0.0.1:18080"
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")
CAPACITY = {
    "JAGONZN_ENTITLEMENT_MODE": "NONCOMMERCIAL",
    "JAGONZN_TECHNICAL_PROJECTS": "2",
    "JAGONZN_TECHNICAL_DEVICES": "2",
    "JAGONZN_TECHNICAL_END_USERS": "2",
}


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

    # Inspect only named entitlement keys. Never log the full container environment.
    inspect = json.loads(run("docker", "inspect", app))
    require(len(inspect) == 1 and inspect[0]["State"]["Running"], "app 容器状态不正确")
    values = {}
    for entry in inspect[0]["Config"]["Env"]:
        name, separator, value = entry.partition("=")
        if separator and name in CAPACITY:
            require(name not in values, "运行容器权益环境变量重复")
            values[name] = value
    require(values == CAPACITY, "运行容器并非 NONCOMMERCIAL 或三项技术容量不全为 2")
    pg = compose(deploy, "ps", "-q", "postgres")
    require(pg, "jagonzn PostgreSQL 容器未运行")
    return pg


def db(pg, statement):
    # All substituted identifiers originate from UUID parsing or the restricted
    # random suffix below. Never include passwords, bearer tokens, or responses.
    return run("docker", "exec", pg, "psql", "-U", "jagonzn", "-d", "jagonzn",
               "-v", "ON_ERROR_STOP=1", "-Atqc", statement)


def identifier(value):
    require(isinstance(value, str) and UUID.fullmatch(value), "业务响应 ID 格式错误")
    return value


def number(pg, statement):
    value = db(pg, statement)
    require(re.fullmatch(r"[0-9]+", value), "权威数据库计数回执无效")
    return int(value)


def owner_tenant(pg, project):
    value = db(pg, f"SELECT tenant_id FROM sys_project WHERE id='{identifier(project)}'")
    return identifier(value)


def counts(pg, tenant, projects):
    tenant = identifier(tenant)
    checked = [identifier(project) for project in projects]
    return {
        "projects": number(pg, "SELECT count(*) FROM sys_project "
                           f"WHERE tenant_id='{tenant}' AND deleted_at IS NULL"),
        "devices": number(pg, "SELECT count(*) FROM dev_device "
                          f"WHERE tenant_id='{tenant}' AND deleted_at IS NULL"),
        "end_users": number(pg, f"SELECT count(*) FROM app_user WHERE tenant_id='{tenant}'"),
        "device_projects": [number(pg, "SELECT count(*) FROM dev_device "
                                   f"WHERE project_id='{project}' AND deleted_at IS NULL")
                            for project in checked],
    }


def equal(actual, expected, label):
    require(actual == expected, f"{label} 权威计数不符")


class Api:
    def __init__(self):
        self.token = ""
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.last_request = 0.0

    def call(self, method, path, data=None, status=200, code=None):
        # Keep the existing account-second rate limit distinct from quota errors.
        elapsed = time.monotonic() - self.last_request
        if elapsed < 0.35:
            time.sleep(0.35 - elapsed)
        self.last_request = time.monotonic()
        headers = {}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        body = None
        if data is not None:
            body = json.dumps(data, separators=(",", ":")).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(BASE + path, body, headers, method=method)
        try:
            with self.opener.open(request, timeout=15) as response:
                actual = response.status
                raw = response.read(65536)
        except urllib.error.HTTPError as error:
            actual = error.code
            raw = error.read(65536)
        except (urllib.error.URLError, TimeoutError):
            raise ProbeError("本机 HTTP 请求失败") from None
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


def account(api, pg, suffix, ordinal):
    email = f"v5a1-{suffix}-{ordinal}@example.test"
    password = secrets.token_urlsafe(36)
    api.call("POST", "/api/v1/auth/register", {"email": email, "password": password}, 204)
    verified = number(pg, "WITH verified AS (UPDATE sys_account SET email_verified_at=now() "
                      f"WHERE email='{email}' AND email_verified_at IS NULL RETURNING 1) "
                      "SELECT count(*) FROM verified")
    equal(verified, 1, "一次性账号验证")
    login = api.call("POST", "/api/v1/auth/login", {"email": email, "password": password})
    require(isinstance(login, dict) and isinstance(login.get("accessToken"), str), "登录令牌缺失")
    api.token = login["accessToken"]


def project(api, suffix, ordinal):
    result = api.call("POST", "/api/v1/projects", {
        "name": f"v5a1-{suffix}-{ordinal}", "region": "sh-1"})
    require(isinstance(result, dict), "创建项目响应无效")
    return identifier(result.get("id"))


def switch(api, project_id):
    response = api.call("POST", "/api/v1/auth/switch-project", {"projectId": project_id})
    require(isinstance(response, dict) and isinstance(response.get("accessToken"), str),
            "切换项目令牌缺失")
    api.token = response["accessToken"]


def device_type(api, project_id, suffix, ordinal):
    result = api.call("POST", f"/api/v1/projects/{project_id}/device-types", {
        "typeKey": f"v5a1_{suffix}_{ordinal}", "name": "V5a1 capacity",
        "deviceKind": "DIRECT", "payloadProtocol": "STANDARD", "networkType": "WIFI"}, 201)
    require(isinstance(result, dict), "创建设备类型响应无效")
    return identifier(result.get("id"))


def device(api, project_id, type_id, suffix, ordinal, status=201, code=None):
    return api.call("POST", f"/api/v1/projects/{project_id}/devices", {
        "deviceTypeId": type_id, "deviceKey": f"v5a1-{suffix}-{ordinal}",
        "name": f"V5a1 {ordinal}"}, status, code)


def end_user(api, project_id, suffix, ordinal, status=200, code=None):
    return api.call("POST", f"/api/v1/projects/{project_id}/end-users", {
        "username": f"v5a1_{suffix}_{ordinal}", "password": secrets.token_urlsafe(30),
        "displayName": f"V5a1 {ordinal}"}, status, code)


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
    first, second = Api(), Api()
    account(first, pg, suffix, 1)
    p1 = project(first, suffix, 1)
    t1 = owner_tenant(pg, p1)
    equal(counts(pg, t1, [p1])["projects"], 1, "项目额度内")
    p2 = project(first, suffix, 2)
    equal(owner_tenant(pg, p2), t1, "同租户项目归属")
    equal(counts(pg, t1, [p1, p2])["projects"], 2, "项目边界")
    first.call("POST", "/api/v1/projects", {
        "name": f"v5a1-{suffix}-3", "region": "sh-1"}, 429, 50020)
    equal(counts(pg, t1, [p1, p2])["projects"], 2, "项目拒绝后")

    switch(first, p1)
    type1 = device_type(first, p1, suffix, 1)
    first_device = device(first, p1, type1, suffix, 1)
    require(isinstance(first_device, dict), "创建设备响应无效")
    first_device_id = identifier(first_device.get("id"))
    end_user(first, p1, suffix, 1)
    equal(counts(pg, t1, [p1, p2]), {
        "projects": 2, "devices": 1, "end_users": 1, "device_projects": [1, 0]},
        "设备及终端用户额度内")
    switch(first, p2)
    type2 = device_type(first, p2, suffix, 2)
    device(first, p2, type2, suffix, 2)
    end_user(first, p2, suffix, 2)
    first.call("GET", f"/api/v1/projects/{p2}/devices/{first_device_id}", status=404)
    equal(counts(pg, t1, [p1, p2]), {
        "projects": 2, "devices": 2, "end_users": 2, "device_projects": [1, 1]},
        "跨项目共享边界")
    switch(first, p1)
    device(first, p1, type1, suffix, 3, 429, 30035)
    end_user(first, p1, suffix, 3, 409, 60058)
    equal(counts(pg, t1, [p1, p2]), {
        "projects": 2, "devices": 2, "end_users": 2, "device_projects": [1, 1]},
        "跨项目拒绝后")

    # Only two new registrations: stay below the fixed per-IP registration budget.
    account(second, pg, suffix, 2)
    other = project(second, suffix, 4)
    other_tenant = owner_tenant(pg, other)
    require(other_tenant != t1, "第二账号没有形成独立租户")
    switch(second, other)
    other_type = device_type(second, other, suffix, 4)
    device(second, other, other_type, suffix, 4)
    end_user(second, other, suffix, 4)
    equal(counts(pg, other_tenant, [other]), {
        "projects": 1, "devices": 1, "end_users": 1, "device_projects": [1]},
        "另一租户额度内")
    equal(counts(pg, t1, [p1, p2]), {
        "projects": 2, "devices": 2, "end_users": 2, "device_projects": [1, 1]},
        "另一租户操作后原租户")
    preflight(deploy, jar, args.candidate_sha256)
    print("V5a-1 PASS: 固定候选；项目、设备、终端用户 1/2/3 边界；跨项目共享；拒绝后权威计数；其他租户隔离")


if __name__ == "__main__":
    try:
        main()
    except ProbeError as error:
        # ProbeError text is constructed locally and never contains response bodies.
        print("V5a-1 FAIL: " + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        # Never print exception chains: subprocess and HTTP errors may carry secrets.
        print("V5a-1 FAIL: 探针异常；检查隔离部署的私有日志", file=sys.stderr)
        sys.exit(1)

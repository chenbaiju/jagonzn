"""V3b black-box HTTPS and CoAP/DTLS command claim/reply probe.

Python 3.11+ and the four Californium runtime JARs are required. Run against an
isolated jagonzn candidate deployment. Only disposable project/device facts are
created; no credentials or reply payloads are printed.
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
from datetime import datetime, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
DEPLOY_DIR = HERE.parent
ADMIN = "http://127.0.0.1:18080"
DEVICE = "https://127.0.0.1:18443"
TERMINAL = {"SUCCEEDED", "FAILED", "TIMED_OUT"}
UUID_PATTERN = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


class ProbeError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ProbeError(message)


def uuid7():
    millis = int(time.time() * 1000)
    value = (millis << 80) | secrets.randbits(80)
    value = (value & ~(0xF << 76)) | (7 << 76)
    value = (value & ~(0x3 << 62)) | (0x2 << 62)
    return str(uuid.UUID(int=value))


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def compose(*args):
    command = ["docker", "compose", "--env-file", str(DEPLOY_DIR / ".env.local"),
               "-f", str(DEPLOY_DIR / "compose.yml"), *args]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    require(result.returncode == 0, "jagonzn Docker Compose 命令失败")
    return result.stdout.strip()


def candidate_check(expected, candidate_jar):
    require((DEPLOY_DIR / ".env.local").is_file(), "缺少 jagonzn/deploy/.env.local")
    require(re.fullmatch(r"[0-9a-f]{64}", expected), "候选摘要应为小写 SHA-256")
    jar = Path(candidate_jar).expanduser().resolve()
    require(jar.is_file(), "候选 JAR 不存在")
    digest = hashlib.sha256()
    with jar.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    require(digest.hexdigest() == expected, "本地候选 JAR 摘要不匹配")
    app = compose("--profile", "app", "ps", "-q", "app")
    require(app, "jagonzn app 容器未运行")
    running = subprocess.run(["docker", "exec", app, "sha256sum", "/app/jagonzn-service.jar"],
                             capture_output=True, text=True, check=False)
    require(running.returncode == 0 and running.stdout.split()
            and running.stdout.split()[0] == expected, "运行中的 JAR 与固定候选不一致")
    pg = compose("ps", "-q", "postgres")
    require(pg, "jagonzn PostgreSQL 容器未运行")
    return app, pg


def verify_own_account(pg, email):
    # The address is generated from a restricted alphabet within this probe.
    statement = "UPDATE sys_account SET email_verified_at=now() WHERE email='" + email + "'"
    result = subprocess.run(["docker", "exec", pg, "psql", "-U", "jagonzn", "-d", "jagonzn",
                             "-v", "ON_ERROR_STOP=1", "-Atqc", statement],
                            capture_output=True, text=True, check=False)
    require(result.returncode == 0, "一次性账号验证准备失败")


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
            body = json.dumps(data, separators=(",", ":")).encode()
            request_headers["Content-Type"] = "application/json"
        for attempt in range(4):
            since = time.monotonic() - self.last_request
            if since < 0.25:
                time.sleep(0.25 - since)
            self.last_request = time.monotonic()
            request = urllib.request.Request(ADMIN + path, body, request_headers, method=method)
            try:
                with self.opener.open(request, timeout=15) as response:
                    status, raw = response.status, response.read()
            except urllib.error.HTTPError as error:
                code = "unknown"
                try:
                    parsed = json.loads(error.read(4096))
                    candidate = parsed.get("code", parsed.get("errorCode"))
                    if isinstance(candidate, int):
                        code = str(candidate)
                    elif isinstance(candidate, str) and re.fullmatch(r"[A-Z0-9_]{1,64}", candidate):
                        code = candidate
                except (ValueError, AttributeError, TypeError):
                    pass
                if error.code == 429 and code in ("10029", "unknown") and attempt < 3:
                    time.sleep(1.2)
                    continue
                raise ProbeError(f"管理 API {method} {path} 返回 HTTP {error.code}，code={code}，预期 {expected}") from None
            except (urllib.error.URLError, TimeoutError):
                raise ProbeError(f"管理 API {method} {path} 网络失败") from None
            require(status == expected,
                    f"管理 API {method} {path} 返回 HTTP {status}，预期 {expected}")
            return json.loads(raw) if raw else None


def setup(api, pg, suffix):
    email = f"v3b-{suffix}@example.test"
    password = secrets.token_urlsafe(36)
    api.call("POST", "/api/v1/auth/register", {"email": email, "password": password}, 204)
    verify_own_account(pg, email)
    api.token = api.call("POST", "/api/v1/auth/login", {
        "email": email, "password": password})["accessToken"]
    project = api.call("POST", "/api/v1/projects", {
        "name": f"v3b-{suffix}", "region": "sh-1"})
    pid = project["id"]
    api.token = api.call("POST", "/api/v1/auth/switch-project", {
        "projectId": pid})["accessToken"]
    dtype = api.call("POST", f"/api/v1/projects/{pid}/device-types", {
        "typeKey": f"v3b_{suffix}", "name": "V3b command probe", "deviceKind": "DIRECT",
        "payloadProtocol": "STANDARD", "networkType": "WIFI"}, 201)
    tid = dtype["id"]
    api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/commands", {
        "commandKey": "v3b_ping", "name": "V3b ping", "description": "Isolated claim probe",
        "inputSchema": '{"type":"object"}', "outputSchema": '{"type":"object"}',
        "timeoutSeconds": 20, "sortOrder": 0}, 201)
    api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/publish", expected=200)
    devices = {}
    for protocol in ("HTTP", "COAP"):
        devices[protocol] = {}
        for role in ("target", "other"):
            key = f"v3b-{protocol.lower()}-{role}-{suffix}"
            device = api.call("POST", f"/api/v1/projects/{pid}/devices", {
                "deviceTypeId": tid, "deviceKey": key,
                "name": f"V3b {protocol} {role}"}, 201)
            did = device["id"]
            credential = api.call("POST", f"/api/v1/projects/{pid}/devices/{did}/credentials",
                                  expected=201)
            route = f"/api/v1/projects/{pid}/devices/{did}/access-config"
            config = api.call("GET", route)
            if config["protocol"] != protocol or not config["enabled"]:
                api.call("PUT", route, {"protocol": protocol, "enabled": True,
                                        "expectedConfigVersion": config["configVersion"]})
            devices[protocol][role] = {"id": did, "key": key,
                                       "secret": credential["plainSecret"]}
    return pid, project["projectKey"], devices


def device_http(project_key, device, path, body, expected):
    headers = {"Content-Type": "application/json",
               "X-TC-Device-Key": project_key + "/" + device["key"],
               "X-TC-Device-Secret": device["secret"]}
    request = urllib.request.Request(DEVICE + path,
                                     json.dumps(body, separators=(",", ":")).encode(),
                                     headers, method="POST")
    context = ssl._create_unverified_context()  # Local self-signed acceptance certificate only.
    try:
        with urllib.request.urlopen(request, timeout=15, context=context) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read(4096)
    except (urllib.error.URLError, TimeoutError):
        raise ProbeError(f"设备 HTTPS {path} 网络失败") from None
    require(status == expected, f"设备 HTTPS {path} 返回 HTTP {status}，预期 {expected}")
    if status in (404, 409):
        try:
            parsed = json.loads(raw)
            code = parsed.get("code", parsed.get("errorCode"))
        except (ValueError, AttributeError, TypeError):
            code = None
        expected_code = "COMMAND_NOT_FOUND" if status == 404 else "IDEMPOTENCY_CONFLICT"
        require(code == expected_code, f"设备回复未获得 {expected_code}")
    return json.loads(raw) if raw else None


def command_path(pid, did):
    return f"/api/v1/projects/{pid}/devices/{did}/commands"


def poll_success(api, path, command_id):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        result = api.call("GET", path + "/" + command_id)
        require(result.get("deviceId") == result.get("connectionDeviceId"),
                "命令原目标与原接收者不一致")
        if result.get("status") in TERMINAL:
            require(result["status"] == "SUCCEEDED", "设备回复后命令未成功")
            require(result.get("attemptCount") == 1, "成功命令尝试次数不是 1")
            # Pull transports persist a claim lease, not a push attempt row.
            # The database assertion below checks the claim and absent push.
            return
        time.sleep(0.35)
    raise ProbeError("设备回复后管理命令未进入成功终态")


def db_facts(pg, project_id, command_id, receiver_id):
    for value in (project_id, command_id, receiver_id):
        require(UUID_PATTERN.fullmatch(value), "数据库查询标识格式非法")
    statement = (f"SET app.project_id='{project_id}'; "
                 "SELECT c.status || '|' || c.attempt_count || '|' || "
                 "(SELECT count(*) FROM ts_device_command_claim l WHERE l.command_id=c.id) || '|' || "
                 "(SELECT count(*) FROM ts_device_command_attempt a WHERE a.command_id=c.id) || '|' || "
                 "(SELECT coalesce(bool_and(l.connection_device_id=c.connection_device_id "
                 "AND l.attempt_no=1 AND l.status='REPLIED'),false) "
                 "FROM ts_device_command_claim l WHERE l.command_id=c.id)::text || '|' || "
                 f"(c.connection_device_id='{receiver_id}'::uuid)::text "
                 f"FROM ts_device_command c WHERE c.id='{command_id}'::uuid")
    result = subprocess.run(["docker", "exec", pg, "psql", "-U", "jagonzn", "-d", "jagonzn",
                             "-v", "ON_ERROR_STOP=1", "-Atqc", statement],
                            capture_output=True, text=True, check=False)
    require(result.returncode == 0, "命令数据库尝试事实查询失败")
    require(result.stdout.strip() == "SUCCEEDED|1|1|0|true|true",
            "命令数据库领取次数、推送尝试或冻结接收者不符")


def submit(api, pid, target, protocol):
    marker = secrets.token_hex(6)
    path = command_path(pid, target["id"])
    accepted = api.call("POST", path, {
        "commandKey": "v3b_ping", "input": {"marker": marker, "protocol": protocol}},
        202, {"Idempotency-Key": f"v3b-{protocol.lower()}-{marker}"})
    require(accepted.get("status") == "ACCEPTED"
            and accepted.get("deviceId") == target["id"]
            and accepted.get("connectionDeviceId") == target["id"],
            "命令受理后未冻结目标接收者")
    return path, accepted["id"], marker


def run_http(api, pg, pid, project_key, target, other):
    claim = "/device-access/v1/command/claim"
    reply = "/device-access/v1/command/reply"
    first_target_auth = time.monotonic()
    device_http(project_key, target, claim, {}, 204)
    path, command_id, marker = submit(api, pid, target, "HTTP")
    claimed = device_http(project_key, target, claim, {}, 200)
    commands = claimed.get("commands") or []
    require(len(commands) == 1, "HTTP 领取命令数量不是 1")
    item = commands[0]
    require(item.get("commandId") == command_id and item.get("commandKey") == "v3b_ping"
            and item.get("input") == {"marker": marker, "protocol": "HTTP"}
            and item.get("attempt") == 1 and item.get("leaseExpiresAt")
            and claimed.get("pollAfterMillis") == 30000,
            "HTTP 领取命令、尝试或租约字段不符")
    device_http(project_key, target, claim, {}, 204)
    reply_body = {"commandId": command_id, "messageId": uuid7(),
                  "occurredAt": utc_now(), "status": "SUCCESS", "output": {"probe": "v3b"}}
    device_http(project_key, other, reply, reply_body, 404)
    interim = api.call("GET", path + "/" + command_id)
    require(interim.get("status") not in TERMINAL,
            "非目标设备回复改变了命令终态")
    accepted = device_http(project_key, target, reply, reply_body, 202)
    require(accepted.get("status") == "ACCEPTED"
            and accepted.get("commandId") == command_id
            and accepted.get("messageId") == reply_body["messageId"],
            "HTTP 设备回复未获得匹配受理体")
    duplicate = device_http(project_key, target, reply, reply_body, 202)
    require(duplicate.get("commandId") == command_id
            and duplicate.get("messageId") == reply_body["messageId"],
            "HTTP 同 messageId 回复重放未保持幂等")
    changed = dict(reply_body)
    changed["output"] = {"probe": "conflicting-v3b"}
    # Contract auth budget is five authentications per device per 60-second
    # fixed window. The sixth and seventh target requests test business
    # semantics only after that original window has expired.
    time.sleep(max(0.0, 61.0 - (time.monotonic() - first_target_auth)))
    device_http(project_key, target, reply, changed, 409)
    poll_success(api, path, command_id)
    device_http(project_key, target, claim, {}, 204)
    db_facts(pg, pid, command_id, target["id"])
    print(f"HTTP claim/reply: SUCCEEDED, attempts=1, command={command_id}")


COAP_JARS = (
    "org/eclipse/californium/californium-core/3.14.0/californium-core-3.14.0.jar",
    "org/eclipse/californium/element-connector/3.14.0/element-connector-3.14.0.jar",
    "org/eclipse/californium/scandium/3.14.0/scandium-3.14.0.jar",
    "org/slf4j/slf4j-api/2.0.18/slf4j-api-2.0.18.jar",
)


def coap_helper(app, project_key, target, other, command_id, candidate_maven_repo):
    certs = DEPLOY_DIR / "certs.local"
    require(certs.is_dir() and (certs / "device.crt").is_file()
            and (certs / "device.key").is_file(), "本机 CoAP/DTLS 证书缺失")
    source = HERE / "SmokeCoapCommand.java"
    require(source.is_file(), "SmokeCoapCommand.java 缺失")
    repo = Path(candidate_maven_repo).expanduser().resolve()
    jars = [repo / name for name in COAP_JARS]
    require(all(jar.is_file() for jar in jars), "本机候选 Maven 缓存缺少 CoAP/DTLS 探针依赖")
    message_id = uuid7()
    stdin = "\n".join((project_key, target["key"], target["secret"], other["key"],
                       other["secret"], command_id, message_id, utc_now())) + "\n"
    with tempfile.TemporaryDirectory(prefix="v3b-coap-") as temporary:
        work = Path(temporary)
        libs = work / "lib"
        libs.mkdir()
        for jar in jars:
            shutil.copy2(jar, libs / jar.name)
        compile_result = subprocess.run(["javac", "-cp", str(libs / "*"), "-d", str(work),
                                         str(source)], capture_output=True, text=True, check=False)
        require(compile_result.returncode == 0, "CoAP 命令探针 Java 编译失败")
        command = ["docker", "run", "--rm", "-i", "--network", f"container:{app}",
                   "-v", f"{work}:/work:ro", "-v", f"{certs}:/certs:ro",
                   "eclipse-temurin:21-jre", "java", "-cp", "/work:/work/lib/*",
                   "SmokeCoapCommand", "/certs"]
        result = subprocess.run(command, input=stdin, capture_output=True, text=True,
                                check=False, timeout=75)
    require(result.returncode == 0, "CoAP/DTLS 领取或回复探针失败")
    output = result.stdout.strip()
    require(f"command={command_id}" in output
            and "COAP initial-empty=204 claim=205 other-reply=404"
            in output
            and "target-reply=204 final-empty=204" in output
            and "attempt=1" in output,
            "CoAP 探针未返回完整的稳定通过标记")


def run_coap(api, pg, app, pid, project_key, target, other, maven_repo):
    path, command_id, _ = submit(api, pid, target, "COAP")
    coap_helper(app, project_key, target, other, command_id, maven_repo)
    poll_success(api, path, command_id)
    db_facts(pg, pid, command_id, target["id"])
    print(f"CoAP claim/reply: SUCCEEDED, attempts=1, command={command_id}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate-sha256", required=True,
                        help="固定 jagonzn JAR 摘要；比较本地文件与运行容器")
    parser.add_argument("--candidate-jar", required=True, help="固定候选 JAR 的宿主绝对路径")
    parser.add_argument("--maven-repo", default=str(Path.home() / ".m2/repository"),
                        help="包含 Californium 3.14.0 和 slf4j-api 2.0.18 的本机 Maven 缓存")
    args = parser.parse_args()
    app, pg = candidate_check(args.candidate_sha256, args.candidate_jar)
    api = Api()
    suffix = secrets.token_hex(5)
    pid, project_key, devices = setup(api, pg, suffix)
    print(f"V3b fixture: project={pid}, prefix=v3b-{suffix}, candidate={args.candidate_sha256}")
    run_http(api, pg, pid, project_key, devices["HTTP"]["target"], devices["HTTP"]["other"])
    run_coap(api, pg, app, pid, project_key,
             devices["COAP"]["target"], devices["COAP"]["other"], args.maven_repo)
    candidate_check(args.candidate_sha256, args.candidate_jar)
    print("V3b HTTPS 与 CoAP/DTLS 命令领取、回复、隔离及持久尝试检查通过")


if __name__ == "__main__":
    try:
        main()
    except (ProbeError, KeyError, ValueError, OSError, subprocess.TimeoutExpired) as error:
        message = str(error) if isinstance(error, ProbeError) else type(error).__name__
        print("V3b FAIL: " + message, file=sys.stderr)
        sys.exit(1)

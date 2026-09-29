"""V3a black-box MQTT/TCP command probe for the isolated jagonzn candidate.

Python 3.11+, standard library only. The probe creates one disposable project and
four devices, then checks a successful device reply and a three-attempt response
timeout on each real transport. It does not change services or database facts
other than its uniquely prefixed fixture and the email verification of that fixture.
"""

import argparse
import http.cookiejar
import hashlib
import json
import re
import secrets
import socket
import ssl
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent.parent
BASE = "http://127.0.0.1:18080"
TERMINAL = {"SUCCEEDED", "FAILED", "TIMED_OUT"}


class ProbeError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise ProbeError(message)


def uuid7():
    # Python 3.11 has no uuid7(). Set RFC 9562 version and variant bits.
    millis = int(time.time() * 1000)
    value = (millis << 80) | secrets.randbits(80)
    value = (value & ~(0xF << 76)) | (7 << 76)
    value = (value & ~(0x3 << 62)) | (0x2 << 62)
    return str(uuid.UUID(int=value))


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def compose(*args):
    command = ["docker", "compose", "--env-file", str(HERE / ".env.local"),
               "-f", str(HERE / "compose.yml"), *args]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    require(result.returncode == 0, "jagonzn Docker Compose 命令失败")
    return result.stdout.strip()


def candidate_check(expected, candidate_jar):
    require((HERE / ".env.local").is_file(), "缺少 jagonzn/deploy/.env.local")
    require(len(expected) == 64 and all(c in "0123456789abcdef" for c in expected),
            "--candidate-sha256 应为小写 SHA-256")
    jar = Path(candidate_jar).expanduser().resolve()
    require(jar.is_file(), "候选 JAR 不存在")
    digest = hashlib.sha256()
    with jar.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    require(actual == expected, "本地候选 JAR 摘要不匹配")
    container = compose("--profile", "app", "ps", "-q", "app")
    require(container, "jagonzn app 容器未运行")
    running = subprocess.run(["docker", "exec", container, "sha256sum", "/app/jagonzn-service.jar"],
                             capture_output=True, text=True, check=False)
    running_digest = running.stdout.split()
    require(running.returncode == 0 and running_digest and running_digest[0] == expected,
            "运行中的 jagonzn JAR 与固定候选摘要不一致")
    pg = compose("ps", "-q", "postgres")
    require(pg, "jagonzn PostgreSQL 容器未运行")
    return pg


def verify_own_account(pg, email):
    # email is generated here from a fixed alphabet, never supplied externally.
    sql = "UPDATE sys_account SET email_verified_at=now() WHERE email='" + email + "'"
    result = subprocess.run(["docker", "exec", pg, "psql", "-U", "jagonzn", "-d", "jagonzn",
                             "-v", "ON_ERROR_STOP=1", "-Atqc", sql],
                            capture_output=True, text=True, check=False)
    require(result.returncode == 0, "一次性账号验证准备失败")


class Api:
    def __init__(self):
        self.token = ""
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.last_request = 0.0

    def call(self, method, path, data=None, expected=200, headers=None):
        # Console REST has account-second and project/tenant-minute budgets.
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
            request = urllib.request.Request(BASE + path, body, request_headers, method=method)
            try:
                with self.opener.open(request, timeout=15) as response:
                    status = response.status
                    raw = response.read()
            except urllib.error.HTTPError as error:
                # Only a bounded numeric/stable code and Retry-After are diagnostic.
                # Never echo a server message/body, which can include request input.
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
                retry = error.headers.get("Retry-After", "")
                retry_text = f", Retry-After={retry}s" if retry.isdecimal() and len(retry) <= 5 else ""
                if error.code == 429 and code in ("10029", "unknown") and attempt < 3:
                    time.sleep(1.2)
                    continue
                raise ProbeError(f"{method} {path} 返回 HTTP {error.code}，code={code}{retry_text}，预期 {expected}") from None
            except (urllib.error.URLError, TimeoutError):
                raise ProbeError(f"{method} {path} 网络失败") from None
            require(status == expected, f"{method} {path} 返回 HTTP {status}，预期 {expected}")
            return json.loads(raw) if raw else None


def setup(api, pg, suffix):
    email = f"v3a-{suffix}@example.test"
    password = secrets.token_urlsafe(36)
    api.call("POST", "/api/v1/auth/register", {"email": email, "password": password}, 204)
    verify_own_account(pg, email)
    api.token = api.call("POST", "/api/v1/auth/login", {
        "email": email, "password": password})["accessToken"]
    project = api.call("POST", "/api/v1/projects", {
        "name": f"v3a-{suffix}", "region": "sh-1"})
    pid = project["id"]
    api.token = api.call("POST", "/api/v1/auth/switch-project", {
        "projectId": pid})["accessToken"]
    dtype = api.call("POST", f"/api/v1/projects/{pid}/device-types", {
        "typeKey": f"v3a_{suffix}", "name": "V3a command probe", "deviceKind": "DIRECT",
        "payloadProtocol": "STANDARD", "networkType": "WIFI"}, 201)
    tid = dtype["id"]
    api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/commands", {
        "commandKey": "v3a_ping", "name": "V3a ping", "description": "Isolated command probe",
        "inputSchema": '{"type":"object"}', "outputSchema": '{"type":"object"}',
        "timeoutSeconds": 8, "sortOrder": 0}, 201)
    api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/publish", expected=200)
    devices = {}
    for protocol in ("MQTT", "TCP"):
        devices[protocol] = {}
        for role in ("target", "other"):
            key = f"v3a-{protocol.lower()}-{role}-{suffix}"
            device = api.call("POST", f"/api/v1/projects/{pid}/devices", {
                "deviceTypeId": tid, "deviceKey": key, "name": f"V3a {protocol} {role}"}, 201)
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


def exact(stream, length):
    result = bytearray()
    while len(result) < length:
        data = stream.recv(length - len(result))
        require(data, "设备连接在应答前关闭")
        result.extend(data)
    return bytes(result)


def utf8(value):
    encoded = value.encode()
    return struct.pack("!H", len(encoded)) + encoded


def variable_length(length):
    result = bytearray()
    while True:
        digit = length % 128
        length //= 128
        result.append(digit | (128 if length else 0))
        if not length:
            return bytes(result)


class MqttDevice:
    def __init__(self, project_key, device, port=21883):
        self.project_key = project_key
        self.device = device
        self.stream = socket.create_connection(("127.0.0.1", port), timeout=8)
        self.stream.settimeout(8)
        self.packet_id = 1
        self.last_io = time.monotonic()
        client_id = "v3a-" + secrets.token_hex(8)
        content = (utf8("MQTT") + b"\x04\xc2\x00\x1e" + utf8(client_id)
                   + utf8(project_key + "/" + device["key"]) + utf8(device["secret"]))
        self.send(0x10, content)
        kind, body = self.read_packet()
        require(kind == 0x20 and body == b"\x00\x00",
                f"MQTT 认证失败，CONNACK={body.hex() if kind == 0x20 else 'unexpected'}")
        self.prefix = f"tc/v1/{project_key}/{device['key']}"
        self.send(0x82, struct.pack("!H", self.next_id())
                  + utf8(self.prefix + "/down/command/+") + b"\x01")
        kind, body = self.read_packet()
        require(kind == 0x90 and len(body) == 3 and body[2] == 1,
                "MQTT 下行订阅失败")
        self.stream.settimeout(1)

    def next_id(self):
        self.packet_id = self.packet_id % 65535 + 1
        return self.packet_id

    def send(self, kind, body=b""):
        self.stream.sendall(bytes([kind]) + variable_length(len(body)) + body)
        self.last_io = time.monotonic()

    def read_packet(self):
        first = exact(self.stream, 1)[0]
        remaining = 0
        multiplier = 1
        for _ in range(4):
            digit = exact(self.stream, 1)[0]
            remaining += (digit & 127) * multiplier
            if not digit & 128:
                break
            multiplier *= 128
        else:
            raise ProbeError("MQTT 报文长度无效")
        require(remaining <= 65536, "MQTT 报文超限")
        self.last_io = time.monotonic()
        return first, exact(self.stream, remaining)

    def receive(self, deadline):
        while time.monotonic() < deadline:
            if time.monotonic() - self.last_io >= 8:
                self.send(0xC0)
            try:
                kind, body = self.read_packet()
            except socket.timeout:
                continue
            if kind == 0xD0:
                continue
            require(kind >> 4 == 3, f"MQTT 意外报文类型 {kind >> 4}")
            topic_length = struct.unpack("!H", body[:2])[0]
            topic = body[2:2 + topic_length].decode()
            offset = 2 + topic_length
            if (kind >> 1) & 3:
                packet_id = body[offset:offset + 2]
                offset += 2
                self.send(0x40, packet_id)
            prefix = self.prefix + "/down/command/"
            require(topic.startswith(prefix), "MQTT 下行主题越过原接收者")
            return topic[len(prefix):], json.loads(body[offset:])
        raise ProbeError("MQTT 等待设备下行超时")

    def reply(self, command_id, status="SUCCESS"):
        payload = {"messageId": uuid7(), "occurredAt": utc_now(), "status": status,
                   "output": {"probe": "v3a"} if status == "SUCCESS" else {}}
        topic = self.prefix + f"/up/command/{command_id}/reply"
        packet_id = self.next_id()
        self.send(0x32, utf8(topic) + struct.pack("!H", packet_id)
                  + json.dumps(payload, separators=(",", ":")).encode())
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            try:
                kind, body = self.read_packet()
            except socket.timeout:
                continue
            if kind == 0x40 and body == struct.pack("!H", packet_id):
                return
        raise ProbeError("MQTT 回复未收到 PUBACK")

    def close(self):
        try:
            self.send(0xE0)
        finally:
            self.stream.close()


def tc_frame(kind, payload):
    body = json.dumps(payload, separators=(",", ":")).encode()
    return struct.pack("!2sBBHI", b"TC", 1, kind, 0, len(body)) + body


class TcpDevice:
    def __init__(self, project_key, device):
        raw = socket.create_connection(("127.0.0.1", 18883), timeout=8)
        # Only this localhost candidate uses a self-signed certificate.
        self.stream = ssl._create_unverified_context().wrap_socket(raw, server_hostname="localhost")
        self.stream.settimeout(8)
        self.last_io = time.monotonic()
        self.send(1, {"projectKey": project_key, "deviceKey": device["key"],
                      "secret": device["secret"]})
        kind, body = self.read_frame()
        require(kind == 2 and body.get("status") == "OK", "TCP 认证失败")
        self.stream.settimeout(1)

    def send(self, kind, payload):
        self.stream.sendall(tc_frame(kind, payload))
        self.last_io = time.monotonic()

    def read_frame(self):
        magic, version, kind, flags, length = struct.unpack("!2sBBHI", exact(self.stream, 10))
        require(magic == b"TC" and version == 1 and flags == 0 and length <= 65536,
                "TCP 帧头无效")
        self.last_io = time.monotonic()
        return kind, json.loads(exact(self.stream, length)) if length else {}

    def receive(self, deadline):
        while time.monotonic() < deadline:
            if time.monotonic() - self.last_io >= 8:
                self.send(3, {})
            try:
                kind, body = self.read_frame()
            except socket.timeout:
                continue
            if kind == 4:
                continue
            require(kind == 0x11, f"TCP 意外帧类型 {kind}")
            return body["commandId"], body
        raise ProbeError("TCP 等待设备下行超时")

    def reply(self, command_id, unauthorized=False):
        message_id = uuid7()
        self.send(0x12, {"commandId": command_id, "messageId": message_id,
                         "occurredAt": utc_now(), "status": "SUCCESS", "output": {"probe": "v3a"}})
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            try:
                kind, body = self.read_frame()
            except socket.timeout:
                continue
            if kind == 4:
                continue
            if unauthorized:
                require(kind == 0x7F and body.get("errorCode") == "COMMAND_NOT_FOUND",
                        "非原接收 TCP 设备未被 COMMAND_NOT_FOUND 拒绝")
            else:
                require(kind == 0x13 and body.get("requestType") == "REPLY"
                        and body.get("messageId") == message_id
                        and body.get("commandId") == command_id
                        and body.get("status") == "ACCEPTED", "TCP 回复未获得匹配 ACCEPTED")
            return
        raise ProbeError("TCP 回复受理超时")

    def close(self):
        self.stream.close()


def command_path(project_id, device_id):
    return f"/api/v1/projects/{project_id}/devices/{device_id}/commands"


def get_command(api, path, command_id):
    return api.call("GET", path + "/" + command_id)


def poll(api, path, command_id, predicate, seconds=25):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        value = get_command(api, path, command_id)
        if predicate(value):
            return value
        time.sleep(0.35)
    raise ProbeError(f"命令 {command_id} 状态等待超时")


def check_receiver(value, expected_id):
    require(value.get("deviceId") == expected_id
            and value.get("connectionDeviceId") == expected_id,
            "命令事实的原目标或原接收者身份变化")


def run_protocol(api, project_id, project_key, protocol, device, other_device):
    path = command_path(project_id, device["id"])
    transport = MqttDevice(project_key, device) if protocol == "MQTT" else TcpDevice(project_key, device)
    other = MqttDevice(project_key, other_device) if protocol == "MQTT" else TcpDevice(project_key, other_device)
    try:
        for mode in ("reply", "timeout"):
            marker = secrets.token_hex(6)
            accepted = api.call("POST", path, {
                "commandKey": "v3a_ping", "input": {"marker": marker, "mode": mode}}, 202,
                {"Idempotency-Key": f"v3a-{protocol.lower()}-{mode}-{marker}"})
            command_id = accepted["id"]
            check_receiver(accepted, device["id"])
            require(accepted["status"] == "ACCEPTED", "命令未可靠受理")
            expected_attempts = 1 if mode == "reply" else 3
            for number in range(1, expected_attempts + 1):
                observed_id, body = transport.receive(time.monotonic() + 20)
                require(observed_id == command_id and body.get("commandKey") == "v3a_ping"
                        and body.get("input") == {"marker": marker, "mode": mode}
                        and body.get("attempt") == number,
                        f"{protocol} 第 {number} 次下行不匹配原命令")
                if protocol == "MQTT":
                    require(body.get("targetDeviceKey") == device["key"],
                            "MQTT 下行目标键不匹配原接收者")
                if mode == "reply":
                    if protocol == "MQTT":
                        other.reply(command_id)
                        # MQTT PUBACK proves Broker receipt, not callback completion.
                        time.sleep(1)
                    else:
                        other.reply(command_id, unauthorized=True)
                    interim = get_command(api, path, command_id)
                    check_receiver(interim, device["id"])
                    require(interim["status"] not in ("SUCCEEDED", "FAILED"),
                            "非原接收者回复改变了命令终态")
                    transport.reply(command_id)
            terminal = poll(api, path, command_id,
                            lambda c: c["status"] in TERMINAL, seconds=35)
            check_receiver(terminal, device["id"])
            require(terminal["attemptCount"] == expected_attempts,
                    "命令尝试总数不符")
            expected_status = "SUCCEEDED" if mode == "reply" else "TIMED_OUT"
            require(terminal["status"] == expected_status,
                    f"{protocol} {mode} 终态不是 {expected_status}")
            if mode == "timeout":
                require(terminal.get("failureCode") == "RESPONSE_TIMEOUT",
                        "设备不回复应标记 RESPONSE_TIMEOUT")
            attempts = terminal.get("attempts") or []
            require(len(attempts) == expected_attempts
                    and sorted(a["attemptNo"] for a in attempts) == list(range(1, expected_attempts + 1)),
                    "持久派发尝试明细不完整")
            print(f"{protocol} {mode}: {terminal['status']}, attempts={expected_attempts}, command={command_id}")
    finally:
        other.close()
        transport.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate-sha256", required=True,
                        help="固定 jagonzn JAR 的 SHA-256；与本地文件及运行容器逐字比较")
    parser.add_argument("--candidate-jar", required=True,
                        help="固定候选 JAR 的宿主绝对路径，例如 /tmp/.../jagonzn-service-0.0.1-rc.20260927.1.jar")
    args = parser.parse_args()
    pg = candidate_check(args.candidate_sha256, args.candidate_jar)
    suffix = secrets.token_hex(5)
    api = Api()
    pid, project_key, devices = setup(api, pg, suffix)
    print(f"V3a fixture: project={pid}, prefix=v3a-{suffix}, candidate={args.candidate_sha256}")
    for protocol in ("MQTT", "TCP"):
        run_protocol(api, pid, project_key, protocol,
                     devices[protocol]["target"], devices[protocol]["other"])
    candidate_check(args.candidate_sha256, args.candidate_jar)
    print("V3a MQTT/TCP 命令下行、真实回复、三次响应超时及原接收者身份检查通过")


if __name__ == "__main__":
    try:
        main()
    except (ProbeError, KeyError, ValueError, OSError) as error:
        # Never print an exception chain: transport and HTTP libraries can echo input.
        message = str(error) if isinstance(error, ProbeError) else type(error).__name__
        print("V3a FAIL: " + message, file=sys.stderr)
        sys.exit(1)

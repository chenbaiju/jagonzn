"""V4b black-box MQTT disconnect/reconnect probe for one jagonzn candidate.

Python 3.11+ standard library only. Read a single JSON fixture from stdin. Secrets
are never printed or passed as process arguments. The fixture must have a live
Console project bearer and one published HTTP-enabled device/model property.
"""

import argparse
import hashlib
import json
import re
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


DEPLOY_DIR = Path(__file__).resolve().parent.parent
BASE = "http://127.0.0.1:18080"


class ProbeError(Exception):
    pass


def check(ok, message):
    if not ok:
        raise ProbeError(message)


def uuid7():
    # uuid.uuid7 is unavailable on Python 3.11.
    import secrets

    value = (int(time.time() * 1000) << 80) | secrets.randbits(80)
    value = (value & ~(15 << 76)) | (7 << 76)
    value = (value & ~(3 << 62)) | (2 << 62)
    return str(uuid.UUID(int=value))


def compose(*args):
    result = subprocess.run(
        ["docker", "compose", "--env-file", str(DEPLOY_DIR / ".env.local"),
         "-f", str(DEPLOY_DIR / "compose.yml"), *args],
        capture_output=True, text=True, check=False,
    )
    check(result.returncode == 0, "jagonzn Docker Compose 命令失败")
    return result.stdout.strip()


def candidate_check(jar_path, expected):
    check((DEPLOY_DIR / ".env.local").is_file(), "缺少 jagonzn/deploy/.env.local")
    check(bool(re.fullmatch(r"[0-9a-f]{64}", expected)), "候选摘要必须是小写 SHA-256")
    path = Path(jar_path).expanduser().resolve()
    check(path.is_file(), "候选 JAR 不存在")
    sha = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            sha.update(chunk)
    check(sha.hexdigest() == expected, "候选 JAR 文件摘要不匹配")
    container = compose("--profile", "app", "ps", "-q", "app")
    check(bool(container), "jagonzn app 容器未运行")
    running = subprocess.run(
        ["docker", "exec", container, "sha256sum", "/app/jagonzn-service.jar"],
        capture_output=True, text=True, check=False,
    )
    words = running.stdout.split()
    check(running.returncode == 0 and bool(words) and words[0] == expected,
          "运行中 JAR 与固定候选摘要不一致")
    postgres = compose("ps", "-q", "postgres")
    check(bool(postgres), "jagonzn PostgreSQL 容器未运行")
    return postgres


def utf(value):
    raw = value.encode("utf-8")
    return struct.pack("!H", len(raw)) + raw


def variable(value):
    out = bytearray()
    while True:
        digit = value % 128
        value //= 128
        out.append(digit | (128 if value else 0))
        if not value:
            return bytes(out)


def read_exact(sock, size):
    result = bytearray()
    while len(result) < size:
        data = sock.recv(size - len(result))
        if not data:
            raise EOFError("MQTT 连接提前关闭")
        result.extend(data)
    return bytes(result)


def read_packet(sock):
    header = read_exact(sock, 1)[0]
    size = 0
    scale = 1
    for _ in range(4):
        digit = read_exact(sock, 1)[0]
        size += (digit & 127) * scale
        if digit & 128:
            scale *= 128
        else:
            check(size <= 32768, "MQTT 报文超过应用 Broker 上限")
            return header, read_exact(sock, size)
    raise ProbeError("MQTT 报文长度格式无效")


class Mqtt:
    def __init__(self, ticket, version):
        self.ticket = ticket
        self.version = version
        self.sock = socket.create_connection(("127.0.0.1", 31883), timeout=8)
        self.sock.settimeout(10)
        # Intentionally request a persistent session. The app zone must clamp it to zero.
        properties = b"\x05\x11\xff\xff\xff\xff" if version == 5 else b""
        body = (utf("MQTT") + bytes([version, 0xC0]) + b"\x00\xb4" + properties
                + utf(ticket["clientId"]) + utf(ticket["username"])
                + utf(ticket["credential"]))
        self.send(0x10, body)
        header, ack = self.read()
        check(header == 0x20 and len(ack) >= 2 and ack[1] == 0,
              f"MQTT{version} CONNECT 未获允许")
        check(ack[0] == 0, f"MQTT{version} 重连 Session Present 不为 0")

    def send(self, header, body=b""):
        self.sock.sendall(bytes([header]) + variable(len(body)) + body)

    def read(self):
        return read_packet(self.sock)

    def subscribe(self, topic, allowed=True):
        body = b"\x00\x01" + (b"\x00" if self.version == 5 else b"") + utf(topic) + b"\x01"
        self.send(0x82, body)
        try:
            header, ack = self.read()
        except EOFError:
            if not allowed:  # deny_action=disconnect is a valid ACL denial.
                return
            raise
        if not allowed and header == 0xE0:  # MQTT5 DISCONNECT with authorization reason.
            return
        check(header == 0x90 and len(ack) >= 3, "MQTT SUBACK 缺失")
        reason = ack[-1]
        check(reason == 1 if allowed else reason >= 0x80,
              "MQTT 订阅授权结果错误")

    def receive_event(self, expected_id):
        self.sock.settimeout(35)
        header, body = self.read()
        check((header & 0xF7) == 0x32, "实时事件并非 QoS1 非 retained PUBLISH")
        topic_size = struct.unpack("!H", body[:2])[0]
        topic = body[2:2 + topic_size].decode("utf-8")
        check(topic == self.ticket["topic"], "实时事件主题越权")
        offset = 2 + topic_size
        packet_id = body[offset:offset + 2]
        offset += 2
        if self.version == 5:
            # EMQX may attach an MQTT5 subscription identifier, so decode its length.
            count = 0
            scale = 1
            while True:
                digit = body[offset]
                offset += 1
                count += (digit & 127) * scale
                if not digit & 128:
                    break
                scale *= 128
            offset += count
        event = json.loads(body[offset:])
        self.send(0x40, packet_id)
        check(event.get("eventId") == expected_id, "实时事件 eventId 或顺序错误")
        return event

    def expect_no_publish(self, seconds=2):
        self.sock.settimeout(seconds)
        try:
            header, _ = self.read()
        except socket.timeout:
            return
        check(header >> 4 != 3, "断线期间事件在零会话重连后被重放")
        raise ProbeError("重连后出现未预期的 MQTT 控制帧")

    def close(self, large_expiry=False):
        try:
            if large_expiry and self.version == 5:
                self.send(0xE0, b"\x00\x05\x11\xff\xff\xff\xff")
            else:
                self.send(0xE0)
        except OSError:
            # A denied ACL may have already closed this connection.
            pass
        finally:
            self.sock.close()


class Api:
    def __init__(self, token):
        self.token = token
        self.last = 0.0

    def call(self, method, path, body=None, expected=200, headers=None):
        since = time.monotonic() - self.last
        if since < 0.35:
            time.sleep(0.35 - since)
        self.last = time.monotonic()
        request_headers = {"Authorization": "Bearer " + self.token, **(headers or {})}
        raw = None
        if body is not None:
            raw = json.dumps(body, separators=(",", ":")).encode()
            request_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(BASE + path, raw, request_headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                check(response.status == expected, f"{method} {path} HTTP {response.status}")
                content = response.read()
                return json.loads(content) if content else None
        except urllib.error.HTTPError as error:
            raise ProbeError(f"{method} {path} HTTP {error.code}, 预期 {expected}") from None


def issue(api, fixture):
    project = fixture["projectId"]
    response = api.call("POST", f"/api/v1/projects/{project}/realtime-tickets", {
        "protocol": "MQTT", "eventTypes": ["device.property.report"], "devices": [{
            "deviceId": fixture["deviceId"],
            "expectedModelVersionId": fixture["modelVersionId"],
            "propertyKeys": [fixture["propertyKey"]],
        }],
    }, 201, {"Idempotency-Key": str(uuid.uuid4())})
    check(all(response.get(k) for k in ("ticketId", "credential", "topic", "clientId", "username")),
          "实时票据缺少 MQTT 连接字段")
    return response


def report(fixture, value, message_id=None, occurred_at=None):
    message_id = message_id or uuid7()
    body = json.dumps({
        "messageId": message_id,
        "occurredAt": occurred_at or datetime.now(timezone.utc).isoformat(),
        "payload": {fixture["propertyKey"]: value},
    }, separators=(",", ":")).encode()
    request = urllib.request.Request(
        "https://127.0.0.1:18443/device-access/v1/property/report", body,
        {"Content-Type": "application/json", "X-TC-Device-Key": fixture["deviceKey"],
         "X-TC-Device-Secret": fixture["deviceSecret"]}, method="POST",
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=10,
                                        context=ssl._create_unverified_context()) as response:
                check(response.status == 202, "设备 HTTPS 上报未获受理")
                break
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < 2:
                # Preserve the original message ID and allow the device auth/
                # uplink short window to elapse; do not alter production limits.
                time.sleep(65)
                continue
            raise ProbeError(f"设备 HTTPS 上报 HTTP {error.code}") from None
    return message_id


def delivery(pg, message_id, ticket_id):
    # UUIDs are generated/validated locally. Query only for evidence, not mutation.
    sql = ("SELECT status FROM integ_realtime_delivery WHERE event_id='" + message_id
           + "' AND ticket_id='" + ticket_id + "' ORDER BY id LIMIT 1")
    result = subprocess.run(
        ["docker", "exec", pg, "psql", "-U", "jagonzn", "-d", "jagonzn",
         "-v", "ON_ERROR_STOP=1", "-Atqc", sql],
        capture_output=True, text=True, check=False,
    )
    # A missing/hidden row does not overturn the client or REST result. The
    # realtime source has an asynchronous pre-Kafka window and RLS may hide it.
    return result.stdout.strip() if result.returncode == 0 else "UNAVAILABLE"


def observe_delivery(pg, message_id, ticket_id):
    # The DB result is supporting evidence only. Broker acceptance, a READY
    # retry, or a still-in-flight attempt does not promise terminal delivery.
    end = time.monotonic() + 6
    status = "NONE"
    while time.monotonic() < end:
        status = delivery(pg, message_id, ticket_id) or "NONE"
        if status in ("DELIVERED", "CANCELLED", "FAILED", "UNAVAILABLE"):
            break
        time.sleep(0.5)
    return status


def current(api, fixture, expected):
    path = f"/api/v1/projects/{fixture['projectId']}/devices/current-values/query"
    end = time.monotonic() + 20
    while time.monotonic() < end:
        response = api.call("POST", path, {
            "deviceIds": [fixture["deviceId"]], "propertyKeys": [fixture["propertyKey"]],
        })
        items = response.get("items", [])
        if items and items[0].get("values", {}).get(fixture["propertyKey"]) == expected:
            return
        time.sleep(0.5)
    raise ProbeError("断线期间当前值未能通过 REST 补拉")


def verify_fixture(fixture):
    required = ("token", "projectId", "modelVersionId", "deviceId",
                "deviceKey", "deviceSecret", "propertyKey")
    check(isinstance(fixture, dict) and all(isinstance(fixture.get(k), str)
                                           and fixture[k] for k in required), "stdin 缺少夹具字段")
    for key in ("projectId", "modelVersionId", "deviceId"):
        check(str(uuid.UUID(fixture[key])) == fixture[key], f"{key} 不是规范 UUID")
    check(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", fixture["deviceKey"]),
          "deviceKey 必须是 projectKey/deviceKey 复合身份")


def run_one(api, pg, fixture, ticket, other_ticket, version):
    value = 10 + version * 5
    first = Mqtt(ticket, version)
    try:
        first.subscribe(ticket["topic"])
        online = report(fixture, value)
        event = first.receive_event(online)
        check(event.get("deviceId") == fixture["deviceId"] and
              event.get("eventType") == "device.property.report" and
              fixture["propertyKey"] in event.get("properties", {}),
              "在线事件设备或属性不匹配")
    finally:
        first.close(large_expiry=True)
    offline_value = value + 1
    offline = report(fixture, offline_value)
    current(api, fixture, offline_value)
    state = observe_delivery(pg, offline, ticket["ticketId"])
    reconnect = Mqtt(ticket, version)
    try:
        reconnect.subscribe(ticket["topic"])
        reconnect.expect_no_publish()
        replay_time = datetime.now(timezone.utc).isoformat()
        online_again = report(fixture, value + 2, occurred_at=replay_time)
        event = reconnect.receive_event(online_again)
        check(event.get("deviceId") == fixture["deviceId"] and
              fixture["propertyKey"] in event.get("properties", {}),
              "重连后新事件设备或属性不匹配")
        check(report(fixture, value + 2, online_again, replay_time) == online_again,
              "原消息 ID 重放未得到幂等受理")
        reconnect.expect_no_publish(3)
        # A separate ticket has a distinct frozen topic. The broker must deny it.
        reconnect.subscribe(other_ticket["topic"], allowed=False)
    finally:
        reconnect.close()
    print(f"MQTT{version}: same-ticket reconnect session-present=0, offline REST recovery, "
          f"new event and cross-ticket ACL passed; offline broker delivery={state}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy-dir", required=True,
                        help="含 .env.local 与 compose.yml 的独立候选部署目录")
    parser.add_argument("--candidate-jar", required=True)
    parser.add_argument("--candidate-sha256", required=True)
    args = parser.parse_args()
    global DEPLOY_DIR
    DEPLOY_DIR = Path(args.deploy_dir).expanduser().resolve()
    check((DEPLOY_DIR / "compose.yml").is_file(), "部署目录缺少 compose.yml")
    fixture = json.load(sys.stdin)
    verify_fixture(fixture)
    pg = candidate_check(args.candidate_jar, args.candidate_sha256)
    api = Api(fixture["token"])
    # The parent public-integration smoke already reports through this device;
    # start each three-event protocol sequence in a fresh short-rate window.
    time.sleep(65)
    ticket3 = issue(api, fixture)
    ticket5 = issue(api, fixture)
    check(ticket3["topic"] != ticket5["topic"], "独立票据共用了同一主题")
    run_one(api, pg, fixture, ticket3, ticket5, 4)
    time.sleep(65)
    run_one(api, pg, fixture, ticket5, ticket3, 5)
    candidate_check(args.candidate_jar, args.candidate_sha256)
    print("V4b fixed-candidate public MQTT reconnect probe passed")


if __name__ == "__main__":
    try:
        main()
    except (ProbeError, OSError, ValueError, KeyError, TypeError, TimeoutError) as error:
        print(f"V4b probe failed: {error}", file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""Run one harmless MQTT command through service facts and the private cloud Inbox.

Only the isolated LAN stack is eligible. Credentials remain in owner.local.json;
the runner prints command and event IDs but never the owner or device secrets.
"""

from __future__ import annotations

import argparse
import hashlib
import http.cookiejar
import json
from pathlib import Path
import re
import runpy
import secrets
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parent
OWNER = runpy.run_path(str(ROOT / "activate-owner.py"))
MQTT = runpy.run_path(str(ROOT.parent / "tests" / "smoke-command-downlink-v3a.py"))
CERT = ROOT / "certs.local" / "lan.crt"
BASE = "https://127.0.0.1:18444"
SERVICE_PG = "jagonzn-lan-acceptance-postgres-1"
CLOUD_PG = "jagonzn-lan-acceptance-cloud-postgres-1"
BROKER = "jagonzn-lan-acceptance-redpanda-1"
CLOUD_PROXY = "jagonzn-lan-acceptance-cloud-https-1"
MQTT_PROXY = "jagonzn-lan-acceptance-mqtt-lab-proxy-1"


def require(value: bool, reason: str) -> None:
    if not value:
        raise RuntimeError(reason)


def run(*args: str, payload: bytes | None = None) -> str:
    result = subprocess.run(args, input=payload, capture_output=True, timeout=60)
    require(result.returncode == 0, "隔离容器命令失败")
    return result.stdout.decode().strip()


def db(container: str, user: str, database: str, sql: str) -> str:
    return run("docker", "exec", container, "psql", "-U", user, "-d", database,
               "-v", "ON_ERROR_STOP=1", "-Atqc", sql)


def service(sql: str) -> str:
    return db(SERVICE_PG, "jagonzn", "jagonzn", sql)


def cloud(sql: str) -> str:
    return db(CLOUD_PG, "jagonzn_cloud", "jagonzn_cloud", sql)


def wait(check, reason: str, seconds: int = 90):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        result = check()
        if result:
            return result
        time.sleep(1)
    raise RuntimeError(reason)


class Api:
    def __init__(self):
        self.token = ""
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
            urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=str(CERT))))

    def call(self, method: str, path: str, data=None, expected: int = 200, headers=None):
        body = None if data is None else json.dumps(data, separators=(",", ":")).encode()
        request_headers = dict(headers or {})
        if body is not None:
            request_headers["Content-Type"] = "application/json"
        if self.token:
            request_headers["Authorization"] = "Bearer " + self.token
        request = urllib.request.Request(BASE + path, body, request_headers, method=method)
        try:
            with self.opener.open(request, timeout=20) as response:
                require(response.status == expected, f"{method} {path} 状态不符")
                raw = response.read(65536)
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"{method} {path} 返回 HTTP {error.code}，预期 {expected}") from None
        return json.loads(raw) if raw else None


def candidate(service_jar: Path, service_digest: str,
              cloud_jar: Path, cloud_digest: str) -> None:
    for jar, digest, container, mounted in (
        (service_jar, service_digest, "jagonzn-lan-acceptance-service", "/app/jagonzn-service.jar"),
        (cloud_jar, cloud_digest, "jagonzn-lan-acceptance-cloud-1", "/app/jagonzn-cloud.jar")):
        require(jar.is_file() and len(digest) == 64, "固定候选 JAR 或摘要缺失")
        with jar.open("rb") as stream:
            checksum = hashlib.sha256()
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                checksum.update(block)
        require(checksum.hexdigest() == digest, "宿主候选摘要不符")
        actual = run("docker", "exec", container, "sha256sum", mounted).split()[0]
        require(actual == digest, "运行容器不是同一固定候选")
    require(run("docker", "exec", "jagonzn-lan-acceptance-service",
                "printenv", "JAGONZN_INGRESS_HANDOFF_ENABLED") == "true",
            "service 未启用隔离 MQTT 交接")
    require(run("docker", "port", MQTT_PROXY, "1883") == "127.0.0.1:21884",
            "MQTT 实验端口未绑定预期回环")
    routes = run("docker", "exec", MQTT_PROXY, "ip", "route").splitlines()
    require(not any(route.startswith("default ") for route in routes),
            "MQTT 实验代理仍有默认路由")


def fixture(api: Api):
    owner = OWNER["owner"]()
    api.token = api.call("POST", "/api/v1/auth/login", {
        "email": owner["email"], "password": owner["password"]})["accessToken"]
    projects = api.call("GET", "/api/v1/projects")
    project = next((p for p in projects if p["name"] == owner["project"]
                    and p["myRole"] == "OWNER"), None)
    require(project is not None, "隔离 owner 的首项目不存在")
    project_id = uuid.UUID(project["id"])
    allowed = (ROOT / ".env.delivery.local").read_text().splitlines()
    scope = next(line.split("=", 1)[1] for line in allowed
                 if line.startswith("LAN_PROJECT_IDS="))
    require(str(project_id) in scope.split(","), "项目不在私网传递白名单")
    api.token = api.call("POST", "/api/v1/auth/switch-project", {
        "projectId": str(project_id)})["accessToken"]
    suffix = secrets.token_hex(5)
    dtype = api.call("POST", f"/api/v1/projects/{project_id}/device-types", {
        "typeKey": f"lan_cmd_{suffix}", "name": "LAN harmless command",
        "deviceKind": "DIRECT", "payloadProtocol": "STANDARD", "networkType": "WIFI"}, 201)
    type_id = dtype["id"]
    api.call("POST", f"/api/v1/projects/{project_id}/device-types/{type_id}/commands", {
        "commandKey": "lan_ping", "name": "LAN harmless ping", "description": "Local test only",
        "inputSchema": '{"type":"object"}', "outputSchema": '{"type":"object"}',
        "timeoutSeconds": 8, "sortOrder": 0}, 201)
    api.call("POST", f"/api/v1/projects/{project_id}/device-types/{type_id}/publish")
    devices = []
    for role in ("target", "other"):
        key = f"lan-cmd-{role}-{suffix}"
        created = api.call("POST", f"/api/v1/projects/{project_id}/devices", {
            "deviceTypeId": type_id, "deviceKey": key, "name": f"LAN {role}"}, 201)
        device_id = created["id"]
        credential = api.call("POST", f"/api/v1/projects/{project_id}/devices/{device_id}/credentials",
                              expected=201)
        route = f"/api/v1/projects/{project_id}/devices/{device_id}/access-config"
        config = api.call("GET", route)
        if config["protocol"] != "MQTT" or not config["enabled"]:
            api.call("PUT", route, {"protocol": "MQTT", "enabled": True,
                                    "expectedConfigVersion": config["configVersion"]})
        devices.append({"id": device_id, "key": key,
                        "secret": credential["plainSecret"]})
    return str(project_id), project["projectKey"], devices


def source(command_id: str):
    payload = service("SELECT payload::text FROM sys_outbox_event "
                      "WHERE event_type='PUBLIC_WEBHOOK_SOURCE' "
                      "AND payload::jsonb->'event'->>'eventType'='command.completed' "
                      f"AND payload::jsonb->'event'->>'resourceId'='{uuid.UUID(command_id)}' LIMIT 1")
    return json.loads(payload) if payload else None


def inbox(event_id: str) -> list[dict]:
    rows = cloud("SELECT event_body::text FROM cloud_service_event_inbox "
                 f"WHERE event_id='{uuid.UUID(event_id)}'")
    return [json.loads(row) for row in rows.splitlines()] if rows else []


def command(api: Api, project_id: str, device: dict, target, other, reject_other: bool):
    path = f"/api/v1/projects/{project_id}/devices/{device['id']}/commands"
    marker = secrets.token_hex(6)
    accepted = api.call("POST", path, {"commandKey": "lan_ping", "input": {"marker": marker}},
                        202, {"Idempotency-Key": "lan-cmd-" + marker})
    command_id = accepted["id"]
    require(accepted["status"] == "ACCEPTED", "命令未持久受理")
    observed_id, down = target.receive(time.monotonic() + 30)
    require(observed_id == command_id and down["commandKey"] == "lan_ping"
            and down["input"] == {"marker": marker}, "设备下行内容不符")
    if reject_other:
        other.reply(command_id)
        time.sleep(1)
        current = api.call("GET", path + "/" + command_id)
        require(current["status"] not in ("SUCCEEDED", "FAILED"), "非目标设备改变命令终态")
    target.reply(command_id, "ACK")
    wait(lambda: (value if (value := api.call("GET", path + "/" + command_id))
                  ["status"] == "ACKNOWLEDGED" else None),
         "设备 ACK 未进入非终态事实", 15)
    target.reply(command_id)
    terminal = wait(lambda: (value if (value := api.call("GET", path + "/" + command_id))
                             ["status"] in ("SUCCEEDED", "FAILED", "TIMED_OUT") else None),
                    "命令未到终态", 45)
    require(terminal["status"] == "SUCCEEDED" and 1 <= terminal["attemptCount"] <= 3,
            "目标设备回复未形成成功终态")
    event = wait(lambda: source(command_id), "终态无持久公开来源", 45)
    require(event["event"]["eventType"] == "command.completed"
            and event["event"]["resourceId"] == command_id,
            "终态来源身份不符")
    return command_id, event


def exercise(args) -> None:
    candidate(args.candidate_jar, args.candidate_sha256,
              args.cloud_candidate_jar, args.cloud_candidate_sha256)
    api = Api()
    project_id, project_key, devices = fixture(api)
    target = MQTT["MqttDevice"](project_key, devices[0], port=21884)
    other = MQTT["MqttDevice"](project_key, devices[1], port=21884)
    stopped = False
    try:
        first_id, first = command(api, project_id, devices[0], target, other, True)
        first_event = first["event"]["eventId"]
        first_body = wait(lambda: inbox(first_event), "首条命令未进入 cloud Inbox", 120)[0]
        require(first_body["eventType"] == "command.completed"
                and first_body["resourceId"] == first_id
                and first_body["payload"]["status"] == "SUCCEEDED",
                "首条 cloud Inbox 终态身份或状态不符")
        nonce_before = int(cloud("SELECT count(*) FROM cloud_service_event_nonce"))
        produced = run("docker", "exec", "-i", BROKER, "rpk", "topic", "produce",
                       "tc.integration.webhook.source", "-k", first["event"]["deviceId"],
                       "-o", "%p %o\n",
                       payload=(json.dumps(first, separators=(",", ":")) + "\n").encode())
        offset = re.search(r"\b(\d+)\s+(\d+)\b", produced)
        require(offset is not None, "重投 Broker 位点缺失")
        partition, position = map(int, offset.groups())
        def consumed():
            lines = run("docker", "exec", BROKER, "rpk", "group", "describe",
                        "jagonzn-private-cloud-source").splitlines()
            rows = [line.split() for line in lines if line.startswith("tc.integration.webhook.source ")]
            return any(int(row[1]) == partition and int(row[2]) > position
                       for row in rows if len(row) > 2 and row[1].isdigit() and row[2].isdigit())
        wait(consumed, "重投未被私网发送器消费", 90)
        wait(lambda: int(cloud("SELECT count(*) FROM cloud_service_event_nonce")) > nonce_before,
             "同事件 ID 重投未被接收端观察", 90)
        require(len(inbox(first_event)) == 1, "重投生成重复 Inbox")

        run("docker", "stop", CLOUD_PROXY)
        stopped = True
        second_id, second = command(api, project_id, devices[0], target, other, False)
        second_event = second["event"]["eventId"]
        require(not inbox(second_event), "cloud 停机时出现 Inbox 事实")
        run("docker", "start", CLOUD_PROXY)
        stopped = False
        second_body = wait(lambda: inbox(second_event), "私网接收端恢复后命令事件未补送", 120)[0]
        require(second_body["eventType"] == "command.completed"
                and second_body["resourceId"] == second_id
                and second_body["payload"]["status"] == "SUCCEEDED",
                "恢复后的 cloud Inbox 终态身份或状态不符")
        require(len(inbox(second_event)) == 1, "恢复后 Inbox 重复")
        candidate(args.candidate_jar, args.candidate_sha256,
                  args.cloud_candidate_jar, args.cloud_candidate_sha256)
        print(json.dumps({"result": "PASS", "candidateSha256": args.candidate_sha256,
                          "projectId": project_id, "commandIds": [first_id, second_id],
                          "eventIds": [first_event, second_event],
                          "otherDeviceRejected": True, "sameEventRedeliveryDeduplicated": True,
                          "privateOutageRecovered": True,
                          "sourceKind": "simulated-mqtt-device-reply"},
                         sort_keys=True))
    finally:
        if stopped:
            run("docker", "start", CLOUD_PROXY)
        other.close()
        target.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate-jar", required=True, type=Path)
    parser.add_argument("--candidate-sha256", required=True)
    parser.add_argument("--cloud-candidate-jar", required=True, type=Path)
    parser.add_argument("--cloud-candidate-sha256", required=True)
    parser.add_argument("--temporary-low-disk-threshold", action="store_true",
                        help="仅隔离本机 Broker；检查空间并在结束后恢复 5 GiB 保护")
    args = parser.parse_args()
    if not args.temporary_low_disk_threshold:
        exercise(args)
        return
    original = run("docker", "exec", BROKER, "rpk", "cluster", "config", "get",
                   "storage_min_free_bytes")
    require(original == "5368709120", "Broker 写入保护阈值不是预期的 5 GiB")
    disk = run("docker", "exec", BROKER, "df", "-B1", "/var/lib/redpanda/data")
    free = int(disk.splitlines()[-1].split()[3])
    require(free > 200_000_000, "隔离 Broker 可用空间不足 200 MiB")
    run("docker", "exec", BROKER, "rpk", "cluster", "config", "set",
        "storage_min_free_bytes", "134217728")
    try:
        time.sleep(12)  # 单节点磁盘告警异步重算后再发第一条命令。
        exercise(args)
    finally:
        run("docker", "exec", BROKER, "rpk", "cluster", "config", "set",
            "storage_min_free_bytes", original)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, KeyError, ValueError, OSError, MQTT["ProbeError"]) as error:
        reason = str(error) if isinstance(error, (RuntimeError, MQTT["ProbeError"])) else type(error).__name__
        print("LAN command FAIL: " + reason, file=sys.stderr)
        sys.exit(1)

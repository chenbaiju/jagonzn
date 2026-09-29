#!/usr/bin/env python3
"""经本机受信 HTTPS 核对 cloud 签收、拒绝与独立库持久事实。"""

from pathlib import Path
import base64
import hashlib
import hmac
import json
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parent
ENDPOINT = "https://localhost:8443/api/v1/internal/service-events"


def values():
    result = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        key, value = line.split("=", 1)
        result[key] = value
    return result


def signed_request(secret, source, delivery, nonce, body, *, changed_signature=False):
    timestamp = str(int(time.time()))
    message = f"{timestamp}\n{nonce}\n{delivery}\n".encode() + body
    signature = hmac.new(secret, message, hashlib.sha256).hexdigest()
    if changed_signature:
        signature = "0" * 64
    return body, {
        "Content-Type": "application/json",
        "X-ThingsCloud-Delivery-Id": str(delivery),
        "X-ThingsCloud-Timestamp": timestamp,
        "X-ThingsCloud-Nonce": str(nonce),
        "X-ThingsCloud-Key-Id": "lan-lab-v1",
        "X-ThingsCloud-Source-Deployment-Id": source,
        "X-ThingsCloud-Signature": "v1=" + signature,
    }


def status(request):
    body, headers = request
    command = [
        "docker", "run", "--rm", "-i", "--network", "jagonzn-cloud-lan-lab_cloud-lan",
        "-v", f"{ROOT / 'certs.local/lan.crt'}:/ca/lan.crt:ro",
        "eclipse-temurin:21-jre", "curl", "--silent", "--show-error",
        "--connect-timeout", "5", "--max-time", "10",
        "--cacert", "/ca/lan.crt", "--connect-to", "localhost:8443:https:8443",
        "--output", "/dev/null", "--write-out", "%{http_code}",
        "--request", "POST", "--data-binary", "@-",
    ]
    for name, value in headers.items():
        command += ["--header", f"{name}: {value}"]
    command.append(ENDPOINT)
    outcome = subprocess.run(command, input=body, capture_output=True, timeout=20)
    if outcome.returncode != 0:
        raise RuntimeError("隔离网络 HTTPS 客户端失败：" + outcome.stderr.decode()[:250])
    return int(outcome.stdout.decode())


def compose(*arguments):
    return subprocess.check_output([
        "docker", "compose", "--env-file", str(ROOT / ".env.local"),
        "-f", str(ROOT / "compose.yml"), *arguments,
    ], text=True).strip()


def assert_network():
    for service in ("postgres", "cloud", "https"):
        container_id = compose("ps", "-q", service)
        if not container_id:
            raise AssertionError(f"{service} 容器缺席")
        details = json.loads(subprocess.check_output(
            ["docker", "inspect", container_id], text=True))[0]
        networks = details["NetworkSettings"]["Networks"]
        if len(networks) != 1:
            raise AssertionError(f"{service} 接入了非实验网络")
        name = next(iter(networks))
        properties = json.loads(subprocess.check_output(
            ["docker", "network", "inspect", name], text=True))[0]
        if properties["Internal"] is not True:
            raise AssertionError(f"{service} 网络允许默认互联网出站")
        bindings = details["HostConfig"]["PortBindings"] or {}
        if bindings:
            raise AssertionError(f"{service} 私有端口被发布到宿主机")

    attempt = subprocess.run([
        "docker", "run", "--rm", "--network", "jagonzn-cloud-lan-lab_cloud-lan",
        "eclipse-temurin:21-jre", "curl", "--silent", "--output", "/dev/null",
        "--noproxy", "*", "--connect-timeout", "2", "--max-time", "3",
        "http://1.1.1.1/",
    ], capture_output=True, timeout=10)
    if attempt.returncode == 0:
        raise AssertionError("隔离网络仍可访问公网 IP")
    cleartext = subprocess.run([
        "docker", "run", "--rm", "--network", "jagonzn-cloud-lan-lab_cloud-lan",
        "eclipse-temurin:21-jre", "curl", "--silent", "--output", "/dev/null",
        "--connect-timeout", "2", "--max-time", "3",
        "http://https:80/actuator/health",
    ], capture_output=True, timeout=10)
    if cleartext.returncode == 0:
        raise AssertionError("管理健康入口可通过明文 HTTP 访问")


def wait_ready():
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        probe = subprocess.run([
            "docker", "run", "--rm", "--network", "jagonzn-cloud-lan-lab_cloud-lan",
            "-v", f"{ROOT / 'certs.local/lan.crt'}:/ca/lan.crt:ro",
            "eclipse-temurin:21-jre", "curl", "--silent", "--show-error",
            "--connect-timeout", "2", "--max-time", "3",
            "--cacert", "/ca/lan.crt", "--connect-to", "localhost:8443:https:8443",
            "--output", "/dev/null", "--write-out", "%{http_code}",
            "https://localhost:8443/actuator/health",
        ], capture_output=True, timeout=8)
        if probe.returncode == 0 and probe.stdout == b"200":
            return
        time.sleep(1)
    raise AssertionError("cloud HTTPS 健康入口未在 45 秒内就绪")


def main():
    config = values()
    assert_network()
    wait_ready()
    secret = base64.b64decode(config["JAGONZN_CLOUD_SERVICE_SECRET_BASE64"], validate=True)
    event_id = uuid.uuid4()
    delivery_id = uuid.uuid4()
    body = json.dumps({"deliveryId": str(delivery_id), "event": {
        "eventId": str(event_id), "schemaVersion": 1,
        "tenantId": config["JAGONZN_CLOUD_SERVICE_TENANT_ID"],
        "projectId": config["JAGONZN_CLOUD_SERVICE_PROJECT_ID"],
        "eventType": "device.property.report", "payload": {"sample": "lan-lab"},
    }}, separators=(",", ":")).encode()
    first_nonce = uuid.uuid4()
    source = config["JAGONZN_CLOUD_SERVICE_SOURCE_DEPLOYMENT_ID"]
    accepted = status(signed_request(secret, source, delivery_id, first_nonce, body))
    duplicate = status(signed_request(secret, source, delivery_id, uuid.uuid4(), body))
    replay = status(signed_request(secret, source, delivery_id, first_nonce, body))
    tampered = status(signed_request(secret, source, delivery_id, uuid.uuid4(), body,
                                     changed_signature=True))
    rows = compose("exec", "-T", "postgres", "psql", "-U", "jagonzn_cloud",
                   "-d", "jagonzn_cloud", "-Atqc",
                   f"SELECT count(*) FROM cloud_service_event_inbox WHERE event_id='{event_id}'")
    evidence = {"accepted": accepted, "duplicate": duplicate, "replay": replay,
                "tampered": tampered, "persistentRows": int(rows)}
    print(json.dumps(evidence, ensure_ascii=False, sort_keys=True))
    if evidence != {"accepted": 200, "duplicate": 200, "replay": 409,
                    "tampered": 401, "persistentRows": 1}:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

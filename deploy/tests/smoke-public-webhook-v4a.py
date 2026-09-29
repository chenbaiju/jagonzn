#!/usr/bin/env python3
"""Exercise a fixed jagonzn candidate against a controlled public HTTPS receiver.

The target must be an HTTPS URL whose public TLS certificate is trusted by the
running application. The receiver may sit behind a test-only tunnel; the
application's outbound DNS, public-address and TLS checks are never relaxed.
Use only disposable projects and synthetic device data.
"""

import argparse
import base64
import importlib.util
import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


HERE = Path(__file__).resolve().parent


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, HERE / path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


b2 = module("reuse_v5b2", "smoke-noncommercial-daily-v5b2.py")


def require(condition, description):
    if not condition:
        raise b2.ProbeError(description)


def private_file(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "wb") as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())


def public_ready(url):
    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.status == 405
    except urllib.error.HTTPError as error:
        return error.code == 405
    except (urllib.error.URLError, TimeoutError):
        return False


def receipt(run_dir):
    journal = run_dir / "decisions.jsonl"
    if not journal.exists():
        return []
    return [json.loads(line) for line in journal.read_text("utf-8").splitlines()]


def delivery_row(pg, pid, delivery_id):
    sql = (f"SET app.project_id='{b2.checked_uuid(pid)}'; "
           "SELECT status,attempt_count,coalesce(reason,'') "
           "FROM integ_webhook_delivery "
           f"WHERE project_id='{pid}' AND id='{b2.checked_uuid(delivery_id)}'")
    return b2.db(pg, sql).split("|")


def delivery_count(pg, pid, subscription):
    sql = (f"SET app.project_id='{b2.checked_uuid(pid)}'; "
           "SELECT count(*) FROM integ_webhook_delivery "
           f"WHERE project_id='{pid}' AND subscription_id='{b2.checked_uuid(subscription)}'")
    return int(b2.db(pg, sql))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy-dir", type=Path, required=True)
    parser.add_argument("--candidate-jar", type=Path, required=True)
    parser.add_argument("--candidate-sha256", required=True)
    parser.add_argument("--public-url", required=True)
    parser.add_argument("--run-root", type=Path, required=True)
    parser.add_argument("--cert-file", type=Path, required=True)
    parser.add_argument("--key-file", type=Path, required=True)
    parser.add_argument("--origin-port", type=int, default=18766)
    args = parser.parse_args()
    require(args.public_url.startswith("https://") and args.public_url.endswith("/events")
            and "?" not in args.public_url and "#" not in args.public_url,
            "须提供固定的公网 HTTPS /events 地址")
    require(args.run_root.is_dir() and args.run_root.stat().st_mode & 0o777 == 0o700,
            "私有运行目录必须为 0700")
    pg, _ = b2.preflight(args.deploy_dir.resolve(), args.candidate_jar.resolve(),
                         args.candidate_sha256)
    require(b2.command("docker", "exec", "jagonzn-service-redpanda-1", "rpk", "cluster",
                       "config", "get", "storage_min_free_bytes") == "5368709120",
            "主栈 Broker 基线阈值不符")
    api = b2.Api()
    suffix = secrets.token_hex(5)
    email, pid, pkey, _ = b2.setup(api, pg, suffix)
    did, device_key, device_secret = b2.device_fixture(api, pid, suffix)
    operation = str(uuid.uuid4())
    issued = api.call("POST", f"/api/v1/projects/{pid}/webhooks", {
        "operationId": operation, "name": f"v4a-{suffix}",
        "targetUrl": args.public_url,
        "eventTypes": ["device.property.report"], "deviceIds": [did]}, 201,
        {"Idempotency-Key": operation})
    subscription = b2.checked_uuid(issued["subscription"]["id"])
    key_id = issued["subscription"]["signingKeyId"]
    require(isinstance(key_id, str) and key_id, "未取得签名密钥 ID")
    secret = issued.get("signingSecret")
    require(isinstance(secret, str) and len(base64.b64decode(secret, validate=True)) == 32,
            "仅首次创建应签发 32 字节接收秘密")
    secret_file = args.run_root / "subscription-secret.b64"
    private_file(secret_file, secret.encode())
    receiver_dir = args.run_root / "receiver"
    receiver_log = args.run_root / "receiver.log"
    receiver = None
    threshold_changed = False
    try:
        with receiver_log.open("xb") as output:
            os.chmod(receiver_log, 0o600)
            receiver = subprocess.Popen([sys.executable, str(HERE / "smoke-public-webhook-v4a-receiver.py"),
                "serve", "--bind", "127.0.0.1", "--port", str(args.origin_port),
                "--path", "/events", "--run-dir", str(receiver_dir),
                "--secret-file", str(secret_file), "--key-id", key_id,
                "--cert-file", str(args.cert_file), "--key-file", str(args.key_file),
                "--first-response", "503"], stdout=output, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline and not public_ready(args.public_url):
            require(receiver.poll() is None, "接收端启动失败")
            time.sleep(1)
        require(public_ready(args.public_url), "公网 HTTPS 未到达接收端")
        b2.command("docker", "exec", "jagonzn-service-redpanda-1", "rpk", "cluster",
                   "config", "set", "storage_min_free_bytes", "2147483648")
        threshold_changed = True
        time.sleep(2)
        message_id = b2.uuid7()
        body = b2.report(pkey, device_key, device_secret, message_id)
        deadline = time.monotonic() + 180
        current = None
        while time.monotonic() < deadline:
            current = b2.delivery(pg, pid, message_id, subscription)
            if current:
                row = delivery_row(pg, pid, current[0])
                decisions = receipt(receiver_dir)
                if row[0] == "SUCCEEDED" and len(decisions) >= 2:
                    break
                require(row[0] != "DEAD", "Webhook 在重试预算内失败终止")
            time.sleep(2)
        require(current is not None, "设备事件未形成 Webhook 投递")
        row = delivery_row(pg, pid, current[0])
        decisions = receipt(receiver_dir)
        require(row[0] == "SUCCEEDED" and current[2] == 2,
                "Webhook 未在首次 503 后恰好一次重试成功")
        require(len(decisions) == 2 and [item["disposition"] for item in decisions] ==
                ["FIRST", "DUPLICATE"] and [item["httpStatus"] for item in decisions] == [503, 200],
                "接收端未按一次副作用与同交付 ID 去重")
        require(all(item["deliveryId"] == current[0] for item in decisions)
                and decisions[0]["bodySha256"] == decisions[1]["bodySha256"],
                "交付 ID 或重试正文不一致")
        b2.report(pkey, device_key, device_secret, message_id, body)
        time.sleep(3)
        require(delivery_count(pg, pid, subscription) == 1 and len(receipt(receiver_dir)) == 2,
                "同设备消息重放形成额外交付")
        revision = issued["subscription"]["revision"]
        revoke_op = str(uuid.uuid4())
        revoked = api.call("POST", f"/api/v1/projects/{pid}/webhooks/{subscription}/revoke", {
            "operationId": revoke_op, "expectedRevision": revision}, 200,
            {"Idempotency-Key": revoke_op})
        require(revoked["subscription"]["status"] == "REVOKED", "Webhook 撤销未生效")
        b2.report(pkey, device_key, device_secret, b2.uuid7())
        time.sleep(8)
        require(delivery_count(pg, pid, subscription) == 1 and len(receipt(receiver_dir)) == 2,
                "撤销后仍新增 Webhook 交付")
        b2.preflight(args.deploy_dir.resolve(), args.candidate_jar.resolve(), args.candidate_sha256)
        print(json.dumps({"result": "PASS", "candidateSha256": args.candidate_sha256,
            "project": pid, "subscription": subscription, "delivery": current[0],
            "attempts": current[2], "receiverDecisions": [item["disposition"] for item in decisions],
            "receiverBodySha256": decisions[0]["bodySha256"], "revoked": True,
            "publicHost": urllib.parse.urlparse(args.public_url).hostname}, sort_keys=True))
    finally:
        if threshold_changed:
            b2.command("docker", "exec", "jagonzn-service-redpanda-1", "rpk", "cluster",
                       "config", "set", "storage_min_free_bytes", "5368709120")
        if receiver is not None:
            receiver.terminate()
            try:
                receiver.wait(timeout=5)
            except subprocess.TimeoutExpired:
                receiver.kill()
                receiver.wait(timeout=5)


if __name__ == "__main__":
    try:
        main()
    except (b2.ProbeError, KeyError, ValueError, IndexError, OSError) as error:
        print(f"V4A FAIL: {error}", file=sys.stderr)
        sys.exit(1)

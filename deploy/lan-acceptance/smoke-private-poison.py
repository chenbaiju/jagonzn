#!/usr/bin/env python3
"""Exercise a controlled synthetic poison offset and exact-partition recovery."""

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parent
BROKER = "jagonzn-lan-acceptance-redpanda-1"
SERVICE = "jagonzn-lan-acceptance-service"
GROUP = "jagonzn-private-cloud-source"
TOPIC = "tc.integration.webhook.source"
PARTITION = 5
ARCHIVE = ROOT / "logs" / "poison"


def require(valid, reason):
    if not valid:
        raise RuntimeError(reason)


def run(argv, payload=None):
    result = subprocess.run(argv, input=payload, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError("Private poison container command failed")
    return result.stdout.decode().strip()


def docker(*args, payload=None):
    return run(["docker", *args], payload)


def offset():
    lines = docker("exec", BROKER, "rpk", "group", "describe", GROUP).splitlines()
    row = next((line.split() for line in lines if line.startswith(TOPIC + " ")
                and len(line.split()) > 5 and line.split()[1] == str(PARTITION)), None)
    require(row is not None, "Private group partition was not found")
    return tuple(map(int, (row[2], row[4], row[5])))


def archive(payload, event_id):
    if ARCHIVE.is_symlink():
        raise RuntimeError("Poison archive must not be a symbolic link")
    ARCHIVE.mkdir(mode=0o700, exist_ok=True)
    os.chmod(ARCHIVE, 0o700)
    path = ARCHIVE / f"{event_id}.json"
    with path.open("xb") as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(path, 0o600)
    return path, hashlib.sha256(payload).hexdigest()


def main():
    os.umask(0o077)
    values = dict(line.split("=", 1) for line in (ROOT / ".env.delivery.local")
                  .read_text().splitlines())
    original = docker("exec", BROKER, "rpk", "cluster", "config", "get",
                      "storage_min_free_bytes")
    require(original == "5368709120", "Unexpected broker storage guard")
    free = int(docker("exec", BROKER, "df", "-B1", "/var/lib/redpanda/data")
               .splitlines()[-1].split()[3])
    require(free > 200_000_000, "Docker disk too full for poison recovery test")
    before, end, lag = offset()
    require(before == end and lag == 0, "Private consumer must have no prior lag")
    event_id, device_id = uuid.uuid4(), uuid.uuid4()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload = (json.dumps({"schemaVersion": 1, "event": {
        "eventId": str(event_id), "eventType": "device.property.report",
        "tenantId": values["LAN_BUSINESS_TENANT_ID"],
        "projectId": values["LAN_PROJECT_IDS"].split(",")[0],
        "projectGeneration": 1, "resourceType": "device",
        "resourceId": str(device_id), "deviceId": str(device_id),
        "occurredAt": now, "recordedAt": now, "traceId": "lan-poison",
        "payloadJson": "{}"}, "hash": "0" * 64, "eventText": None},
        sort_keys=True, separators=(",", ":")).encode() + b"\n")
    path, digest = archive(payload, event_id)
    docker("exec", BROKER, "rpk", "cluster", "config", "set",
           "storage_min_free_bytes", "134217728")
    stopped = False
    try:
        produced = docker("exec", "-i", BROKER, "rpk", "topic", "produce", TOPIC,
                          "-p", str(PARTITION), "-k", str(device_id),
                          "-o", "%p %o\n", payload=payload)
        match = re.search(r"\b5\s+(\d+)\b", produced)
        require(match is not None and int(match.group(1)) == end,
                "Poison record was not produced at the expected tail offset")
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            current, log_end, lag = offset()
            if current == end and log_end == end + 1 and lag == 1:
                break
            time.sleep(1)
        require((current, log_end, lag) == (end, end + 1, 1),
                "Oversize descriptor did not block exactly its partition offset")
        docker("stop", SERVICE)
        stopped = True
        current, log_end, lag = offset()
        require((current, log_end, lag) == (end, end + 1, 1),
                "Another record arrived; refuse broad offset recovery")
        seek = ARCHIVE / f"{event_id}.seek"
        seek.write_text(f"{TOPIC} {PARTITION} {end + 1}\n")
        os.chmod(seek, 0o600)
        docker("cp", str(seek), BROKER + ":/tmp/lan-private-poison.seek")
        try:
            # docker cp retains host uid 501; Redpanda's rpk runs as a different uid.
            # The file contains only topic/partition/offset, never the source body or key.
            docker("exec", "-u", "0", BROKER, "chmod", "644", "/tmp/lan-private-poison.seek")
            docker("exec", BROKER, "rpk", "group", "seek", GROUP,
                   "--to-file", "/tmp/lan-private-poison.seek", "--topics", TOPIC)
        finally:
            docker("exec", "-u", "0", BROKER, "rm", "/tmp/lan-private-poison.seek")
        require(offset()[0] == end + 1, "Exact partition seek did not advance")
        docker("start", SERVICE)
        stopped = False
        print(json.dumps({"result": "PASS", "eventId": str(event_id),
              "archive": str(path), "sourceSha256": digest,
              "partition": PARTITION, "poisonOffset": end,
              "recoveredOffset": end + 1, "cloudAccepted": False}, sort_keys=True))
    finally:
        if stopped:
            docker("start", SERVICE)
        docker("exec", BROKER, "rpk", "cluster", "config", "set",
               "storage_min_free_bytes", original)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, KeyError, ValueError, OSError) as error:
        print(f"LAN poison recovery FAIL: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)

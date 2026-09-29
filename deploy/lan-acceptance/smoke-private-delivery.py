#!/usr/bin/env python3
"""Verify service outbox -> Kafka -> cloud inbox with isolated synthetic facts."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import ssl
import subprocess
import sys
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent
DEPLOY = ROOT.parent
SERVICE_PG = "jagonzn-lan-acceptance-postgres-1"
CLOUD_PG = "jagonzn-lan-acceptance-cloud-postgres-1"
CLOUD_PROXY = "jagonzn-lan-acceptance-cloud-https-1"
BROKER = "jagonzn-lan-acceptance-redpanda-1"
TOPIC = "tc.integration.webhook.source"
CERT = ROOT / "certs.local" / "lan.crt"


def require(valid, reason):
    if not valid:
        raise RuntimeError(reason)


def command(*argv):
    result = subprocess.run(argv, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError("LAN container command failed")
    return result.stdout.strip()


def compose(configuration, service):
    command("docker", "compose", "--env-file", str(ROOT / ".env.local"),
            "--env-file", str(ROOT / configuration),
            "-f", str(DEPLOY / "compose.yml"), "-f", str(ROOT / "compose.yml"),
            "-f", str(ROOT / "private-delivery.compose.yml"),
            "--profile", "app", "up", "-d", "--no-deps", service)


def db(container, user, database, sql):
    return command("docker", "exec", container, "psql", "-U", user, "-d", database,
                   "-v", "ON_ERROR_STOP=1", "-Atqc", sql)


def service(sql):
    return db(SERVICE_PG, "jagonzn", "jagonzn", sql)


def cloud(sql):
    return db(CLOUD_PG, "jagonzn_cloud", "jagonzn_cloud", sql)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def append_source(tenant, project):
    """Insert one explicit laboratory event into the service-owned durable outbox."""
    event_id, device_id, outbox_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    trace = "lan-private-" + event_id.hex[:16]
    event = {"eventId": str(event_id), "eventType": "device.property.report",
             "schemaVersion": 1,
             "tenantId": str(tenant), "projectId": str(project), "resourceType": "device",
             "resourceId": str(device_id), "deviceId": str(device_id),
             "occurredAt": now, "recordedAt": now, "traceId": trace,
             "payload": {"temperature": 28}}
    event_text = canonical(event)
    digest = hashlib.sha256(("1\n" + event_text).encode()).hexdigest()
    metadata = dict(event)
    metadata.pop("payload")
    metadata.pop("schemaVersion")
    metadata.update({"projectGeneration": 1, "payloadJson": "{}"})
    source = canonical({"schemaVersion": 1, "event": metadata,
                        "hash": digest, "eventText": event_text})
    require("$q$" not in source, "Invalid synthetic event delimiter")
    service("INSERT INTO sys_outbox_event (id,tenant_id,project_id,aggregate_type,"
            "aggregate_id,event_type,destination_topic,partition_key,payload,trace_id) "
            f"VALUES ('{outbox_id}','{tenant}','{project}','PUBLIC_WEBHOOK_SOURCE',"
            f"'{device_id}','PUBLIC_WEBHOOK_SOURCE','{TOPIC}','{device_id}',"
            f"$q${source}$q$,'{trace}')")
    return event_id


def published(event_id):
    return service("SELECT published_at IS NOT NULL FROM sys_outbox_event "
                   "WHERE event_type='PUBLIC_WEBHOOK_SOURCE' "
                   f"AND payload::jsonb->'event'->>'eventId'='{event_id}'") == "t"


def inbox(event_id):
    return cloud("SELECT project_id::text FROM cloud_service_event_inbox "
                 f"WHERE event_id='{event_id}'")


def wait_fact(event_id, project):
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        if published(event_id) and inbox(event_id) == str(project):
            return
        time.sleep(2)
    raise RuntimeError("Durable service outbox did not reach the independent cloud inbox")


def wait_health(port):
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"https://127.0.0.1:{port}/actuator/health",
                    context=ssl.create_default_context(cafile=str(CERT)), timeout=5) as response:
                if response.status == 200 and json.loads(response.read(1024))["status"] == "UP":
                    return
        except (OSError, KeyError, ValueError):
            pass
        time.sleep(1)
    raise RuntimeError("LAN HTTPS health did not recover")


def exercise():
    values = dict(line.split("=", 1) for line in (ROOT / ".env.delivery.local")
                  .read_text().splitlines())
    tenant = uuid.UUID(values["LAN_BUSINESS_TENANT_ID"])
    projects = tuple(uuid.UUID(item) for item in values["LAN_PROJECT_IDS"].split(","))
    require(len(projects) == 2 and projects[0] != projects[1], "Two projects required")
    for project in projects:
        require(service(f"SELECT tenant_id::text FROM sys_project WHERE id='{project}'")
                == str(tenant), "Project does not belong to the isolated tenant")
    wait_health(18444)
    wait_health(18445)
    first = append_source(tenant, projects[0])
    wait_fact(first, projects[0])
    command("docker", "stop", CLOUD_PROXY)
    try:
        second = append_source(tenant, projects[1])
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline and not published(second):
            time.sleep(1)
        require(published(second) and not inbox(second), "Outage source not retained")
    finally:
        command("docker", "start", CLOUD_PROXY)
    wait_health(18445)
    wait_fact(second, projects[1])

    # Receiver rejects v1 while sender still uses it; offset must remain pending.
    compose(".env.delivery-final.local", "cloud")
    wait_health(18445)
    rejected = append_source(tenant, projects[0])
    time.sleep(8)
    require(published(rejected) and not inbox(rejected), "401 did not preserve source")
    compose(".env.delivery-rotated.local", "cloud")
    wait_health(18445)
    wait_fact(rejected, projects[0])

    # Accept v1+v2 on receiver, then switch sender; remove v1 only after recovery.
    compose(".env.delivery-rotated.local", "app")
    wait_health(18444)
    rotated = append_source(tenant, projects[1])
    wait_fact(rotated, projects[1])
    compose(".env.delivery-final.local", "cloud")
    wait_health(18445)
    final = append_source(tenant, projects[0])
    wait_fact(final, projects[0])
    print(canonical({"result": "PASS", "businessTenantId": str(tenant),
          "projectIds": list(map(str, projects)),
          "events": list(map(str, (first, second, rejected, rotated, final))),
          "outageRecovered": True, "rejectionRecovered": True,
          "rotationCompleted": True, "sourceKind": "synthetic-service-outbox"}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--temporary-low-disk-threshold", action="store_true",
                        help="仅隔离本机 Broker；检查剩余空间并在退出时恢复 5 GiB 门槛")
    args = parser.parse_args()
    if not args.temporary_low_disk_threshold:
        exercise()
        return
    original = command("docker", "exec", BROKER, "rpk", "cluster", "config", "get",
                       "storage_min_free_bytes")
    require(original == "5368709120", "Unexpected Broker storage guard")
    disk = command("docker", "exec", BROKER, "df", "-B1", "/var/lib/redpanda/data")
    free = int(disk.splitlines()[-1].split()[3])
    require(free > 200_000_000, "Docker disk is too full for temporary test guard")
    command("docker", "exec", BROKER, "rpk", "cluster", "config", "set",
            "storage_min_free_bytes", "134217728")
    try:
        exercise()
    finally:
        command("docker", "exec", BROKER, "rpk", "cluster", "config", "set",
                "storage_min_free_bytes", original)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, KeyError, ValueError, OSError) as error:
        print(f"LAN private delivery FAIL: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)

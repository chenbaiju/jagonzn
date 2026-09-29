"""V5f fixed-candidate, multi-device short-window rule accounting probe.

Run only against a disposable, source-external NONCOMMERCIAL stack. Every
device has its own Kafka deviceId key and sends one HTTP property report in a
bounded thread burst. The probe verifies accepted receipts, per-message
inbox/raw-log/point/rule facts, UTC source-to-counter equality, replay
idempotency and absence of this probe's messages from the rule DLQ. It records
the effective tenant rule concurrency and queue policy. A successful run is
not evidence that the queue was saturated or that its retry path recovered.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import re
import secrets
import sys
import threading
import time


HERE = Path(__file__).resolve().parent


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


base = module("v5f_concurrent_base", "smoke-noncommercial-daily-v5b2.py")
telemetry = module("v5f_concurrent_telemetry", "smoke-noncommercial-daily-v5b1.py")
scripts = module("v5f_concurrent_scripts", "smoke-noncommercial-daily-v5c.py")
SCRIPT_METRICS = scripts.METRICS
UPLINK_METRICS = ("UPLINK_MESSAGE", "UPLINK_BYTES", "TIME_SERIES_POINT")


def require(value, message):
    base.require(value, message)


def same_day(day):
    require(datetime.now(timezone.utc).date().isoformat() == day,
            "探针跨过真实 UTC 午夜，本轮不得合并为单日回执")


def preflight(deploy, jar, digest, admin_port, device_port, count):
    require(1 <= admin_port <= 65535 and 1 <= device_port <= 65535,
            "回环端口超出范围")
    pg, _ = base.preflight(deploy, jar, digest)
    app = base.compose(deploy, "--profile", "app", "ps", "-q", "app")
    inspected = json.loads(base.command("docker", "inspect", app))
    names = (set(scripts.ENV.values()) | set(telemetry.ENV.values())
             | {"THINGS_CLOUD_AUTOMATION_PROPERTY_ENABLED"})
    values = {}
    for row in inspected[0]["Config"]["Env"]:
        name, sep, value = row.partition("=")
        if sep and name in names:
            require(name not in values, "运行配置键重复")
            values[name] = value
    limits = {}
    for metric, name in {**scripts.ENV, **telemetry.ENV}.items():
        raw = values.get(name, "")
        require(re.fullmatch(r"[1-9][0-9]*", raw), "非商业日容量缺失或无效")
        limits[metric] = int(raw)
    require(limits["SCRIPT_EXECUTION"] >= count * 10
            and limits["SCRIPT_CPU_MILLIS"] >= 100000
            and limits["AUTOMATION_EXECUTION"] >= count * 10
            and limits["UPLINK_MESSAGE"] >= count * 10
            and limits["UPLINK_BYTES"] >= count * 1000
            and limits["TIME_SERIES_POINT"] >= count * 10,
            "本探针需要高容量三项规则和三项上行基线")
    owner = base.db(pg, "SELECT entitlement_mode || '|' || automation_execution_daily_limit "
                    "FROM sys_deployment_automation_entitlement WHERE singleton")
    require(owner == f"NONCOMMERCIAL|{limits['AUTOMATION_EXECUTION']}",
            "owner 自动化额度与运行配置不符")
    base.ADMIN = f"http://127.0.0.1:{admin_port}"
    base.DEVICE = f"https://127.0.0.1:{device_port}/device-access/v1/property/report"
    return pg, limits, values.get("THINGS_CLOUD_AUTOMATION_PROPERTY_ENABLED", "").lower() == "true"


def policy(pg, tenant):
    tid = base.checked_uuid(tenant)
    raw = base.db(pg, "SELECT q.code || '|' || q.version || '|' || "
                  "q.rule_tenant_concurrency_limit || '|' || "
                  "q.rule_tenant_queue_capacity || '|' || q.rule_project_queue_capacity "
                  "FROM sys_tenant t JOIN sys_quota_policy q ON q.id=t.quota_policy_id "
                  f"WHERE t.id='{tid}'")
    fields = raw.split("|")
    require(len(fields) == 5 and all(re.fullmatch(r"[0-9]+", part) for part in fields[1:]),
            "租户有效规则保护策略不可读")
    return {"code": fields[0], "version": int(fields[1]),
            "tenantConcurrency": int(fields[2]),
            "tenantQueueCapacity": int(fields[3]),
            "projectQueueCapacity": int(fields[4])}


def fixture(api, pg, suffix, count):
    _, pid, pkey, tenant = base.setup(api, pg, suffix)
    type_path = f"/api/v1/projects/{pid}/device-types"
    dtype = api.call("POST", type_path, {
        "typeKey": f"v5fcon_{suffix}", "name": "V5f concurrent rule",
        "deviceKind": "DIRECT", "payloadProtocol": "STANDARD", "networkType": "WIFI"}, 201)
    tid = base.checked_uuid(dtype["id"])
    api.call("POST", f"{type_path}/{tid}/properties", {
        "propertyKey": "temperature", "name": "Temperature", "accessType": "REPORT",
        "dataType": "NUMBER", "unit": "C", "decimalPlaces": 1,
        "minimumValue": 0, "maximumValue": 100, "sortOrder": 0}, 201)
    api.call("POST", f"{type_path}/{tid}/publish")
    devices = []
    for index in range(count):
        key = f"v5f-con-{suffix}-{index}"
        device = api.call("POST", f"/api/v1/projects/{pid}/devices", {
            "deviceTypeId": tid, "deviceKey": key, "name": f"V5f concurrent {index}"}, 201)
        did = base.checked_uuid(device["id"])
        credential = api.call("POST", f"/api/v1/projects/{pid}/devices/{did}/credentials",
                              expected=201)
        secret = credential.get("plainSecret")
        require(isinstance(secret, str) and secret, "设备秘密签发失败")
        path = f"/api/v1/projects/{pid}/devices/{did}/access-config"
        config = api.call("GET", path)
        if config["protocol"] != "HTTP" or not config["enabled"]:
            api.call("PUT", path, {"protocol": "HTTP", "enabled": True,
                                    "expectedConfigVersion": config["configVersion"]})
        devices.append({"id": did, "key": key, "secret": secret})
    rule_path = f"/api/v1/projects/{pid}/message-rules"
    rule = api.call("POST", rule_path, {"name": f"v5f-con-rule-{suffix}",
        "source": "input => input", "actions": []}, 201)
    rid = base.checked_uuid(rule["id"])
    versions = api.call("GET", f"{rule_path}/{rid}/version-history")
    version = base.checked_uuid(versions["items"][0]["id"])
    api.call("POST", f"{rule_path}/{rid}/versions/{version}/activate?expectedVersion=1")
    return {"tenant": tenant, "project": pid, "projectKey": pkey,
            "rule": rid, "devices": devices}


def message_facts(pg, project, mid):
    pid, mid = base.checked_uuid(project), base.checked_uuid(mid)
    raw = base.db(pg, f"SET app.project_id='{pid}'; SELECT "
                  f"(SELECT count(*) FROM sys_inbox_message WHERE project_id='{pid}' AND message_id='{mid}'),"
                  f"(SELECT count(*) FROM ts_device_message_log WHERE project_id='{pid}' AND message_id='{mid}' AND direction='UP'),"
                  f"(SELECT coalesce(sum(raw_bytes),0) FROM ts_device_message_log WHERE project_id='{pid}' AND message_id='{mid}' AND direction='UP'),"
                  f"(SELECT count(*) FROM ts_property_point WHERE project_id='{pid}' AND message_id='{mid}'),"
                  f"(SELECT count(*) FROM rule_execution_log WHERE project_id='{pid}' AND message_id='{mid}' "
                  "AND status='SUCCESS' AND attempt=1),"
                  f"(SELECT count(*) FROM rule_execution_log WHERE project_id='{pid}' AND message_id='{mid}' "
                  "AND (status<>'SUCCESS' OR attempt<>1))")
    fields = raw.split("|")
    require(len(fields) == 6 and all(re.fullmatch(r"[0-9]+", field) for field in fields),
            "每消息源事实格式无效")
    return tuple(map(int, fields))


def wait_messages(pg, project, sent, timeout=150):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        facts = {mid: message_facts(pg, project, mid) for mid in sent}
        if all(facts[mid] == (1, 1, size, 1, 1, 0) for mid, size in sent.items()):
            return facts
        time.sleep(1)
    raise base.ProbeError("短窗消息未全部形成唯一 inbox、日志、点及成功规则事实")


def uplink_source(pg, project, day):
    facts = telemetry.source_usage(pg, project, day)
    return {metric: facts[metric] for metric in UPLINK_METRICS}


def uplink_counter(pg, tenant, project, day):
    facts = telemetry.counter_usage(pg, tenant, project, day)
    return {metric: facts[metric] for metric in UPLINK_METRICS}


def wait_counts(pg, state, expected_uplink, count, timeout=150):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        same_day(state["utcDay"])
        scripts_source = scripts.sources(pg, state)
        scripts_counter = scripts.counter(pg, state)
        up_source = uplink_source(pg, state["project"], state["utcDay"])
        up_counter = uplink_counter(pg, state["tenant"], state["project"], state["utcDay"])
        if (scripts_source == scripts_counter and up_source == up_counter
                and scripts_source["SCRIPT_EXECUTION"] == count
                and scripts_source["AUTOMATION_EXECUTION"] == 0
                and scripts_source["SCRIPT_CPU_MILLIS"] > 0
                and up_source == expected_uplink):
            return scripts_source, up_source
        time.sleep(2)
    raise base.ProbeError("三项规则/三项上行源事实与 UTC 日计数未在期限内一致")


def new_probe_dlq(deploy, before, mids):
    broker, after = scripts.dlq_offsets(deploy)
    matching = []
    for partition, high in after.items():
        start = before.get(partition, 0)
        require(high >= start, "规则 DLQ 位点倒退")
        if high == start:
            continue
        raw = scripts.run("docker", "exec", broker, "rpk", "topic", "consume",
                          "tc.rule.dlq", "-p", str(partition), "-o", str(start),
                          "-n", str(high - start), "--pretty-print=false")
        for line in raw.splitlines():
            record = json.loads(line)
            message = json.loads(record["value"])
            mid = message["envelope"]["key"]["messageId"]
            if mid in mids:
                matching.append(mid)
    require(not matching, "短窗消息进入规则 DLQ")
    return {"before": before, "after": after, "probeMessages": matching}


def run_probe(args):
    deploy = args.deploy_dir.expanduser().resolve()
    jar = args.candidate_jar.expanduser().resolve()
    pg, limits, property_enabled = preflight(
        deploy, jar, args.candidate_sha256, args.admin_port, args.device_port,
        args.device_count)
    day = datetime.now(timezone.utc).date().isoformat()
    now = datetime.now(timezone.utc)
    require(not (now.hour == 23 and now.minute >= 50),
            "距 UTC 午夜不足十分钟，请在较早时段运行")
    suffix = secrets.token_hex(5)
    api = base.Api()
    state = fixture(api, pg, suffix, args.device_count)
    state["utcDay"] = day
    effective = policy(pg, state["tenant"])
    require(effective["tenantConcurrency"] > 0 and effective["tenantQueueCapacity"] > 0
            and effective["projectQueueCapacity"] > 0,
            "租户规则运行保护策略未启用")
    require(scripts.sources(pg, state) == dict.fromkeys(SCRIPT_METRICS, 0)
            and uplink_source(pg, state["project"], day) == dict.fromkeys(UPLINK_METRICS, 0),
            "一次性项目已有意外规则或上行源事实")
    dlq_before = scripts.dlq_offsets(deploy)[1]
    start = threading.Event()
    prepared = []
    for index, device in enumerate(state["devices"]):
        mid = base.uuid7()
        body = json.dumps({"messageId": mid,
            "occurredAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "payload": {"temperature": 20 + index}}, separators=(",", ":")).encode()
        prepared.append((device, mid, body))

    def transmit(device, mid, body):
        require(start.wait(10), "短窗发送屏障超时")
        began = time.monotonic()
        base.report(state["projectKey"], device["key"], device["secret"], mid, body)
        return mid, time.monotonic() - began

    with ThreadPoolExecutor(max_workers=args.device_count) as pool:
        futures = [pool.submit(transmit, device, mid, body)
                   for device, mid, body in prepared]
        began = time.monotonic()
        start.set()
        timings = [future.result() for future in as_completed(futures)]
        burst = time.monotonic() - began
    same_day(day)
    sent = {mid: len(body) for _, mid, body in prepared}
    wait_messages(pg, state["project"], sent)
    expected_uplink = {"UPLINK_MESSAGE": len(sent), "UPLINK_BYTES": sum(sent.values()),
                       "TIME_SERIES_POINT": len(sent)}
    script_source, up_source = wait_counts(pg, state, expected_uplink, len(sent))
    before_replay = {mid: message_facts(pg, state["project"], mid) for mid in sent}
    for device, mid, body in prepared[:2]:
        base.report(state["projectKey"], device["key"], device["secret"], mid, body)
    time.sleep(2)
    require(before_replay == {mid: message_facts(pg, state["project"], mid) for mid in sent},
            "同消息重放增加了源事实")
    require(wait_counts(pg, state, expected_uplink, len(sent)) == (script_source, up_source),
            "同消息重放增加了 UTC 日计数")
    dlq = new_probe_dlq(deploy, dlq_before, set(sent))
    preflight(deploy, jar, args.candidate_sha256, args.admin_port, args.device_port,
              args.device_count)
    same_day(day)
    print(json.dumps({"result": "PASS", "candidateSha256": args.candidate_sha256,
        "project": state["project"], "utcDay": day,
        "deviceCount": len(state["devices"]), "concurrentRequests": args.device_count,
        "acceptedReceipts": len(timings), "burstWallMillis": round(burst * 1000),
        "maximumRequestMillis": round(max(duration for _, duration in timings) * 1000),
        "distinctDeviceKafkaKeys": len({device["id"] for device in state["devices"]}),
        "effectiveRulePolicy": effective, "propertyAutomationConsumerEnabled": property_enabled,
        "scriptSourceAndDailyCounter": script_source,
        "uplinkSourceAndDailyCounter": up_source,
        "perMessage": [{"messageId": mid, "receiptStatus": 202,
                        "inbox": values[0], "rawLog": values[1],
                        "rawBytes": values[2], "historyPoints": values[3],
                        "successfulRuleAttempts": values[4], "otherRuleAttempts": values[5]}
                       for mid, values in sorted(before_replay.items())],
        "replayCount": 2, "ruleDlq": dlq,
        "unverified": ["rule queue saturation and retry recovery",
                       "actual Kafka partition assignment", "real UTC midnight"]},
        sort_keys=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy-dir", type=Path, required=True)
    parser.add_argument("--candidate-jar", type=Path, required=True)
    parser.add_argument("--candidate-sha256", required=True)
    parser.add_argument("--admin-port", type=int, default=28080)
    parser.add_argument("--device-port", type=int, default=28443)
    parser.add_argument("--device-count", type=int, default=8)
    args = parser.parse_args()
    require(4 <= args.device_count <= 16, "设备数必须为 4～16")
    run_probe(args)


if __name__ == "__main__":
    try:
        main()
    except (base.ProbeError, KeyError, IndexError, TypeError, ValueError) as error:
        label = str(error) if isinstance(error, base.ProbeError) else "响应结构或本地输入无效"
        print(f"V5f 并发探针失败：{label}", file=sys.stderr)
        raise SystemExit(1) from None

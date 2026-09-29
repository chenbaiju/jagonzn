"""V5c fixed-candidate script and automation UTC daily quota probe.

Use only a disposable independent jagonzn stack. Before the first boot,
provision the owner-controlled noncommercial automation hard limit at exactly
three. Run prepare with generous positive script limits and the property
automation consumer explicitly enabled. The probe prints two successive app
overrides for script limits only. Restart the same fixed candidate with each
override, then run verify-cpu and verify-count respectively. The
state file contains temporary credentials and must remain private; output
contains no credential, JWT, message body or database error text.

The script checks real HTTP device ingress, production rule execution logs,
automation reservation facts, asynchronous UTC counters and the quota API.
The two boundary phases distinguish CPU from execution-count gating. It does
not simulate real UTC midnight or transient Worker retry failures.
"""

import argparse
import hashlib
import importlib.util
import json
import os
import re
import secrets
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
BASE_PATH = HERE / "smoke-noncommercial-daily-v5b2.py"
spec = importlib.util.spec_from_file_location("v5c_base", BASE_PATH)
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
METRICS = ("SCRIPT_EXECUTION", "AUTOMATION_EXECUTION", "SCRIPT_CPU_MILLIS")
ENV = {"SCRIPT_EXECUTION": "JAGONZN_TECHNICAL_DAILY_SCRIPT_EXECUTION",
       "AUTOMATION_EXECUTION": "JAGONZN_TECHNICAL_DAILY_AUTOMATION_EXECUTION",
       "SCRIPT_CPU_MILLIS": "JAGONZN_TECHNICAL_DAILY_SCRIPT_CPU_MILLIS"}


def require(value, message):
    base.require(value, message)


def run(*argv):
    try:
        result = subprocess.run(argv, capture_output=True, text=True,
                                check=False, timeout=45)
    except (OSError, subprocess.TimeoutExpired):
        raise base.ProbeError("容器检查命令不可用") from None
    require(result.returncode == 0, "容器检查命令失败")
    return result.stdout.strip()


def file_sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def preflight(deploy, jar, expected, phase, state=None):
    require(deploy != HERE.parent and (deploy / "compose.yml").is_file()
            and (deploy / ".env.local").is_file(), "须使用源码外独立部署目录")
    require(base.SHA.fullmatch(expected) and jar.is_file()
            and file_sha(jar) == expected, "宿主固定候选摘要不符")
    app = base.compose(deploy, "--profile", "app", "ps", "-q", "app")
    pg = base.compose(deploy, "ps", "-q", "postgres")
    require(app and pg, "独立 app 或 PostgreSQL 未运行")
    digest = run("docker", "exec", app, "sha256sum", "/app/jagonzn-service.jar")
    require(digest.split() and digest.split()[0] == expected, "运行候选摘要不符")
    inspected = json.loads(run("docker", "inspect", app))
    require(len(inspected) == 1 and inspected[0]["State"]["Running"], "app 容器未运行")
    names = set(ENV.values()) | {"JAGONZN_ENTITLEMENT_MODE",
                                 "THINGS_CLOUD_AUTOMATION_PROPERTY_ENABLED"}
    values = {}
    for row in inspected[0]["Config"]["Env"]:
        name, sep, value = row.partition("=")
        if sep and name in names:
            require(name not in values, "运行配置键重复")
            values[name] = value
    require(values.get("JAGONZN_ENTITLEMENT_MODE") == "NONCOMMERCIAL",
            "运行模式非 NONCOMMERCIAL")
    require(values.get("THINGS_CLOUD_AUTOMATION_PROPERTY_ENABLED", "").lower() == "true",
            "属性自动化未显式启用")
    limits = {}
    for metric, name in ENV.items():
        raw = values.get(name, "")
        require(re.fullmatch(r"[1-9][0-9]*", raw), "日额度未配置为正整数")
        limits[metric] = int(raw)
    provisioned = base.db(pg, "SELECT entitlement_mode || '|' || automation_execution_daily_limit "
                          "FROM sys_deployment_automation_entitlement WHERE singleton")
    require(provisioned == "NONCOMMERCIAL|3"
            and limits["AUTOMATION_EXECUTION"] == 3,
            "自动化部署额度须由 owner 首次预置为 3")
    if phase == "prepare":
        require(limits["SCRIPT_EXECUTION"] >= 20
                and limits["AUTOMATION_EXECUTION"] == 3
                and limits["SCRIPT_CPU_MILLIS"] >= 100000,
                "准备阶段脚本容量须充足且自动化限额须预置为 3")
    elif phase == "verify-cpu":
        require(limits == state["cpuOverride"], "CPU 边界配置与准备结果不符")
    else:
        require(limits == state["countOverride"], "次数边界配置与准备结果不符")
    return pg, limits


def day_now():
    return datetime.now(timezone.utc).date().isoformat()


def same_day(day):
    require(day_now() == day, "探针跨越真实 UTC 日期，须重新准备夹具")


def save(path, value):
    require(not path.exists(), "私有状态文件已存在")
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, separators=(",", ":"))


def load(path, expected):
    require(path.is_file() and not path.is_symlink()
            and path.stat().st_mode & 0o077 == 0, "状态文件缺失或权限过宽")
    value = json.loads(path.read_text(encoding="utf-8"))
    require(value.get("schema") == 1 and value.get("candidateSha256") == expected,
            "状态文件候选不符")
    same_day(value["utcDay"])
    return value


def login(api, state):
    token = api.call("POST", "/api/v1/auth/login", {
        "email": state["email"], "password": state["password"]})
    require(isinstance(token.get("accessToken"), str), "登录凭据无效")
    api.token = token["accessToken"]
    selected = api.call("POST", "/api/v1/auth/switch-project", {
        "projectId": state["project"]})
    api.token = selected["accessToken"]


def sources(pg, state):
    pid, tenant, day = (base.checked_uuid(state["project"]),
                        base.checked_uuid(state["tenant"]), state["utcDay"])
    require(re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", day), "UTC 日期无效")
    begin = f"'{day} 00:00:00+00'::timestamptz"
    end = f"({begin}+interval '1 day')"
    sql = (f"SET app.project_id='{pid}'; SELECT "
           "(SELECT count(*) FROM rule_execution_log "
           f"WHERE tenant_id='{tenant}' AND project_id='{pid}' "
           f"AND created_at>={begin} AND created_at<{end}),"
           "(SELECT coalesce(sum(duration_millis),0) FROM rule_execution_log "
           f"WHERE tenant_id='{tenant}' AND project_id='{pid}' "
           f"AND created_at>={begin} AND created_at<{end}),"
           "(SELECT count(*) FROM sys_automation_quota_reservation "
           f"WHERE tenant_id='{tenant}' AND project_id='{pid}' AND usage_date='{day}')")
    parts = base.db(pg, sql).split("|")
    require(len(parts) == 3 and all(re.fullmatch(r"[0-9]+", p) for p in parts),
            "权威源事实无效")
    count, cpu, automation = map(int, parts)
    return {"SCRIPT_EXECUTION": count, "SCRIPT_CPU_MILLIS": cpu,
            "AUTOMATION_EXECUTION": automation}


def counter(pg, state):
    tenant, pid = base.checked_uuid(state["tenant"]), base.checked_uuid(state["project"])
    day = state["utcDay"]
    rows = base.db(pg, "SELECT metric || '|' || used_value FROM sys_usage_counter_daily "
                   f"WHERE tenant_id='{tenant}' AND project_id='{pid}' "
                   f"AND usage_date='{day}' AND metric IN "
                   "('SCRIPT_EXECUTION','AUTOMATION_EXECUTION','SCRIPT_CPU_MILLIS')")
    values = dict.fromkeys(METRICS, 0)
    for row in rows.splitlines() if rows else ():
        metric, sep, raw = row.partition("|")
        require(sep and metric in values and re.fullmatch(r"[0-9]+", raw),
                "日归并计数格式无效")
        values[metric] = int(raw)
    return values


def wait_counts(pg, state, expected=None, timeout=150):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        same_day(state["utcDay"])
        actual = sources(pg, state)
        if actual == counter(pg, state) and (expected is None or actual == expected):
            return actual
        time.sleep(2)
    raise base.ProbeError("三项 UTC 源事实、计数或目标值未在期限内一致")


def projection(api, state, limits, values):
    response = api.call("GET", f"/api/v1/projects/{state['project']}/quota")
    require(response.get("policyCode") == "NONCOMMERCIAL_TECHNICAL"
            and response.get("windowStart") == state["utcDay"] + "T00:00:00Z",
            "公开配额策略或 UTC 窗口不符")
    for scope in ("project", "tenantSharedPool"):
        rows = {item["metric"]: item for item in response[scope]["dailyMetrics"]
                if item.get("metric") in METRICS}
        require(set(rows) == set(METRICS), "公开配额缺三项指标")
        for metric in METRICS:
            row = rows[metric]
            require(row["used"] == values[metric] and row["limit"] == limits[metric]
                    and row["remaining"] == max(0, limits[metric] - values[metric]),
                    "公开配额用量、限额或剩余值不符")
    return {m: next(item["status"] for item in response["tenantSharedPool"]["dailyMetrics"]
                    if item["metric"] == m) for m in METRICS}


def execution_rows(pg, state, mid):
    pid, mid = base.checked_uuid(state["project"]), base.checked_uuid(mid)
    return base.db(pg, f"SET app.project_id='{pid}'; SELECT "
                   "(SELECT count(*) FROM rule_execution_log "
                   f"WHERE project_id='{pid}' AND message_id='{mid}'),"
                   "(SELECT count(*) FROM rule_automation_execution "
                   f"WHERE project_id='{pid}' AND source_event_id='{mid}' "
                   "AND status='REJECTED' AND reason_code='QUOTA'),"
                   "(SELECT count(*) FROM rule_automation_execution "
                   f"WHERE project_id='{pid}' AND source_event_id='{mid}' "
                   "AND status IN ('DISPATCHED','SKIPPED','FAILED'))")


def wait_event(pg, state, mid, expected, timeout=90):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        rows = execution_rows(pg, state, mid)
        if rows == expected:
            return
        time.sleep(1)
    raise base.ProbeError("规则与自动化事件终态未在期限内形成")


def dlq_offsets(deploy):
    broker = base.compose(deploy, "ps", "-q", "redpanda")
    require(broker, "独立 Redpanda 未运行")
    table = run("docker", "exec", broker, "rpk", "topic", "describe", "tc.rule.dlq", "-p")
    offsets = {}
    for line in table.splitlines():
        fields = line.split()
        if fields and fields[0].isdigit():
            require(fields[-1].isdigit(), "规则 DLQ 位点格式无效")
            offsets[int(fields[0])] = int(fields[-1])
    require(offsets, "规则 DLQ 分区不可见")
    return broker, offsets


def wait_quota_dlq(deploy, mid, before, timeout=90):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        broker, after = dlq_offsets(deploy)
        for partition, high in after.items():
            start = before.get(partition, 0)
            require(high >= start, "规则 DLQ 位点倒退")
            if high == start:
                continue
            records = run("docker", "exec", broker, "rpk", "topic", "consume",
                          "tc.rule.dlq", "-p", str(partition), "-o", str(start),
                          "-n", str(high - start), "--pretty-print=false")
            for row in records.splitlines():
                record = json.loads(row)
                event = json.loads(record["value"])
                if event["envelope"]["key"]["messageId"] == mid:
                    require(event["failure"] == "QUOTA_REJECTED",
                            "规则拒绝原因不是 QUOTA_REJECTED")
                    return
        time.sleep(2)
    raise base.ProbeError("规则额度拒绝未进入持久 DLQ")


def inbox_count(pg, state, mid):
    pid, mid = base.checked_uuid(state["project"]), base.checked_uuid(mid)
    return base.integer(pg, f"SET app.project_id='{pid}'; SELECT count(*) "
                           "FROM sys_inbox_message "
                           f"WHERE project_id='{pid}' AND message_id='{mid}'")


def wait_inbox(pg, state, mid, timeout=90):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if inbox_count(pg, state, mid) == 1:
            return
        time.sleep(1)
    raise base.ProbeError("自动化独立路径未保留遥测 inbox")


def send(state, value):
    mid = base.uuid7()
    body = json.dumps({"messageId": mid,
        "occurredAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "payload": {"temperature": value}}, separators=(",", ":")).encode()
    base.report(state["projectKey"], state["deviceKey"], state["deviceSecret"], mid, body)
    return mid, body


def prepare(args, pg, limits):
    suffix = secrets.token_hex(5)
    api = base.Api()
    email = f"v5c-{suffix}@example.test"
    password = secrets.token_urlsafe(36)
    base.register(api, email, password)
    verified = base.integer(pg, "WITH verified AS (UPDATE sys_account SET email_verified_at=now() "
                            f"WHERE email='{email}' AND email_verified_at IS NULL RETURNING 1) "
                            "SELECT count(*) FROM verified")
    require(verified == 1, "一次性账号验证失败")
    token = api.call("POST", "/api/v1/auth/login", {"email": email, "password": password})
    api.token = token["accessToken"]
    project = api.call("POST", "/api/v1/projects", {"name": f"v5c-{suffix}", "region": "sh-1"})
    pid, key = base.checked_uuid(project["id"]), project["projectKey"]
    tenant = base.checked_uuid(base.db(pg, f"SELECT tenant_id FROM sys_project WHERE id='{pid}'"))
    switched = api.call("POST", "/api/v1/auth/switch-project", {"projectId": pid})
    api.token = switched["accessToken"]
    did, device_key, secret = base.device_fixture(api, pid, suffix)
    rule_path = f"/api/v1/projects/{pid}/message-rules"
    rule = api.call("POST", rule_path, {"name": f"v5c-rule-{suffix}",
        "source": "input => input", "actions": []}, 201)
    rid = base.checked_uuid(rule["id"])
    versions = api.call("GET", f"{rule_path}/{rid}/version-history")
    version = base.checked_uuid(versions["items"][0]["id"])
    api.call("POST", f"{rule_path}/{rid}/versions/{version}/activate?expectedVersion=1")
    auto_path = f"/api/v1/projects/{pid}/automations"
    auto = api.call("POST", auto_path, {"name": f"v5c-auto-{suffix}",
        "triggerType": "PROPERTY_REPORTED", "triggerConfig": {"deviceId": did},
        "conditions": [{"nodeType": "payload-property-compare",
                        "config": {"pointer": "/temperature", "operator": "GT", "value": 100}}],
        "actions": [{"nodeType": "notification-action",
                     "config": {"channel": "EMAIL", "recipient": email}}]}, 201)
    aid = base.checked_uuid(auto["id"])
    history = api.call("GET", f"{auto_path}/{aid}/version-history")
    aversion = base.checked_uuid(history["items"][0]["id"])
    api.call("POST", f"{auto_path}/{aid}/versions/{aversion}/activate?expectedVersion=1")
    state = {"schema": 1, "candidateSha256": args.candidate_sha256,
             "utcDay": day_now(), "email": email, "password": password,
             "project": pid, "projectKey": key, "tenant": tenant,
             "device": did, "deviceKey": device_key, "deviceSecret": secret,
             "rule": rid, "ruleVersion": version, "automation": aid}
    debug = api.call("POST", f"{rule_path}/{rid}/versions/{version}/debug",
                     {"inputJson": '{"temperature":20}'})
    require(debug.get("status") == "SUCCESS"
            and sources(pg, state) == dict.fromkeys(METRICS, 0),
            "规则调试不得计入生产脚本或自动化指标")
    for index in (1, 2):
        same_day(state["utcDay"])
        mid, body = send(state, 20 + index)
        wait_event(pg, state, mid, "1|0|1")
        first = sources(pg, state)
        base.report(key, device_key, secret, mid, body)
        time.sleep(2)
        require(execution_rows(pg, state, mid) == "1|0|1"
                and sources(pg, state) == first, "相同消息重放重复计量")
    require(first["SCRIPT_EXECUTION"] == 2
            and first["AUTOMATION_EXECUTION"] == 2
            and first["SCRIPT_CPU_MILLIS"] > 0, "生产日志或自动化预留不足")
    actual = wait_counts(pg, state, first)
    projection(api, state, limits, actual)
    state["baseline"] = actual
    state["cpuOverride"] = {"SCRIPT_EXECUTION": max(20, actual["SCRIPT_EXECUTION"] + 10),
                            "AUTOMATION_EXECUTION": 3,
                            "SCRIPT_CPU_MILLIS": actual["SCRIPT_CPU_MILLIS"]}
    state["countOverride"] = {"SCRIPT_EXECUTION": actual["SCRIPT_EXECUTION"],
                              "AUTOMATION_EXECUTION": 3,
                              "SCRIPT_CPU_MILLIS": max(100000, actual["SCRIPT_CPU_MILLIS"] + 10000)}
    save(args.state_file, state)
    print(json.dumps({"result": "PREPARED", "candidateSha256": args.candidate_sha256,
                      "utcDay": state["utcDay"], "project": pid, "baseline": actual,
                      "requiredCpuOverride": {ENV[k]: v for k, v in state["cpuOverride"].items()},
                      "statePath": str(args.state_file)}, sort_keys=True))


def verify(args, pg, limits, state):
    api = base.Api()
    login(api, state)
    initial = wait_counts(pg, state, state["baseline"] if args.phase == "verify-cpu"
                          else state["afterCpu"])
    statuses = projection(api, state, limits, initial)
    expected_hard = "SCRIPT_CPU_MILLIS" if args.phase == "verify-cpu" else "SCRIPT_EXECUTION"
    require(statuses[expected_hard] == "HARD_LIMIT", "目标脚本硬限未形成")
    auto_status = statuses["AUTOMATION_EXECUTION"]
    require(auto_status == "HARD_LIMIT" if args.phase == "verify-count"
            else auto_status in ("NORMAL", "SOFT_LIMIT"),
            "自动化边界前后状态不符")
    if args.phase == "verify-cpu":
        before = dlq_offsets(args.deploy_dir)[1]
        mid, _ = send(state, 31)
        print(json.dumps({"phase": args.phase, "acceptedMessageId": mid}), flush=True)
        wait_quota_dlq(args.deploy_dir, mid, before)
        require(execution_rows(pg, state, mid) == "0|0|0"
                and inbox_count(pg, state, mid) == 0
                and wait_counts(pg, state, state["baseline"]) == state["baseline"],
                "脚本 CPU 硬限后规则、自动化或遥测产生了副作用")
        rule_path = f"/api/v1/projects/{state['project']}/message-rules/{state['rule']}"
        rule = api.call("GET", rule_path)
        api.call("POST", f"{rule_path}/pause?expectedVersion={rule['version']}")
        third, _ = send(state, 32)
        wait_event(pg, state, third, "0|0|1")
        wait_inbox(pg, state, third)
        after = dict(state["baseline"])
        after["AUTOMATION_EXECUTION"] += 1
        require(wait_counts(pg, state, after) == after,
                "暂停规则后的第三次自动化预留归因不符")
        require(projection(api, state, limits, after)["AUTOMATION_EXECUTION"] == "HARD_LIMIT",
                "第三次自动化预留未到硬限")
        fourth, _ = send(state, 33)
        wait_event(pg, state, fourth, "0|1|0")
        wait_inbox(pg, state, fourth)
        require(wait_counts(pg, state, after) == after,
                "自动化硬限后仍新增预留")
        state["cpuVerified"] = True
        state["afterCpu"] = after
        args.state_file.write_text(json.dumps(state, separators=(",", ":")), encoding="utf-8")
        os.chmod(args.state_file, 0o600)
        print(json.dumps({"result": "CPU_AND_AUTOMATION_HARD_LIMIT_VERIFIED",
            "ruleQuotaMessageId": mid, "automationThirdId": third, "automationFourthId": fourth,
            "source": after,
            "requiredCountOverride": {ENV[k]: v for k, v in state["countOverride"].items()}},
            sort_keys=True))
    else:
        require(state.get("cpuVerified") is True, "须先完成 CPU 边界")
        rule_path = f"/api/v1/projects/{state['project']}/message-rules/{state['rule']}"
        rule = api.call("GET", rule_path)
        history = api.call("GET", f"{rule_path}/version-history")
        version = base.checked_uuid(history["items"][0]["id"])
        api.call("POST", f"{rule_path}/versions/{version}/activate"
                 f"?expectedVersion={rule['version']}")
        before = dlq_offsets(args.deploy_dir)[1]
        mid, _ = send(state, 34)
        print(json.dumps({"phase": args.phase, "acceptedMessageId": mid}), flush=True)
        wait_quota_dlq(args.deploy_dir, mid, before)
        require(execution_rows(pg, state, mid) == "0|0|0"
                and inbox_count(pg, state, mid) == 0,
                "脚本次数硬限后仍产生副作用")
        require(wait_counts(pg, state, state["afterCpu"]) == state["afterCpu"],
                "次数/自动化硬限后源事实或计数发生变化")
        projection(api, state, limits, state["afterCpu"])
        print(json.dumps({"result": "COUNT_HARD_LIMIT_VERIFIED", "messageId": mid,
                          "source": state["afterCpu"]}, sort_keys=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase", choices=("prepare", "verify-cpu", "verify-count"), required=True)
    parser.add_argument("--deploy-dir", type=Path, required=True)
    parser.add_argument("--candidate-jar", type=Path, required=True)
    parser.add_argument("--candidate-sha256", required=True)
    parser.add_argument("--state-file", type=Path, required=True)
    args = parser.parse_args()
    state = None if args.phase == "prepare" else load(args.state_file, args.candidate_sha256)
    pg, limits = preflight(args.deploy_dir.resolve(), args.candidate_jar.resolve(),
                           args.candidate_sha256, args.phase, state)
    if args.phase == "prepare":
        prepare(args, pg, limits)
    else:
        verify(args, pg, limits, state)
    preflight(args.deploy_dir.resolve(), args.candidate_jar.resolve(),
              args.candidate_sha256, args.phase, state if state else None)


if __name__ == "__main__":
    try:
        main()
    except base.ProbeError as exc:
        print(f"V5c 探针失败：{exc}", file=sys.stderr)
        raise SystemExit(1) from None

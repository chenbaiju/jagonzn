"""V5f fixed-candidate negative probe for task-origin script daily usage.

Run only on a disposable, isolated NONCOMMERCIAL stack with the property
automation consumer explicitly enabled. A production property report first
establishes nonzero script execution, automation reservation and script CPU
facts. A paused, future ONCE/ALL_DEVICES job is then run manually. Its single
command must be accepted, while task dispatch must add no rule/automation
facts, three daily counters or telemetry inbox rows. Command acceptance is
the boundary here; no device acknowledgement or success is claimed.

The probe does not exercise the separate V5f short-window concurrency case,
real UTC midnight, or a real external notification receiver.
"""

import argparse
import importlib.util
import json
import re
import secrets
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent


def load_module(name, filename):
    helper = HERE / filename
    if not helper.is_file():
        helper = HERE / "tests" / filename
    spec = importlib.util.spec_from_file_location(name, helper)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_module("v5f_base", "smoke-noncommercial-daily-v5b2.py")
v5c = load_module("v5f_v5c", "smoke-noncommercial-daily-v5c.py")
METRICS = v5c.METRICS


def require(value, message):
    base.require(value, message)


def utc_day():
    return datetime.now(timezone.utc).date().isoformat()


def same_day(day):
    require(utc_day() == day, "探针跨越 UTC 午夜；本轮不得合并为单日回执")


def preflight(deploy, jar, expected, admin_port, device_port):
    require(1 <= admin_port <= 65535 and 1 <= device_port <= 65535,
            "回环端口超出范围")
    pg, _ = base.preflight(deploy, jar, expected)
    app = base.compose(deploy, "--profile", "app", "ps", "-q", "app")
    inspected = json.loads(base.command("docker", "inspect", app))
    names = set(v5c.ENV.values()) | {"THINGS_CLOUD_AUTOMATION_PROPERTY_ENABLED"}
    values = {}
    for entry in inspected[0]["Config"]["Env"]:
        key, sep, value = entry.partition("=")
        if sep and key in names:
            require(key not in values, "运行配置键重复")
            values[key] = value
    require(values.get("THINGS_CLOUD_AUTOMATION_PROPERTY_ENABLED", "").lower() == "true",
            "属性自动化消费者未显式启用")
    limits = {}
    for metric, key in v5c.ENV.items():
        raw = values.get(key, "")
        require(re.fullmatch(r"[1-9][0-9]*", raw), "脚本或自动化日容量无效")
        limits[metric] = int(raw)
    owner = base.db(pg, "SELECT entitlement_mode || '|' || automation_execution_daily_limit "
                    "FROM sys_deployment_automation_entitlement WHERE singleton")
    mode, separator, raw = owner.partition("|")
    require(mode == "NONCOMMERCIAL" and separator and re.fullmatch(r"[1-9][0-9]*", raw)
            and int(raw) == limits["AUTOMATION_EXECUTION"],
            "owner 自动化额度与运行配置不符")
    require(all(value >= 10 for value in limits.values()), "任务负例需要充足的三项日容量")
    base.ADMIN = f"http://127.0.0.1:{admin_port}"
    base.DEVICE = f"https://127.0.0.1:{device_port}/device-access/v1/property/report"
    return pg, limits


def fixture(api, pg, suffix, day):
    email = f"v5f-task-{suffix}@example.test"
    password = secrets.token_urlsafe(36)
    base.register(api, email, password)
    verified = base.integer(pg, "WITH verified AS (UPDATE sys_account SET email_verified_at=now() "
                            f"WHERE email='{email}' AND email_verified_at IS NULL RETURNING 1) "
                            "SELECT count(*) FROM verified")
    require(verified == 1, "一次性账号验证失败")
    login = api.call("POST", "/api/v1/auth/login", {"email": email, "password": password})
    api.token = login["accessToken"]
    project = api.call("POST", "/api/v1/projects", {
        "name": f"v5f-task-{suffix}", "region": "sh-1"})
    pid, pkey = base.checked_uuid(project["id"]), project["projectKey"]
    tenant = base.checked_uuid(base.db(pg, f"SELECT tenant_id FROM sys_project WHERE id='{pid}'"))
    selected = api.call("POST", "/api/v1/auth/switch-project", {"projectId": pid})
    api.token = selected["accessToken"]
    type_path = f"/api/v1/projects/{pid}/device-types"
    dtype = api.call("POST", type_path, {
        "typeKey": f"v5ftask_{suffix}", "name": "V5f task source negative",
        "deviceKind": "DIRECT", "payloadProtocol": "STANDARD", "networkType": "WIFI"}, 201)
    tid = base.checked_uuid(dtype["id"])
    api.call("POST", f"{type_path}/{tid}/properties", {
        "propertyKey": "temperature", "name": "Temperature", "accessType": "REPORT",
        "dataType": "NUMBER", "unit": "C", "decimalPlaces": 1,
        "minimumValue": 0, "maximumValue": 100, "sortOrder": 0}, 201)
    api.call("POST", f"{type_path}/{tid}/commands", {
        "commandKey": "v5f_ping", "name": "V5f ping",
        "description": "Task-origin accounting negative probe",
        "inputSchema": '{"type":"object"}', "outputSchema": '{"type":"object"}',
        "timeoutSeconds": 120, "sortOrder": 0}, 201)
    api.call("POST", f"{type_path}/{tid}/publish")
    key = f"v5f-task-{suffix}"
    device = api.call("POST", f"/api/v1/projects/{pid}/devices", {
        "deviceTypeId": tid, "deviceKey": key, "name": "V5f HTTP task device"}, 201)
    did = base.checked_uuid(device["id"])
    credential = api.call("POST", f"/api/v1/projects/{pid}/devices/{did}/credentials",
                          expected=201)
    secret = credential.get("plainSecret")
    require(isinstance(secret, str) and secret, "设备秘密签发失败")
    access_path = f"/api/v1/projects/{pid}/devices/{did}/access-config"
    config = api.call("GET", access_path)
    if config["protocol"] != "HTTP" or not config["enabled"]:
        api.call("PUT", access_path, {"protocol": "HTTP", "enabled": True,
                                       "expectedConfigVersion": config["configVersion"]})
    rule_path = f"/api/v1/projects/{pid}/message-rules"
    rule = api.call("POST", rule_path, {
        "name": f"v5f-task-rule-{suffix}", "source": "input => input", "actions": []}, 201)
    rid = base.checked_uuid(rule["id"])
    versions = api.call("GET", f"{rule_path}/{rid}/version-history")
    version = base.checked_uuid(versions["items"][0]["id"])
    api.call("POST", f"{rule_path}/{rid}/versions/{version}/activate?expectedVersion=1")
    auto_path = f"/api/v1/projects/{pid}/automations"
    automation = api.call("POST", auto_path, {
        "name": f"v5f-task-auto-{suffix}", "triggerType": "PROPERTY_REPORTED",
        "triggerConfig": {"deviceId": did},
        "conditions": [{"nodeType": "payload-property-compare",
                        "config": {"pointer": "/temperature", "operator": "GT", "value": 100}}],
        "actions": [{"nodeType": "notification-action",
                     "config": {"channel": "EMAIL", "recipient": email}}]}, 201)
    aid = base.checked_uuid(automation["id"])
    history = api.call("GET", f"{auto_path}/{aid}/version-history")
    aversion = base.checked_uuid(history["items"][0]["id"])
    api.call("POST", f"{auto_path}/{aid}/versions/{aversion}/activate?expectedVersion=1")
    return {"project": pid, "projectKey": pkey, "tenant": tenant,
            "device": did, "deviceKey": key, "deviceSecret": secret, "utcDay": day}


def inbox(pg, state):
    pid, day = base.checked_uuid(state["project"]), state["utcDay"]
    require(re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", day), "UTC 日期无效")
    begin = f"'{day} 00:00:00+00'::timestamptz"
    return base.integer(pg, f"SET app.project_id='{pid}'; SELECT count(*) "
                        "FROM sys_inbox_message "
                        f"WHERE project_id='{pid}' AND received_at>={begin} "
                        f"AND received_at<({begin}+interval '1 day')")


def downlink(pg, state):
    tenant, pid, day = (base.checked_uuid(state["tenant"]),
                        base.checked_uuid(state["project"]), state["utcDay"])
    require(re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", day), "UTC 日期无效")
    begin = f"'{day} 00:00:00+00'::timestamptz"
    source = base.integer(pg, f"SET app.project_id='{pid}'; SELECT count(*) "
                          "FROM ts_device_command "
                          f"WHERE project_id='{pid}' AND accepted_at>={begin} "
                          f"AND accepted_at<({begin}+interval '1 day')")
    counter = base.integer(pg, "SELECT coalesce(sum(used_value),0) "
                           "FROM sys_usage_counter_daily "
                           f"WHERE tenant_id='{tenant}' AND project_id='{pid}' "
                           f"AND usage_date='{day}' AND metric='DOWNLINK_MESSAGE'")
    return source, counter


def wait_downlink(pg, state, expected, timeout=150):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        same_day(state["utcDay"])
        source, counter = downlink(pg, state)
        if source == counter == expected:
            return source
        time.sleep(2)
    raise base.ProbeError("任务下行源事实与 UTC 日计数未在期限内一致")


def task_command(pg, state, execution):
    pid, eid = base.checked_uuid(state["project"]), base.checked_uuid(execution)
    rows = base.db(pg, f"SET app.project_id='{pid}'; SELECT "
                   "t.device_id || '|' || t.command_id || '|' || t.status || '|' || "
                   "c.status || '|' || c.command_key || '|' || c.tenant_id || '|' || c.project_id "
                   "FROM task_target t JOIN ts_device_command c ON c.id=t.command_id "
                   f"WHERE t.project_id='{pid}' AND t.execution_id='{eid}'")
    return rows.splitlines() if rows else []


def wait_task_command(pg, state, execution, timeout=120):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        same_day(state["utcDay"])
        rows = task_command(pg, state, execution)
        if len(rows) == 1:
            fields = rows[0].split("|")
            require(len(fields) == 7, "任务命令事实格式无效")
            device, command, target_status, command_status, command_key, tenant, project = fields
            require(device == state["device"] and tenant == state["tenant"]
                    and project == state["project"] and command_key == "v5f_ping",
                    "任务目标或命令事实归属不符")
            base.checked_uuid(command)
            require(target_status in {"ACCEPTED", "SUCCEEDED", "FAILED", "TIMED_OUT"}
                    and command_status in {"ACCEPTED", "DISPATCHED", "ACKNOWLEDGED",
                                           "SUCCEEDED", "FAILED", "TIMED_OUT"},
                    "任务目标未可靠受理命令")
            return command, target_status, command_status
        require(len(rows) <= 1, "任务产生重复命令事实")
        time.sleep(1)
    raise base.ProbeError("手工任务未在期限内形成可靠受理命令事实")


def run_probe(args):
    deploy = args.deploy_dir.expanduser().resolve()
    jar = args.candidate_jar.expanduser().resolve()
    pg, limits = preflight(deploy, jar, args.candidate_sha256,
                           args.admin_port, args.device_port)
    day = utc_day()
    suffix = secrets.token_hex(5)
    api = base.Api()
    state = fixture(api, pg, suffix, day)
    same_day(day)
    require(v5c.sources(pg, state) == dict.fromkeys(METRICS, 0)
            and inbox(pg, state) == 0 and downlink(pg, state)[0] == 0,
            "一次性项目产生意外基线事实")
    message = base.uuid7()
    base.report(state["projectKey"], state["deviceKey"], state["deviceSecret"], message)
    v5c.wait_event(pg, state, message, "1|0|1")
    baseline = v5c.wait_counts(pg, state)
    require(baseline["SCRIPT_EXECUTION"] == 1
            and baseline["AUTOMATION_EXECUTION"] == 1
            and baseline["SCRIPT_CPU_MILLIS"] > 0,
            "设备上报未建立非零规则/自动化/CPU 基线")
    require(inbox(pg, state) == 1, "上行遥测 inbox 基线不为一")
    v5c.projection(api, state, limits, baseline)
    before_downlink = wait_downlink(pg, state, 0)
    run_at = (datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat() + "T12:00:00Z"
    job_path = f"/api/v1/projects/{state['project']}/task-jobs"
    job = api.call("POST", job_path, {
        "name": f"v5f-task-{suffix}", "description": "Task origin must not bill scripts",
        "scheduleType": "ONCE", "runAt": run_at, "targetType": "ALL_DEVICES",
        "commandKey": "v5f_ping", "input": {"probe": "v5f-task"}, "enabled": False}, 201)
    job_id = base.checked_uuid(job["id"])
    require(job.get("status") == "PAUSED" and job.get("nextRunAt") is None,
            "未来一次任务未以暂停状态创建")
    triggered = api.call("POST", f"{job_path}/{job_id}/runs", expected=202)
    execution = base.checked_uuid(triggered["id"])
    require(triggered.get("jobId") == job_id and triggered.get("triggerType") == "MANUAL"
            and triggered.get("status") == "EXPANDING",
            "手工任务执行收据不符")
    command, target_status, command_status = wait_task_command(pg, state, execution)
    require(wait_downlink(pg, state, before_downlink + 1) == 1,
            "任务未贡献唯一 UTC 日下行命令")
    # Allow the asynchronous consumers a bounded quiet interval after the
    # accepted command; a task dispatch must not enter property/rule streams.
    time.sleep(5)
    same_day(day)
    require(v5c.sources(pg, state) == baseline
            and v5c.counter(pg, state) == baseline,
            "任务来源增加了脚本/自动化/CPU 源事实或 UTC 日计数")
    require(inbox(pg, state) == 1, "任务派发额外生成遥测 inbox")
    require(v5c.execution_rows(pg, state, message) == "1|0|1",
            "基线遥测规则/自动化事实被任务修改")
    v5c.projection(api, state, limits, baseline)
    pg_again, limits_again = preflight(deploy, jar, args.candidate_sha256,
                                       args.admin_port, args.device_port)
    require(pg_again == pg and limits_again == limits, "探针期间运行候选或容量发生漂移")
    print(json.dumps({"result": "PASS", "candidateSha256": args.candidate_sha256,
                      "utcDay": day, "project": state["project"],
                      "baseline": baseline, "taskId": job_id,
                      "executionId": execution, "commandId": command,
                      "taskTargetStatusObserved": target_status,
                      "commandStatusObserved": command_status,
                      "downlinkBefore": before_downlink,
                      "downlinkAfter": before_downlink + 1,
                      "telemetryInboxAfter": 1,
                      "boundary": "command accepted; device success not asserted"},
                     sort_keys=True), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy-dir", type=Path, required=True)
    parser.add_argument("--candidate-jar", type=Path, required=True)
    parser.add_argument("--candidate-sha256", required=True)
    parser.add_argument("--admin-port", type=int, default=28080)
    parser.add_argument("--device-port", type=int, default=28443)
    args = parser.parse_args()
    try:
        run_probe(args)
    except base.ProbeError as error:
        print(f"V5f task probe failed: {error}", file=sys.stderr)
        return 1
    except Exception:
        # Raw urllib, database or HTTP diagnostics can include credentials.
        print("V5f task probe failed: unexpected local error", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

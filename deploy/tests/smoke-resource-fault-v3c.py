"""V3c: isolated fixed-candidate Broker, device EMQX and Redis fault probe.

Python 3.11+, standard library only. The script creates one disposable project,
stops only resources belonging to the checked jagonzn Compose project, and
restores every stopped service in a finally block. Never use it on a shared or
production Compose project. It neither deletes volumes nor touches tc-* stacks.
"""

import argparse
import hashlib
import importlib.util
import json
import re
import secrets
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path


HERE = Path(__file__).resolve().parent
MODULE = HERE / "smoke-command-downlink-v3a.py"
SPEC = importlib.util.spec_from_file_location("jagonzn_v3a_probe", MODULE)
if SPEC is None or SPEC.loader is None:
    raise SystemExit("V3c FAIL: 缺少相邻 V3a 探针")
v3a = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(v3a)
ProbeError = v3a.ProbeError
require = v3a.require
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")
PROJECT = "jagonzn-service"
DEVICE_URL = "https://127.0.0.1:18443/device-access/v1"


def command(*args, timeout=90):
    result = subprocess.run(args, capture_output=True, text=True, check=False, timeout=timeout)
    require(result.returncode == 0, "隔离候选资源命令失败")
    return result.stdout.strip()


def compose(deploy, *args, timeout=90):
    return command("docker", "compose", "--env-file", str(deploy / ".env.local"),
                   "-f", str(deploy / "compose.yml"), *args, timeout=timeout)


def container(deploy, service, healthy=True):
    profile = ("--profile", "app") if service == "app" else ()
    cid = compose(deploy, *profile, "ps", "-q", service)
    require(bool(cid) and "\n" not in cid, f"独立 {service} 容器缺失")
    meta = json.loads(command("docker", "inspect", cid))
    require(len(meta) == 1, f"独立 {service} 容器身份不唯一")
    labels = meta[0]["Config"].get("Labels") or {}
    require(labels.get("com.docker.compose.project") == PROJECT
            and labels.get("com.docker.compose.service") == service,
            f"{service} 容器不属于预期的独立 Compose 项目")
    state = meta[0]["State"]
    require(state.get("Running") is True, f"独立 {service} 容器未运行")
    if healthy:
        require((state.get("Health") or {}).get("Status") == "healthy",
                f"独立 {service} 容器未健康")
    return cid


def preflight(deploy, candidate_jar, expected):
    require(deploy.is_absolute() and deploy.is_dir(), "--deploy-dir 必须是独立部署绝对目录")
    require((deploy / ".env.local").is_file(), "独立部署缺少 .env.local")
    require(len(expected) == 64 and re.fullmatch(r"[0-9a-f]{64}", expected),
            "候选 SHA-256 格式无效")
    jar = candidate_jar.expanduser().resolve()
    require(jar.is_file(), "固定候选 JAR 缺失")
    digest = hashlib.sha256()
    with jar.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    require(digest.hexdigest() == expected, "宿主固定候选 JAR 摘要不匹配")
    config = json.loads(compose(deploy, "config", "--format", "json"))
    require(config.get("name") == PROJECT, "Compose 项目名不是独立 jagonzn-service")
    app = container(deploy, "app", healthy=False)
    running = command("docker", "exec", app, "sha256sum", "/app/jagonzn-service.jar")
    require(running.split()[0] == expected, "运行 JAR 不等于固定候选")
    for service in ("postgres", "redis", "redpanda", "emqx", "emqx-app"):
        container(deploy, service)
    v3a.HERE = deploy
    pg = container(deploy, "postgres")
    return pg


@contextmanager
def stopped(deploy, service):
    require(service in {"redpanda", "emqx", "redis"}, "故障资源不在 V3c 白名单")
    cid = container(deploy, service)
    try:
        compose(deploy, "stop", "-t", "10", service)
        state = json.loads(command("docker", "inspect", cid))[0]["State"]
        require(state.get("Running") is False, f"独立 {service} 没有停止")
        print(f"fault {service}: stopped")
        yield
    finally:
        try:
            compose(deploy, "up", "-d", "--wait", "--no-deps", service, timeout=180)
            container(deploy, service)
            print(f"fault {service}: restored healthy")
        except (ProbeError, subprocess.TimeoutExpired, KeyError, ValueError):
            raise ProbeError(f"独立 {service} 恢复失败；请检查隔离栈") from None


def setup(api, pg, suffix):
    email = f"v3c-{suffix}@example.test"
    password = secrets.token_urlsafe(36)
    api.call("POST", "/api/v1/auth/register", {"email": email, "password": password}, 204)
    v3a.verify_own_account(pg, email)
    api.token = api.call("POST", "/api/v1/auth/login", {
        "email": email, "password": password})["accessToken"]
    project = api.call("POST", "/api/v1/projects", {
        "name": f"v3c-{suffix}", "region": "sh-1"})
    pid, pkey = project["id"], project["projectKey"]
    api.token = api.call("POST", "/api/v1/auth/switch-project", {
        "projectId": pid})["accessToken"]
    dtype = api.call("POST", f"/api/v1/projects/{pid}/device-types", {
        "typeKey": f"v3c_{suffix}", "name": "V3c resource fault probe",
        "deviceKind": "DIRECT", "payloadProtocol": "STANDARD", "networkType": "WIFI"}, 201)
    tid = dtype["id"]
    api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/properties", {
        "propertyKey": "temperature", "name": "Temperature", "accessType": "REPORT",
        "dataType": "NUMBER", "unit": "C", "decimalPlaces": 1,
        "minimumValue": 0, "maximumValue": 100, "sortOrder": 0}, 201)
    api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/commands", {
        "commandKey": "v3c_ping", "name": "V3c ping", "description": "Resource fault probe",
        "inputSchema": '{"type":"object"}', "outputSchema": '{"type":"object"}',
        "timeoutSeconds": 20, "sortOrder": 0}, 201)
    api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/publish", expected=200)
    devices = {}
    for role, protocol in (("redpanda", "HTTP"), ("redis", "HTTP"),
                           ("http_target", "HTTP"), ("http_other", "HTTP"),
                           ("mqtt_target", "MQTT"), ("mqtt_other", "MQTT")):
        key = f"v3c-{role.replace('_', '-')}-{suffix}"
        device = api.call("POST", f"/api/v1/projects/{pid}/devices", {
            "deviceTypeId": tid, "deviceKey": key, "name": f"V3c {role}"}, 201)
        did = device["id"]
        credential = api.call("POST", f"/api/v1/projects/{pid}/devices/{did}/credentials",
                              expected=201)
        path = f"/api/v1/projects/{pid}/devices/{did}/access-config"
        config = api.call("GET", path)
        if config["protocol"] != protocol or not config["enabled"]:
            api.call("PUT", path, {"protocol": protocol, "enabled": True,
                                    "expectedConfigVersion": config["configVersion"]})
        devices[role] = {"id": did, "key": key, "secret": credential["plainSecret"]}
    return pid, pkey, devices


def device_post(pkey, device, path, body, expected=None, secret=None):
    headers = {"Content-Type": "application/json",
               "X-TC-Device-Key": pkey + "/" + device["key"],
               "X-TC-Device-Secret": device["secret"] if secret is None else secret}
    request = urllib.request.Request(
        DEVICE_URL + path, json.dumps(body, separators=(",", ":")).encode(),
        headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20,
                                    context=ssl._create_unverified_context()) as response:
            status, raw = response.status, response.read(4096)
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read(4096)
    except (urllib.error.URLError, TimeoutError):
        raise ProbeError(f"设备 HTTPS {path} 网络失败") from None
    code = None
    try:
        parsed = json.loads(raw)
        code = parsed.get("errorCode", parsed.get("code"))
    except (ValueError, AttributeError, TypeError):
        parsed = None
    if not isinstance(code, str) or not re.fullmatch(r"[A-Z0-9_]{1,64}", code):
        code = "unknown"
    if expected is not None:
        require(status == expected, f"设备 HTTPS {path} HTTP {status}，预期 {expected}")
    return status, code, parsed


def report(pkey, device, message_id, value, occurred_at, expected=None, secret=None):
    return device_post(pkey, device, "/property/report", {
        "messageId": message_id, "occurredAt": occurred_at,
        "payload": {"temperature": value}}, expected, secret)


def sql(pg, statement):
    result = subprocess.run(["docker", "exec", pg, "psql", "-U", "jagonzn", "-d", "jagonzn",
                             "-v", "ON_ERROR_STOP=1", "-Atqc", statement],
                            capture_output=True, text=True, check=False, timeout=15)
    require(result.returncode == 0, "隔离数据库事实查询失败")
    return result.stdout.strip()


def property_facts(pg, pid, did, mid, value):
    require(all(UUID.fullmatch(v) for v in (pid, did, mid)), "查询 UUID 无效")
    require(value in (32.5, 33.5), "探针属性值不在白名单")
    return sql(pg, f"SET app.project_id='{pid}'; SELECT "
               f"(SELECT count(*) FROM dev_access_request WHERE device_id='{did}' "
               f"AND message_id='{mid}'),"
               f"(SELECT count(*) FROM sys_inbox_message WHERE message_id='{mid}'),"
               f"(SELECT count(*) FROM ts_property_point WHERE message_id='{mid}'),"
               f"(SELECT count(*) FROM dev_shadow WHERE device_id='{did}' "
               f"AND reported->>'temperature'='{value}')")


def wait_property(pg, pid, did, mid, value):
    for _ in range(35):
        facts = property_facts(pg, pid, did, mid, value)
        if facts == "1|1|1|1":
            return
        time.sleep(1)
    raise ProbeError(f"消息 {mid} 恢复后受理/inbox/点/影子事实不为 1|1|1|1")


def check_replay(pg, pid, pkey, device, mid, value, occurred_at):
    report(pkey, device, mid, value, occurred_at, 202)
    wait_property(pg, pid, device["id"], mid, value)
    report(pkey, device, mid, value, occurred_at, 202)
    # Ingestion is asynchronous; a bounded wait catches a second point if it appears.
    time.sleep(2)
    require(property_facts(pg, pid, device["id"], mid, value) == "1|1|1|1",
            "原 ID 重放产生了重复 inbox/时序点或影子不符")


def command_path(pid, did):
    return f"/api/v1/projects/{pid}/devices/{did}/commands"


def submit(api, pid, device):
    marker = secrets.token_hex(6)
    path = command_path(pid, device["id"])
    accepted = api.call("POST", path, {"commandKey": "v3c_ping",
        "input": {"marker": marker}}, 202, {"Idempotency-Key": f"v3c-{marker}"})
    require(accepted.get("status") == "ACCEPTED"
            and accepted.get("deviceId") == device["id"]
            and accepted.get("connectionDeviceId") == device["id"],
            "命令未以原目标身份可靠受理")
    return path, accepted["id"]


def command_facts(pg, pid, cid, did):
    require(all(UUID.fullmatch(v) for v in (pid, cid, did)), "命令事实 UUID 无效")
    return sql(pg, f"SET app.project_id='{pid}'; SELECT c.status || '|' || "
               "c.attempt_count || '|' || "
               "(SELECT count(*) FROM ts_device_command_attempt a WHERE a.command_id=c.id) || '|' || "
               "(SELECT count(*) FROM sys_outbox_event o WHERE o.aggregate_id=c.id "
               "AND o.event_type='DEVICE_COMMAND_DISPATCH') || '|' || "
               "(SELECT count(*) FROM sys_outbox_event o WHERE o.aggregate_id=c.id "
               "AND o.event_type='DEVICE_COMMAND_TERMINAL') || '|' || "
               "(SELECT coalesce(bool_and(a.connection_device_id=c.connection_device_id "
               "AND o.id IS NOT NULL AND o.event_type='DEVICE_COMMAND_DISPATCH'),true) "
               "FROM ts_device_command_attempt a LEFT JOIN sys_outbox_event o "
               "ON o.id=a.outbox_event_id WHERE a.command_id=c.id)::text || '|' || "
               f"(c.connection_device_id='{did}'::uuid)::text || '|' || "
               "(SELECT count(*) FROM ts_device_command_attempt a WHERE a.command_id=c.id "
               "AND a.published_at IS NOT NULL) || '|' || "
               "(SELECT count(*) FROM ts_device_command_attempt a WHERE a.command_id=c.id "
               "AND a.status='FAILED' AND a.error_code LIKE 'DISPATCH_%') "
               f"FROM ts_device_command c WHERE c.id='{cid}'::uuid")


def claim_facts(pg, pid, cid, did):
    require(all(UUID.fullmatch(v) for v in (pid, cid, did)), "领取事实 UUID 无效")
    return sql(pg, f"SET app.project_id='{pid}'; SELECT c.status || '|' || "
               "c.attempt_count || '|' || "
               "(SELECT count(*) FROM ts_device_command_claim l WHERE l.command_id=c.id "
               "AND l.status='REPLIED' AND l.attempt_no=1 "
               "AND l.connection_device_id=c.connection_device_id) || '|' || "
               "(SELECT count(*) FROM ts_device_command_attempt a WHERE a.command_id=c.id) || '|' || "
               f"(c.connection_device_id='{did}'::uuid)::text "
               f"FROM ts_device_command c WHERE c.id='{cid}'::uuid")


def wait_command(api, path, cid, status, seconds=45):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        result = api.call("GET", path + "/" + cid)
        if result.get("status") == status:
            return result
        if result.get("status") in v3a.TERMINAL:
            raise ProbeError(f"命令 {cid} 进入意外终态 {result['status']}")
        time.sleep(0.5)
    raise ProbeError(f"命令 {cid} 未在期限内进入 {status}")


def run_redpanda(deploy, pg, pid, pkey, device):
    mid = v3a.uuid7()
    occurred_at = v3a.utc_now()
    with stopped(deploy, "redpanda"):
        status, code, _ = report(pkey, device, mid, 32.5, occurred_at)
        require(status == 503 and code == "HANDOFF_UNAVAILABLE",
                f"Redpanda 停止后上报应 503，实际 HTTP {status}, code={code}")
        require(property_facts(pg, pid, device["id"], mid, 32.5) == "0|0|0|0",
                "Redpanda 故障受理留下了业务事实")
    check_replay(pg, pid, pkey, device, mid, 32.5, occurred_at)
    print(f"redpanda: 503/no facts -> same message 202/replay one point, message={mid}")


def run_emqx(deploy, api, pg, pid, pkey, target, other):
    with stopped(deploy, "emqx"):
        try:
            unexpected = v3a.MqttDevice(pkey, target)
        except (OSError, ProbeError):
            pass
        else:
            unexpected.close()
            raise ProbeError("EMQX 停止后设备仍可新建 MQTT 连接")
        path, fault_cid = submit(api, pid, target)
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline:
            facts = command_facts(pg, pid, fault_cid, target["id"]).split("|")
            require(len(facts) == 9 and facts[5:7] == ["true", "true"],
                    "Broker 故障命令 outbox/attempt 原接收者改变")
            if int(facts[2]) >= 1 and int(facts[3]) >= 1 and int(facts[8]) >= 1:
                break
            time.sleep(1)
        else:
            raise ProbeError("EMQX 停止窗口未观察到 DISPATCH_* 失败尝试")
        print(f"emqx fault: failed dispatch attempts={facts[8]}, "
              f"published-to-EMQX attempts={facts[7]}")
    # The command accepted during outage may exhaust its three dispatch attempts.
    # Wait for it before testing a fresh command, so no old downlink is confused
    # with the restored command. Its final result is recorded, not pre-assumed.
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        old = api.call("GET", path + "/" + fault_cid)
        if old["status"] in v3a.TERMINAL:
            break
        time.sleep(1)
    else:
        raise ProbeError("EMQX 故障期间受理的命令未收敛到终态")
    old_facts = command_facts(pg, pid, fault_cid, target["id"]).split("|")
    require(len(old_facts) == 9 and int(old_facts[1]) == int(old_facts[2])
            and int(old_facts[3]) >= 1 and old_facts[5:7] == ["true", "true"]
            and int(old_facts[8]) >= 1,
            "Broker 故障命令 attempt/outbox 不完整")
    transport = v3a.MqttDevice(pkey, target)
    other_transport = v3a.MqttDevice(pkey, other)
    try:
        restored_path, cid = submit(api, pid, target)
        observed, body = transport.receive(time.monotonic() + 25)
        require(observed == cid and body.get("targetDeviceKey") == target["key"],
                "EMQX 恢复后命令未到原设备")
        other_transport.reply(cid)
        time.sleep(1)
        interim = api.call("GET", restored_path + "/" + cid)
        require(interim["status"] not in ("SUCCEEDED", "FAILED"),
                "其他设备伪回执改变命令终态")
        transport.reply(cid)
        result = wait_command(api, restored_path, cid, "SUCCEEDED")
        require(result.get("attemptCount") == 1, "恢复后命令重发次数不是 1")
        current = command_facts(pg, pid, cid, target["id"]).split("|")
        require(current == ["SUCCEEDED", "1", "1", "1", "1", "true", "true", "1", "0"],
                "EMQX 恢复命令 attempt/outbox/原接收者事实不符")
    finally:
        other_transport.close()
        transport.close()
    print(f"emqx: stopped/new connect refused, prior={old['status']}, "
          f"restored SUCCEEDED, prior_command={fault_cid}, command={cid}")


def run_redis(deploy, api, pg, pid, pkey, reporter, target, other):
    path, cid = submit(api, pid, target)
    mid = v3a.uuid7()
    wrong_mid = v3a.uuid7()
    occurred_at = v3a.utc_now()
    reply = {"commandId": cid, "messageId": v3a.uuid7(),
             "occurredAt": v3a.utc_now(), "status": "SUCCESS",
             "output": {"probe": "v3c"}}
    with stopped(deploy, "redis"):
        status, code, _ = report(pkey, reporter, mid, 33.5, occurred_at)
        require(status in (202, 503), f"Redis 故障真实凭据上报 HTTP {status} 非合同边界")
        wrong_status, wrong_code, _ = report(
            pkey, target, wrong_mid, 33.5, occurred_at,
            secret=secrets.token_urlsafe(36))
        require(wrong_status == 401 and wrong_code in ("AUTH_FAILED", "AUTH_REQUIRED"),
                f"Redis 故障错误凭据未被拒绝：HTTP {wrong_status}, code={wrong_code}")
        other_status, other_code, _ = device_post(pkey, other, "/command/reply", reply)
        require(other_status not in (200, 202), "Redis 故障非原设备回复被受理")
        if other_status == 404:
            require(other_code == "COMMAND_NOT_FOUND", "非原设备回复未获稳定拒绝码")
        require(property_facts(pg, pid, target["id"], wrong_mid, 33.5) == "0|0|0|0",
                "错误凭据在 Redis 故障期间留下事实")
        # A failed credential may briefly back off the target's authentication.
        time.sleep(2)
        claim_status, _, claimed = device_post(pkey, target, "/command/claim", {})
        claimed_during_fault = False
        if claim_status == 200:
            commands = (claimed or {}).get("commands") or []
            require(len(commands) == 1 and commands[0].get("commandId") == cid,
                    "Redis 故障期间领取了错误命令")
            claimed_during_fault = True
            reply_status, _, accepted = device_post(pkey, target, "/command/reply", reply)
            require(reply_status == 202 and (accepted or {}).get("commandId") == cid,
                    "Redis 故障期间原设备回复未受理")
        else:
            require(claim_status in (204, 429, 503),
                    f"Redis 故障期间 HTTP 命令领取返回 {claim_status}")
        print(f"redis fault: valid HTTP {status}, wrong credential {wrong_status}, "
              f"other-device reply {other_status}, claim {claim_status}")
    # Recovered authorization is checked independently if a Redis failure
    # prevented the cross-device request from reaching command ownership.
    after_status, after_code, _ = device_post(pkey, other, "/command/reply", reply)
    require(after_status == 404 and after_code == "COMMAND_NOT_FOUND",
            "Redis 恢复后非原接收设备没有被 COMMAND_NOT_FOUND 拒绝")
    if status == 503:
        require(property_facts(pg, pid, reporter["id"], mid, 33.5) == "0|0|0|0",
                "Redis 故障未受理请求留下事实")
    check_replay(pg, pid, pkey, reporter, mid, 33.5, occurred_at)
    require(property_facts(pg, pid, target["id"], wrong_mid, 33.5) == "0|0|0|0",
            "错误凭据恢复后出现上行副作用")
    if not claimed_during_fault:
        claim_status, _, claimed = device_post(pkey, target, "/command/claim", {})
        require(claim_status == 200 and len((claimed or {}).get("commands") or []) == 1
                and claimed["commands"][0].get("commandId") == cid,
                "Redis 恢复后原命令未能由原设备领取")
        reply_status, _, accepted = device_post(pkey, target, "/command/reply", reply)
        require(reply_status == 202 and (accepted or {}).get("commandId") == cid,
                "Redis 恢复后原设备回复未受理")
    result = wait_command(api, path, cid, "SUCCEEDED")
    require(result.get("attemptCount") == 1, "Redis 故障命令领取次数不为 1")
    require(claim_facts(pg, pid, cid, target["id"]) == "SUCCEEDED|1|1|0|true",
            "Redis 故障/恢复后的命令领取、推送和接收者事实不符")
    print(f"redis: recovered same ID/replay one point, HTTP claim/reply SUCCEEDED, "
          f"command={cid}, message={mid}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy-dir", required=True, type=Path,
                        help="独立 jagonzn/deploy 绝对目录")
    parser.add_argument("--candidate-jar", required=True, type=Path,
                        help="固定候选 JAR 绝对路径")
    parser.add_argument("--candidate-sha256", required=True,
                        help="宿主和运行容器相同的固定候选 SHA-256")
    args = parser.parse_args()
    deploy = args.deploy_dir.expanduser().resolve()
    pg = preflight(deploy, args.candidate_jar, args.candidate_sha256)
    suffix = secrets.token_hex(5)
    api = v3a.Api()
    pid, pkey, devices = setup(api, pg, suffix)
    print(f"V3c fixture: project={pid}, prefix=v3c-{suffix}, candidate={args.candidate_sha256}")
    run_redpanda(deploy, pg, pid, pkey, devices["redpanda"])
    run_emqx(deploy, api, pg, pid, pkey, devices["mqtt_target"], devices["mqtt_other"])
    run_redis(deploy, api, pg, pid, pkey, devices["redis"],
              devices["http_target"], devices["http_other"])
    preflight(deploy, args.candidate_jar, args.candidate_sha256)
    print("V3c Redpanda/EMQX/Redis 停止、恢复和 DB 副作用检查通过")


if __name__ == "__main__":
    try:
        main()
    except (ProbeError, KeyError, ValueError, OSError, subprocess.TimeoutExpired) as error:
        message = str(error) if isinstance(error, ProbeError) else type(error).__name__
        print("V3c FAIL: " + message, file=sys.stderr)
        sys.exit(1)

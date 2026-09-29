"""V5e fixed-candidate four-protocol overage and pull-command probe.

Run only on a disposable isolated NONCOMMERCIAL stack whose four telemetry
daily limits have temporarily been set to 2/2/252/2. The operator must
restore the base Compose app without the limit overlay after this probe and
recheck its JAR digest, original limits and health. This probe changes only
its own disposable tenant facts; it never edits entitlement or configuration.

CoAP runs on the isolated app container network. It is not Windows-host UDP
qualification. The explicit TCP/MQTT and loopback HTTPS ports belong to the
isolated stack. No credential, token, payload or external response is logged.
"""

import argparse
import importlib.util
import json
import re
import secrets
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
LIMITS = {"UPLINK_MESSAGE": 2, "DOWNLINK_MESSAGE": 2,
          "UPLINK_BYTES": 252, "TIME_SERIES_POINT": 2}
PROTOCOLS = ("HTTP", "MQTT", "TCP", "COAP")
CLAIM_LINE = re.compile(
    r"COAP_CLAIM index=([123]) code=205 command=([0-9a-f-]{36}) "
    r"attempt=([123]) leaseExpiresAt=\S+\Z")


def module(filename, name):
    source = HERE / filename
    if not source.is_file():
        raise RuntimeError("固定候选探针依赖缺失")
    spec = importlib.util.spec_from_file_location(name, source)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def check_day(base, day):
    base.require(base.utc_now().date().isoformat() == day,
                 "探针跨越真实 UTC 午夜，不能按单日样例验收")


def same_day_room(base):
    now = base.utc_now()
    next_day = datetime.combine(now.date() + timedelta(days=1),
                                datetime.min.time(), timezone.utc)
    base.require((next_day - now).total_seconds() >= 900,
                 "距 UTC 午夜不足 15 分钟，先等待下一日再运行")
    return now.date().isoformat()


def setup_once(base, api, pg):
    for attempt in range(3):
        try:
            return base.setup(api, pg, secrets.token_hex(5))
        except base.ProbeError as error:
            if "POST /api/v1/auth/register 状态 429" not in str(error) or attempt == 2:
                raise
            print("V5e: 注册原有限流短窗已满，等待恢复", flush=True)
            time.sleep(305)
    raise base.ProbeError("一次性租户无法创建")


def usage(base, boundary, pg, tenant, project, other, day, api, expected, stages):
    counted = base.wait_counters(pg, tenant, (project, other), (day,), seconds=150)
    actual, second = counted[(project, day)], counted[(other, day)]
    base.require(actual == expected, "源表/异步日计数与预期不同")
    base.require(all(value == 0 for value in second.values()),
                 "未使用项目意外产生遥测日计量")
    status = boundary.observed_quota(base, api, project, day, expected, stages)
    return status


def http_auth_budget(times):
    """Keep below the device's five-authentication fixed 60-second budget."""
    while True:
        now = time.monotonic()
        times[:] = [stamp for stamp in times if now - stamp < 61]
        if len(times) < 4:
            times.append(now)
            return
        time.sleep(max(0.1, 61 - (now - times[0])))


def mqtt_report(base, port, project_key, device, report):
    raw = json.dumps(report, separators=(",", ":"))
    base.helper_report("smoke_mqtt.py", {
        "host": "127.0.0.1", "port": port,
        "clientId": "v5e-" + secrets.token_hex(8),
        "username": project_key + "/" + device["key"],
        "password": device["secret"],
        "topic": f"tc/v1/{project_key}/{device['key']}/up/property/report",
        "payload": raw})
    return len(raw.encode())


def tcp_report(base, port, project_key, device, report):
    base.helper_report("smoke_tcp.py", {
        "host": "127.0.0.1", "port": port, "projectKey": project_key,
        "deviceKey": device["key"], "password": device["secret"],
        "payload": report})
    return len(json.dumps(report, separators=(",", ":")).encode())


def reports(base, boundary, args, coap, pg, tenant, project, other,
            project_key, devices, day, api, http_auth_times):
    bytes_used = 0
    reports_by_protocol = {}
    for ordinal in range(1, 8):
        check_day(base, day)
        protocol = "HTTP" if ordinal <= 4 else PROTOCOLS[ordinal - 4]
        # Six fixed timestamp digits and one numeric property make every
        # report exactly 126 bytes. The CoAP helper has this same frozen body.
        occurred = base.utc_now().replace(microsecond=123456)
        temperature = 31.5 if protocol == "COAP" else float(20 + ordinal)
        report = base.payload(base.uuid7(), occurred, {"temperature": temperature})
        device = devices[(1, protocol)]
        def send():
            if protocol == "HTTP":
                http_auth_budget(http_auth_times)
                return base.http_report(project_key, device, report)
            if protocol == "MQTT":
                return mqtt_report(base, args.mqtt_port, project_key, device, report)
            if protocol == "TCP":
                return tcp_report(base, args.tcp_port, project_key, device, report)
            return coap.report(project_key, device, report)

        size = send()
        base.require(size == 126, f"{protocol} 设备报文字节边界不是 126")
        points = 1 if ordinal <= 3 else 0
        base.wait_message(pg, project, report["messageId"], points, size)
        base.require(send() == size, f"{protocol} 同 ID 重放字节数变化")
        base.wait_message(pg, project, report["messageId"], points, size)
        bytes_used += size
        expected = {"UPLINK_MESSAGE": ordinal, "DOWNLINK_MESSAGE": 0,
                    "UPLINK_BYTES": bytes_used, "TIME_SERIES_POINT": min(ordinal, 3)}
        stage = ("NORMAL", "HARD_LIMIT", "DEGRADED")[min(ordinal - 1, 2)]
        status = usage(base, boundary, pg, tenant, project, other, day, api,
                       expected, {"UPLINK_MESSAGE": stage, "UPLINK_BYTES": stage,
                                  "TIME_SERIES_POINT": stage,
                                  "DOWNLINK_MESSAGE": "NORMAL"})
        if ordinal >= 4:
            reports_by_protocol[protocol] = {"messageId": report["messageId"],
                                             "bytes": size, "historicalPoints": points,
                                             "status": status["UPLINK_MESSAGE"]}
    base.require(set(reports_by_protocol) == set(PROTOCOLS),
                 "严重超额未覆盖完整四协议")
    return expected, reports_by_protocol


def http_claim(base, project_key, device, command_id, number, auth_times):
    http_auth_budget(auth_times)
    body = b'{"limit":1,"leaseSeconds":10}'
    request = urllib.request.Request(
        base.DEVICE + "/device-access/v1/command/claim", body,
        {"Content-Type": "application/json",
         "X-TC-Device-Key": project_key + "/" + device["key"],
         "X-TC-Device-Secret": device["secret"]}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=15,
                                    context=ssl._create_unverified_context()) as response:
            status, raw = response.status, response.read(8192)
    except urllib.error.HTTPError as error:
        status, raw = error.code, b""
    except (urllib.error.URLError, TimeoutError):
        raise base.ProbeError("HTTP 命令领取网络失败") from None
    base.require(status == 200, f"HTTP 第 {number} 次命令领取状态 {status}，预期 200")
    try:
        parsed = json.loads(raw)
        rows = parsed.get("commands") or []
        item = rows[0] if len(rows) == 1 else {}
    except (ValueError, TypeError, AttributeError):
        raise base.ProbeError("HTTP 命令领取响应结构无效") from None
    base.require(item.get("commandId") == command_id
                 and item.get("attempt") == number
                 and isinstance(item.get("leaseExpiresAt"), str),
                 "HTTP 命令领取未保持同一逻辑 ID 与递增尝试号")


def http_retries(base, project_key, device, command_id, auth_times):
    for number in (1, 2, 3):
        if number > 1:
            time.sleep(11)
        http_claim(base, project_key, device, command_id, number, auth_times)


def compile_coap_claim(base, coap):
    source = HERE / "SmokeCoapClaim.java"
    base.require(source.is_file(), "CoAP 命令重领助手缺失")
    base.command("javac", "-cp", str(coap.root / "lib" / "*"),
                 "-d", str(coap.root), str(source), timeout=60)


def coap_retries(base, coap, project_key, device, command_id):
    fields = "\n".join((project_key, device["key"], device["secret"])) + "\n"
    output = base.command("docker", "run", "--rm", "-i", "--network",
                          f"container:{coap.app}", "-v", f"{coap.root}:/work:ro",
                          "-v", f"{coap.certs}:/certs:ro", "eclipse-temurin:21-jre",
                          "java", "-cp", "/work:/work/lib/*", "SmokeCoapClaim",
                          "/certs", command_id, "3", "11000", "10",
                          input_text=fields, timeout=100)
    claims = [CLAIM_LINE.fullmatch(line) for line in output.splitlines()]
    base.require(len(claims) == 3 and all(claims),
                 "CoAP/DTLS 未返回三条稳定领取回执")
    base.require([int(match[1]) for match in claims] == [1, 2, 3]
                 and [int(match[3]) for match in claims] == [1, 2, 3]
                 and all(match[2] == command_id for match in claims),
                 "CoAP/DTLS 重领未归于同一逻辑命令")


def command_facts(base, pg, project, command_id):
    pid, cid = base.checked_uuid(project), base.checked_uuid(command_id)
    value = base.db(pg, f"SET app.project_id='{pid}'; SELECT "
                    "c.status || '|' || c.attempt_count || '|' || "
                    "(SELECT count(*) FROM ts_device_command_claim l WHERE l.command_id=c.id) || '|' || "
                    "(SELECT count(*) FROM ts_device_command_attempt a WHERE a.command_id=c.id) || '|' || "
                    "coalesce((SELECT string_agg(l.attempt_no::text, ',' ORDER BY l.attempt_no) "
                    "FROM ts_device_command_claim l WHERE l.command_id=c.id),'') "
                    f"FROM ts_device_command c WHERE c.id='{cid}'")
    base.require(value == "TIMED_OUT|3|3|0|1,2,3",
                 "下行终态、领取行或尝试事实不符")


def wait_terminal(base, api, pg, project, device, command_id):
    route = f"/api/v1/projects/{project}/devices/{device['id']}/commands/{command_id}"
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        state = api.call("GET", route)
        if state.get("status") == "TIMED_OUT":
            base.require(state.get("attemptCount") == 3
                         and state.get("failureCode") == "RESPONSE_TIMEOUT",
                         "三次重领最终错误码不符")
            command_facts(base, pg, project, command_id)
            return
        base.require(state.get("status") in ("ACCEPTED", "DISPATCHED", "ACKNOWLEDGED"),
                     "重领命令进入意外终态")
        time.sleep(0.5)
    raise base.ProbeError("三次重领命令未在限时内超时终结")


def commands(base, boundary, args, coap, pg, tenant, project, other,
             project_key, devices, day, api, initial, http_auth_times):
    command_ids = []
    last_auth = {}
    compile_coap_claim(base, coap)
    # The two devices each have a fixed authentication window. Spacing the
    # second use avoids treating the access budget as command quota behavior.
    for ordinal, protocol in enumerate(("HTTP", "COAP", "HTTP", "COAP"), 1):
        check_day(base, day)
        earlier = last_auth.get(protocol)
        if earlier is not None:
            time.sleep(max(0.0, 62 - (time.monotonic() - earlier)))
        device = devices[(1, protocol)]
        path = f"/api/v1/projects/{project}/devices/{device['id']}/commands"
        key = "v5e-" + secrets.token_hex(10)
        body = {"commandKey": "v5b1_ping",
                "input": {"v5e": protocol.lower(), "ordinal": ordinal}}
        accepted = api.call("POST", path, body, 202, {"Idempotency-Key": key})
        command_id = base.checked_uuid(accepted["id"])
        base.require(accepted.get("status") == "ACCEPTED",
                     "逻辑命令未受理")
        command_ids.append(command_id)
        expected = dict(initial, DOWNLINK_MESSAGE=ordinal)
        stage = ("NORMAL", "HARD_LIMIT", "DEGRADED")[min(ordinal - 1, 2)]
        usage(base, boundary, pg, tenant, project, other, day, api, expected,
              {"UPLINK_MESSAGE": "DEGRADED", "UPLINK_BYTES": "DEGRADED",
               "TIME_SERIES_POINT": "DEGRADED", "DOWNLINK_MESSAGE": stage})
        last_auth[protocol] = time.monotonic()
        if protocol == "HTTP":
            http_retries(base, project_key, device, command_id, http_auth_times)
        else:
            coap_retries(base, coap, project_key, device, command_id)
        wait_terminal(base, api, pg, project, device, command_id)
        replay = api.call("POST", path, body, 202, {"Idempotency-Key": key})
        base.require(replay.get("id") == command_id,
                     "同键重放生成第二条逻辑命令")
        usage(base, boundary, pg, tenant, project, other, day, api, expected,
              {"UPLINK_MESSAGE": "DEGRADED", "UPLINK_BYTES": "DEGRADED",
               "TIME_SERIES_POINT": "DEGRADED", "DOWNLINK_MESSAGE": stage})
    return expected, command_ids


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy-dir", required=True)
    parser.add_argument("--candidate-jar", required=True)
    parser.add_argument("--candidate-sha256", required=True)
    parser.add_argument("--maven-repo", default=str(Path.home() / ".m2/repository"))
    parser.add_argument("--admin-port", type=int, required=True)
    parser.add_argument("--device-port", type=int, required=True)
    parser.add_argument("--mqtt-port", type=int, default=21883)
    parser.add_argument("--tcp-port", type=int, default=18883)
    args = parser.parse_args()
    base = module("smoke-noncommercial-daily-v5b1.py", "v5e_base")
    boundary = module("smoke-noncommercial-daily-v5b1-boundary.py", "v5e_boundary")
    base.require(all(0 < value < 65536 for value in
                     (args.admin_port, args.device_port, args.mqtt_port, args.tcp_port)),
                 "回环端口超出有效范围")
    base.ADMIN = f"http://127.0.0.1:{args.admin_port}"
    base.DEVICE = f"https://127.0.0.1:{args.device_port}"
    deploy = Path(args.deploy_dir).expanduser().resolve()
    jar = Path(args.candidate_jar).expanduser().resolve()
    app, pg, limits = base.preflight(deploy, jar, args.candidate_sha256)
    base.require(limits == LIMITS, "必须先在隔离 app 启用 2/2/252/2 临时日限额")
    day = same_day_room(base)
    api = base.Api()
    projects, devices = setup_once(base, api, pg)
    project, other = projects[0][0], projects[1][0]
    tenant = base.owner(pg, project)
    api.token = api.call("POST", "/api/v1/auth/switch-project",
                         {"projectId": project})["accessToken"]
    initial = {metric: 0 for metric in base.METRICS}
    usage(base, boundary, pg, tenant, project, other, day, api, initial,
          {metric: "NORMAL" for metric in base.METRICS})
    coap = base.CoapClient(app, args.maven_repo, deploy / "config")
    http_auth_times = []
    try:
        uplink, per_protocol = reports(base, boundary, args, coap, pg, tenant,
                                       project, other, projects[0][1], devices, day, api,
                                       http_auth_times)
        final, command_ids = commands(base, boundary, args, coap, pg, tenant,
                                      project, other, projects[0][1], devices, day, api,
                                      uplink, http_auth_times)
        check_day(base, day)
        _, _, after = base.preflight(deploy, jar, args.candidate_sha256, LIMITS)
        base.require(after == LIMITS, "运行中的临时限额或制品发生改变")
        print(json.dumps({"result": "PASS", "candidateSha256": args.candidate_sha256,
                          "utcDay": day, "tenant": tenant, "project": project,
                          "limits": LIMITS, "used": final,
                          "degradedProtocols": per_protocol,
                          "logicalCommands": command_ids,
                          "httpAndCoapClaimAttemptsPerCommand": 3,
                          "restoreRequired": "移除临时限额覆盖，重建基础 app 并核对原容量、JAR 与健康",
                          "unverified": ["Windows host UDP", "real UTC midnight",
                                         "external receiver delivery"]}, sort_keys=True))
    finally:
        coap.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never print raw network, Docker or Java exception strings; they may
        # contain a request, token or process environment.
        label = str(error) if error.__class__.__name__ == "ProbeError" else "探针输入或隔离环境失败"
        print("V5e FAIL: " + label, file=sys.stderr)
        sys.exit(1)

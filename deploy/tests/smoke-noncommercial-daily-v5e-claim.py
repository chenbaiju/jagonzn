"""V5e fixed-candidate HTTP/CoAP claim retry accounting probe.

Uses one disposable project with HTTP and CoAP/DTLS devices, each receiving
one logical command. Each device claims three times without replying. Assert
one daily DOWNLINK_MESSAGE per command, three claim rows, no push attempts,
and eventual TIMED_OUT. The Java DTLS helper is compiled from this directory.
"""

import argparse
import importlib.util
import json
import re
import secrets
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v5e_claim_base", HERE / "smoke-noncommercial-daily-v5b1.py")
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)
JARS = (
    "org/eclipse/californium/californium-core/3.14.0/californium-core-3.14.0.jar",
    "org/eclipse/californium/element-connector/3.14.0/element-connector-3.14.0.jar",
    "org/eclipse/californium/scandium/3.14.0/scandium-3.14.0.jar",
    "org/slf4j/slf4j-api/2.0.18/slf4j-api-2.0.18.jar",
)


def same_day(day):
    base.require(datetime.now(timezone.utc).date().isoformat() == day,
                 "探针穿越 UTC 午夜，不能作为同一日回执")


def setup(api, pg, suffix):
    email = f"v5eclaim-{suffix}@example.test"
    password = secrets.token_urlsafe(36)
    api.call("POST", "/api/v1/auth/register", {"email": email, "password": password}, 204)
    verified = base.db_int(pg, "WITH verified AS (UPDATE sys_account SET email_verified_at=now() "
                           f"WHERE email='{email}' AND email_verified_at IS NULL RETURNING 1) "
                           "SELECT count(*) FROM verified")
    base.require(verified == 1, "一次性账号验证失败")
    api.token = api.call("POST", "/api/v1/auth/login", {
        "email": email, "password": password})["accessToken"]
    project = api.call("POST", "/api/v1/projects", {
        "name": f"v5eclaim-{suffix}", "region": "sh-1"})
    pid, pkey = base.checked_uuid(project["id"]), project["projectKey"]
    tenant = base.owner(pg, pid)
    api.token = api.call("POST", "/api/v1/auth/switch-project", {
        "projectId": pid})["accessToken"]
    dtype = api.call("POST", f"/api/v1/projects/{pid}/device-types", {
        "typeKey": f"v5eclaim_{suffix}", "name": "V5e claim retry",
        "deviceKind": "DIRECT", "payloadProtocol": "STANDARD", "networkType": "WIFI"}, 201)
    tid = base.checked_uuid(dtype["id"])
    api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/commands", {
        "commandKey": "v5e_ping", "name": "V5e ping", "description": "Claim accounting probe",
        "inputSchema": '{"type":"object"}', "outputSchema": '{"type":"object"}',
        "timeoutSeconds": 120, "sortOrder": 0}, 201)
    api.call("POST", f"/api/v1/projects/{pid}/device-types/{tid}/publish")
    devices = {}
    for protocol in ("HTTP", "COAP"):
        key = f"v5eclaim-{protocol.lower()}-{suffix}"
        created = api.call("POST", f"/api/v1/projects/{pid}/devices", {
            "deviceTypeId": tid, "deviceKey": key, "name": f"V5e {protocol}"}, 201)
        did = base.checked_uuid(created["id"])
        credential = api.call("POST", f"/api/v1/projects/{pid}/devices/{did}/credentials",
                              expected=201)
        secret = credential.get("plainSecret")
        base.require(isinstance(secret, str) and secret, "设备凭据签发失败")
        route = f"/api/v1/projects/{pid}/devices/{did}/access-config"
        config = api.call("GET", route)
        if config["protocol"] != protocol or not config["enabled"]:
            api.call("PUT", route, {"protocol": protocol, "enabled": True,
                                    "expectedConfigVersion": config["configVersion"]})
        devices[protocol] = {"id": did, "key": key, "secret": secret}
    return pid, pkey, tenant, devices


def submit(api, pid, did, protocol):
    marker = secrets.token_hex(6)
    path = f"/api/v1/projects/{pid}/devices/{did}/commands"
    accepted = api.call("POST", path, {
        "commandKey": "v5e_ping", "input": {"marker": marker, "protocol": protocol}},
        202, {"Idempotency-Key": f"v5e-{protocol.lower()}-{marker}"})
    command_id = base.checked_uuid(accepted["id"])
    base.require(accepted["status"] == "ACCEPTED"
                 and accepted["deviceId"] == accepted["connectionDeviceId"] == did,
                 "逻辑命令受理或原接收者不符")
    replay = api.call("POST", path, {
        "commandKey": "v5e_ping", "input": {"marker": marker, "protocol": protocol}},
        202, {"Idempotency-Key": f"v5e-{protocol.lower()}-{marker}"})
    base.require(replay["id"] == command_id, "同幂等键重放形成新逻辑命令")
    return command_id


def http_claim(project_key, device, command_id):
    for attempt in range(1, 4):
        request = urllib.request.Request(
            base.DEVICE + "/device-access/v1/command/claim", b'{"leaseSeconds":10}',
            {"Content-Type": "application/json",
             "X-TC-Device-Key": project_key + "/" + device["key"],
             "X-TC-Device-Secret": device["secret"]}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=15,
                                        context=ssl._create_unverified_context()) as response:
                status, raw = response.status, response.read(4096)
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read(4096)
        except (urllib.error.URLError, TimeoutError):
            raise base.ProbeError("设备 HTTPS 命令领取网络失败") from None
        base.require(status == 200, f"设备 HTTPS 命令领取状态 {status}，预期 200")
        claimed = json.loads(raw)
        rows = claimed.get("commands") or []
        base.require(len(rows) == 1 and rows[0].get("commandId") == command_id
                     and rows[0].get("attempt") == attempt
                     and rows[0].get("leaseExpiresAt"),
                     "HTTPS 命令领取 ID、次数或租约不符")
        if attempt < 3:
            time.sleep(11)


def coap_claim(app, pkey, device, command_id, maven_repo, certs):
    source = HERE / "SmokeCoapClaim.java"
    repo = Path(maven_repo).expanduser().resolve()
    jars = [repo / item for item in JARS]
    base.require(source.is_file() and all(jar.is_file() for jar in jars),
                 "CoAP 探针源码或本机 Maven 依赖缺失")
    base.require((certs / "device.crt").is_file() and (certs / "device.key").is_file(),
                 "隔离栈设备 TLS 证书缺失")
    with tempfile.TemporaryDirectory(prefix="v5e-coap-claim-") as temporary:
        work = Path(temporary)
        libs = work / "lib"
        libs.mkdir()
        for jar in jars:
            shutil.copy2(jar, libs / jar.name)
        compiled = subprocess.run(["javac", "-cp", str(libs / "*"), "-d", str(work),
                                   str(source)], capture_output=True, text=True, check=False,
                                  timeout=45)
        base.require(compiled.returncode == 0, "CoAP 不回复重领助手编译失败")
        command = ["docker", "run", "--rm", "-i", "--network", f"container:{app}",
                   "-v", f"{work}:/work:ro", "-v", f"{certs}:/certs:ro",
                   "eclipse-temurin:21-jre", "java", "-cp", "/work:/work/lib/*",
                   "SmokeCoapClaim", "/certs", command_id, "3", "11000", "10"]
        result = subprocess.run(command, input="\n".join((pkey, device["key"],
                                 device["secret"])) + "\n", capture_output=True,
                                text=True, check=False, timeout=90)
    base.require(result.returncode == 0, "CoAP/DTLS 不回复重领失败")
    base.require(re.findall(r"attempt=([123])", result.stdout) == ["1", "2", "3"],
                 "CoAP/DTLS 三次领取尝试号不符")


def facts(pg, pid, command_id):
    pid, command_id = base.checked_uuid(pid), base.checked_uuid(command_id)
    sql = (f"SET app.project_id='{pid}'; SELECT c.status, c.attempt_count, c.max_attempts, "
           "coalesce(c.failure_code,''), "
           "(SELECT count(*) FROM ts_device_command_claim x WHERE x.command_id=c.id), "
           "(SELECT coalesce(string_agg(x.attempt_no::text,',' ORDER BY x.attempt_no),'') "
           "FROM ts_device_command_claim x WHERE x.command_id=c.id), "
           "(SELECT count(*) FROM ts_device_command_attempt x WHERE x.command_id=c.id) "
           f"FROM ts_device_command c WHERE c.project_id='{pid}' AND c.id='{command_id}'")
    row = base.db(pg, sql).split("|")
    base.require(len(row) == 7, "逻辑命令事实缺失")
    return row


def wait_timeout(pg, pid, command_id):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        row = facts(pg, pid, command_id)
        if row[0] == "TIMED_OUT":
            base.require(row == ["TIMED_OUT", "3", "3", "RESPONSE_TIMEOUT", "3", "1,2,3", "0"],
                         "命令终态、领取事实或零推送尝试不符")
            return
        time.sleep(2)
    raise base.ProbeError("三次领取后未有界进入 TIMED_OUT")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deploy-dir", required=True)
    parser.add_argument("--candidate-jar", required=True)
    parser.add_argument("--candidate-sha256", required=True)
    parser.add_argument("--admin-port", type=int, default=18080)
    parser.add_argument("--device-port", type=int, default=18443)
    parser.add_argument("--maven-repo", default=str(Path.home() / ".m2/repository"))
    args = parser.parse_args()
    base.ADMIN = f"http://127.0.0.1:{args.admin_port}"
    base.DEVICE = f"https://127.0.0.1:{args.device_port}"
    deploy = Path(args.deploy_dir).expanduser().resolve()
    jar = Path(args.candidate_jar).expanduser().resolve()
    app, pg, limits = base.preflight(deploy, jar, args.candidate_sha256)
    base.require(limits["DOWNLINK_MESSAGE"] >= 10, "须使用下行高容量基线")
    day = datetime.now(timezone.utc).date().isoformat()
    api = base.Api()
    pid, pkey, tenant, devices = setup(api, pg, secrets.token_hex(5))
    http_id = submit(api, pid, devices["HTTP"]["id"], "HTTP")
    http_claim(pkey, devices["HTTP"], http_id)
    wait_timeout(pg, pid, http_id)
    coap_id = submit(api, pid, devices["COAP"]["id"], "COAP")
    coap_claim(app, pkey, devices["COAP"], coap_id, args.maven_repo,
               deploy / "config/certs.local")
    wait_timeout(pg, pid, coap_id)
    same_day(day)
    source = base.wait_counters(pg, tenant, (pid,), (day,))[(pid, day)]
    base.require(source["DOWNLINK_MESSAGE"] == 2, "三次领取重复计为逻辑下行")
    projection = base.quota(api, pid, limits, source, source, day)
    base.preflight(deploy, jar, args.candidate_sha256, limits)
    print(json.dumps({"result": "PASS", "candidateSha256": args.candidate_sha256,
                      "utcDay": day, "tenant": tenant, "project": pid,
                      "httpCommand": http_id, "coapCommand": coap_id,
                      "claimAttempts": [3, 3], "logicalDownlinkUsed": 2,
                      "pushAttemptRows": [0, 0], "statuses": projection,
                      "unverified": ["Windows host UDP", "actual UTC midnight crossing"]},
                     sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (base.ProbeError, KeyError, IndexError, TypeError, ValueError,
            OSError, subprocess.TimeoutExpired) as error:
        message = str(error) if isinstance(error, base.ProbeError) else "探针输入或外部依赖失败"
        print("V5e claim FAIL: " + message, file=sys.stderr)
        sys.exit(1)

"""V4c fixed-candidate SMTP/TLS and external mailbox acceptance probe.

Run only on a disposable independent jagonzn stack. ``prepare`` creates a
fixture before the real SMTP overlay is installed; ``send`` triggers one alarm
after the overlay is active; ``receive`` checks the external POP3S mailbox.
The private state file must live outside the repository and is mode 0600.
This script never configures SMTP or sends mail directly.
"""

import argparse
import contextlib
import email
import email.header
import email.utils
import importlib.util
import json
import os
import poplib
import re
import secrets
import ssl
import sys
import time
from pathlib import Path


HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("v5b2_base", HERE / "smoke-noncommercial-daily-v5b2.py")
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


def require(ok, reason):
    base.require(ok, reason)


def config(path):
    path = path.expanduser().resolve()
    require(path.is_file() and not path.is_relative_to(HERE.parents[2]),
            "SMTP 配置必须是仓库外的本地文件")
    fields = {}
    pattern = re.compile(r"^\s*(邮箱|SMTP服务器|POP3服务器|授权密码)\s*[:：]\s*(.*?)\s*$")
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        match = pattern.match(line)
        if match:
            key, value = match.groups()
            require(key not in fields and bool(value), "SMTP 配置字段重复或为空")
            fields[key] = value
    require(set(fields) == {"邮箱", "SMTP服务器", "POP3服务器", "授权密码"},
            "SMTP 配置缺少必需字段")
    require(bool(re.fullmatch(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9][A-Za-z0-9.\-]*",
                              fields["邮箱"])),
            "邮箱字段格式无效")
    for key in ("SMTP服务器", "POP3服务器"):
        require(bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{0,252}", fields[key]))
                and ".." not in fields[key], "邮件服务器字段格式无效")
    return fields


def save(path, state, *, exclusive=False):
    require(path.is_absolute() and not path.is_relative_to(HERE.parents[2])
            and not path.is_symlink(),
            "状态文件必须放在仓库外")
    path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | (os.O_EXCL if exclusive else os.O_TRUNC)
    fd = os.open(path, flags, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        json.dump(state, output, ensure_ascii=False, sort_keys=True)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())


def load(path):
    require(path.is_file() and not path.is_symlink() and path.stat().st_mode & 0o077 == 0,
            "状态文件不存在或权限不是 0600")
    state = json.loads(path.read_text(encoding="utf-8"))
    require(state.get("schema") == 1 and state.get("phase") in
            ("prepared", "triggering", "sent", "received"), "状态文件格式无效")
    return state


def identity(args, state=None):
    deploy = Path(args.deploy_dir).expanduser().resolve()
    jar = Path(args.candidate_jar).expanduser().resolve()
    require(not deploy.is_relative_to(HERE.parents[2])
            and (deploy / "compose.yml").is_file()
            and (deploy / ".env.local").is_file(), "须使用源码外独立部署目录")
    require(base.SHA.fullmatch(args.candidate_sha256) and jar.is_file()
            and base.sha256(jar) == args.candidate_sha256,
            "宿主固定候选 JAR 摘要不符")
    app = base.compose(deploy, "--profile", "app", "ps", "-q", "app")
    pg = base.compose(deploy, "ps", "-q", "postgres")
    require(app and pg, "独立 app 或 PostgreSQL 容器未运行")
    actual = base.command("docker", "exec", app, "sha256sum", "/app/jagonzn-service.jar")
    require(actual.split() and actual.split()[0] == args.candidate_sha256,
            "运行 JAR 摘要不符")
    inspected = json.loads(base.command("docker", "inspect", app, pg))
    require(len(inspected) == 2 and all(item["State"]["Running"] for item in inspected),
            "独立 app 或 PostgreSQL 容器未运行")
    if state is not None:
        require(state["deploy"] == str(deploy) and state["jar"] == str(jar)
                and state["sha256"] == args.candidate_sha256,
                "状态文件与当前固定候选不一致")
    return deploy, jar, pg


def app_environment(deploy):
    app = base.compose(deploy, "--profile", "app", "ps", "-q", "app")
    inspected = json.loads(base.command("docker", "inspect", app))
    require(len(inspected) == 1, "无法核对应用容器")
    return dict(entry.partition("=")[::2] for entry in inspected[0]["Config"]["Env"]
                if "=" in entry)


@contextlib.contextmanager
def pop3(mail):
    client = poplib.POP3_SSL(mail["POP3服务器"], 995, timeout=20,
                            context=ssl.create_default_context())
    try:
        client.user(mail["邮箱"])
        client.pass_(mail["授权密码"])
        yield client
    finally:
        try:
            client.quit()
        except (OSError, poplib.error_proto):
            pass


def uidls(client):
    _, rows, _ = client.uidl()
    result = {}
    for row in rows:
        number, uid = row.split(maxsplit=1)
        require(number.isdigit() and uid and uid not in result.values(),
                "POP3 UIDL 列表无效")
        result[int(number)] = uid.decode("ascii")
    return result


def fixture(api, pid, did, mailbox, subject, marker):
    group = api.call("POST", f"/api/v1/projects/{pid}/alarm-notification-groups", {
        "name": subject, "enabled": True}, 201)
    gid = base.checked_uuid(group["id"])
    api.call("POST", f"/api/v1/projects/{pid}/alarm-notification-groups/{gid}/recipients", {
        "channel": "EMAIL", "target": mailbox, "enabled": True}, 201)
    template = api.call("POST", f"/api/v1/projects/{pid}/alarm-notification-templates", {
        "name": subject, "channel": "EMAIL", "subjectTemplate": subject,
        "bodyTemplate": marker, "enabled": True}, 201)
    rule = api.call("POST", f"/api/v1/projects/{pid}/alarm-rules", {
        "name": subject, "alarmType": "REUSE_V4C", "deviceId": did,
        "propertyKey": "temperature", "triggerOperator": "GT", "triggerThreshold": 20,
        "triggerDurationSeconds": 0, "clearOperator": "LT", "clearThreshold": 10,
        "clearDurationSeconds": 0, "severity": "WARNING", "enabled": True}, 201)
    api.call("POST", f"/api/v1/projects/{pid}/alarm-rules/{base.checked_uuid(rule['id'])}/notification-bindings", {
        "groupId": gid, "templateId": base.checked_uuid(template["id"]),
        "channel": "EMAIL", "enabled": True}, 201)


def delivery(pg, pid, mid, mailbox, subject):
    pid, mid = base.checked_uuid(pid), base.checked_uuid(mid)
    rows = base.db(pg, f"SET app.project_id='{pid}'; SELECT d.id, d.status, d.attempt_count, "
                   "d.target_snapshot, d.subject_snapshot "
                   "FROM alarm_notification_delivery d JOIN alarm_event e "
                   "ON e.project_id=d.project_id AND e.id=d.alarm_event_id "
                   f"WHERE d.project_id='{pid}' AND e.source_message_id='{mid}' "
                   "AND d.channel='EMAIL'").splitlines()
    require(len(rows) <= 1, "同一来源出现重复邮件投递意图")
    if not rows:
        return None
    fields = rows[0].split("|")
    require(len(fields) == 5 and re.fullmatch(r"[0-9]+", fields[2])
            and fields[3].casefold() == mailbox.casefold() and fields[4] == subject,
            "投递事实格式无效")
    return base.checked_uuid(fields[0]), fields[1], int(fields[2])


def prepare(args, mail):
    require(not args.state_file.exists(), "状态文件已存在；拒绝覆盖旧夹具")
    deploy, jar, pg = identity(args)
    env = app_environment(deploy)
    require(not env.get("JAGONZN_MAIL_SMTP_HOST") and "spring.mail.host" not in
            env.get("SPRING_APPLICATION_JSON", ""), "prepare 前应用已经启用 SMTP")
    suffix = secrets.token_hex(6)
    api = base.Api()
    _, pid, pkey, tenant = base.setup(api, pg, suffix)
    did, key, secret = base.device_fixture(api, pid, suffix)
    subject = f"reuse-v4c-{suffix}"
    marker = f"V4c external mailbox marker {suffix}"
    fixture(api, pid, did, mail["邮箱"], subject, marker)
    # The baseline is captured before the application can send. Only UIDLs
    # absent from this list can qualify as a V4c receipt.
    with pop3(mail) as mailbox:
        baseline = sorted(uidls(mailbox).values())
    state = {"schema": 1, "phase": "prepared", "deploy": str(deploy), "jar": str(jar),
             "sha256": args.candidate_sha256, "project": pid, "projectKey": pkey,
             "tenant": tenant, "device": did, "deviceKey": key, "deviceSecret": secret,
             "mailbox": mail["邮箱"], "subject": subject, "marker": marker,
             "baselineUidls": baseline}
    save(args.state_file, state, exclusive=True)
    print(json.dumps({"phase": "PREPARED", "candidateSha256": args.candidate_sha256,
                      "project": pid, "device": did, "subject": subject}, sort_keys=True))


def send(args, mail):
    state = load(args.state_file)
    require(state["phase"] in ("prepared", "triggering", "sent"),
            "邮件已经核对完成")
    require(state["mailbox"] == mail["邮箱"], "收件邮箱与夹具不一致")
    deploy, _, pg = identity(args, state)
    env = app_environment(deploy)
    require(env.get("JAGONZN_MAIL_SMTP_HOST") == mail["SMTP服务器"]
            and env.get("JAGONZN_MAIL_SMTP_USERNAME") == mail["邮箱"]
            and env.get("JAGONZN_MAIL_SMTP_PASSWORD") == mail["授权密码"]
            and env.get("JAGONZN_MAIL_SMTP_PORT") == "465",
            "运行应用未加载预期 SMTP 主机、465 端口或凭据")
    try:
        mail_properties = json.loads(env.get("SPRING_APPLICATION_JSON", "{}"))["spring"]["mail"]["properties"]
    except (ValueError, KeyError, TypeError):
        raise base.ProbeError("应用缺少 SMTP TLS 属性") from None
    require(str(mail_properties.get("mail.smtp.ssl.enable")).lower() == "true"
            and str(mail_properties.get("mail.smtp.auth")).lower() == "true"
            and str(mail_properties.get("mail.smtp.ssl.checkserveridentity")).lower() == "true",
            "应用 SMTP TLS、服务器身份校验或认证未启用")
    if state["phase"] == "prepared":
        state["messageId"] = base.uuid7()
        state["phase"] = "triggering"
        save(args.state_file, state)
    if state["phase"] == "triggering":
        base.report(state["projectKey"], state["deviceKey"], state["deviceSecret"],
                    state["messageId"])
    deadline = time.monotonic() + args.timeout
    row = None
    while time.monotonic() < deadline:
        row = delivery(pg, state["project"], state["messageId"],
                       state["mailbox"], state["subject"])
        if row and row[1] == "SUCCEEDED" and row[2] >= 1:
            break
        if row and row[1] == "DEAD_LETTER":
            raise base.ProbeError("平台邮件投递进入死信")
        time.sleep(2)
    require(row and row[1] == "SUCCEEDED" and row[2] >= 1,
            "平台邮件投递未在期限内成功")
    state["deliveryId"] = row[0]
    state["attemptCount"] = row[2]
    state["phase"] = "sent"
    save(args.state_file, state)
    print(json.dumps({"phase": "SENT", "candidateSha256": args.candidate_sha256,
                      "project": state["project"], "messageId": state["messageId"],
                      "deliveryId": row[0], "attemptCount": row[2]}, sort_keys=True))


def decoded(value):
    parts = email.header.decode_header(value or "")
    return "".join(chunk.decode(charset or "utf-8", errors="replace")
                   if isinstance(chunk, bytes) else chunk for chunk, charset in parts)


def body_text(message):
    pieces = []
    for part in message.walk():
        if part.get_content_maintype() == "multipart":
            continue
        if part.get_content_type() not in ("text/plain", "text/html"):
            continue
        raw = part.get_payload(decode=True) or b""
        pieces.append(raw.decode(part.get_content_charset() or "utf-8", errors="replace"))
    return "\n".join(pieces)


def receive(args, mail):
    state = load(args.state_file)
    require(state["phase"] in ("sent", "received") and state["mailbox"] == mail["邮箱"],
            "须先完成平台投递或收件箱夹具不符")
    _, _, pg = identity(args, state)
    row = delivery(pg, state["project"], state["messageId"],
                   state["mailbox"], state["subject"])
    require(row and row[0] == state["deliveryId"] and row[1] == "SUCCEEDED",
            "平台投递事实不再为已成功")
    deadline = time.monotonic() + args.timeout
    matches = []
    baseline = set(state["baselineUidls"])
    while time.monotonic() < deadline:
        # POP3S defaults to TLS on port 995. RETR does not mark/delete mail on
        # the server; QUIT only closes this session. Never issue DELE.
        with pop3(mail) as pop:
            newer = [(number, uid) for number, uid in uidls(pop).items()
                     if uid not in baseline]
            require(len(newer) <= args.scan_limit,
                    "新增邮件超过扫描上限，无法可靠定位唯一回执")
            matches = []
            for number, _ in newer:
                _, lines, _ = pop.retr(number)
                require(sum(map(len, lines)) <= 2_000_000, "邮箱单封邮件超出探针上限")
                message = email.message_from_bytes(b"\r\n".join(lines))
                if decoded(message.get("Subject")) != state["subject"]:
                    continue
                recipients = [address.casefold() for _, address in
                              email.utils.getaddresses(message.get_all("To", []))]
                require(state["mailbox"].casefold() in recipients,
                        "唯一主题邮件收件人不符")
                require(state["marker"] in body_text(message), "唯一主题邮件正文标记不符")
                matches.append(number)
        if len(matches) == 1:
            break
        require(len(matches) == 0, "邮箱出现重复的唯一主题邮件")
        time.sleep(5)
    require(len(matches) == 1, "真实邮箱未在期限内收到唯一主题邮件")
    state["phase"] = "received"
    save(args.state_file, state)
    print(json.dumps({"phase": "RECEIVED", "candidateSha256": args.candidate_sha256,
                      "project": state["project"], "deliveryId": state["deliveryId"],
                      "subject": state["subject"], "matches": len(matches)}, sort_keys=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("phase", choices=("prepare", "send", "receive"))
    parser.add_argument("--deploy-dir", required=True)
    parser.add_argument("--candidate-jar", required=True)
    parser.add_argument("--candidate-sha256", required=True)
    parser.add_argument("--smtp-config", type=Path, required=True)
    parser.add_argument("--state-file", type=Path, required=True)
    parser.add_argument("--admin-port", type=int, default=18080)
    parser.add_argument("--device-port", type=int, default=18443)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--scan-limit", type=int, default=500)
    args = parser.parse_args()
    require(1 <= args.admin_port <= 65535 and 1 <= args.device_port <= 65535
            and 1 <= args.timeout <= 600 and 1 <= args.scan_limit <= 5000,
            "端口、超时或扫描条数无效")
    args.state_file = args.state_file.expanduser().absolute()
    base.ADMIN = f"http://127.0.0.1:{args.admin_port}"
    base.DEVICE = f"https://127.0.0.1:{args.device_port}/device-access/v1/property/report"
    mail = config(args.smtp_config)
    {"prepare": prepare, "send": send, "receive": receive}[args.phase](args, mail)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Provider exceptions can contain private server replies or account
        # data. Do not print their text or a traceback.
        if isinstance(error, base.ProbeError):
            print(f"V4c FAIL: {error}", file=sys.stderr)
        else:
            print("V4c FAIL: 外部邮箱或本地状态校验失败；详情未输出以保护凭据", file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""Verify the isolated owner's email through the internal SMTP sink and create one project."""

from __future__ import annotations

from email import policy
from email.parser import BytesParser
import json
from pathlib import Path
import re
import ssl
import stat
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


ROOT = Path(__file__).resolve().parent
STATE = ROOT / "owner.local.json"
MAIL = ROOT / "logs" / "smtp"
CERT = ROOT / "certs.local" / "lan.crt"
BASE = "https://127.0.0.1:18444"
POSTGRES = "jagonzn-lan-acceptance-postgres-1"
PROJECT_NAME = "jagonzn-lan-acceptance"


def owner() -> dict[str, str]:
    if STATE.is_symlink() or not STATE.is_file() \
            or stat.S_IMODE(STATE.stat().st_mode) != 0o600:
        raise RuntimeError("Owner credentials must be an existing 0600 regular file")
    value = json.loads(STATE.read_text(encoding="utf-8"))
    if value.get("project") != PROJECT_NAME \
            or not re.fullmatch(r"shc-lan-owner-[0-9a-f]{32}@example\.invalid", value.get("email", "")) \
            or not value.get("password"):
        raise RuntimeError("Owner record does not match the isolated project")
    return value


def account_fact(email: str) -> tuple[uuid.UUID, uuid.UUID, bool]:
    query = (
        "SELECT a.id::text || '|' || m.tenant_id::text || '|' || "
        "(a.email_verified_at IS NOT NULL)::text "
        "FROM public.sys_account a JOIN public.sys_tenant_member m ON m.account_id=a.id "
        f"WHERE a.email='{email}'"
    )
    result = subprocess.run(
        ["docker", "exec", POSTGRES, "psql", "-U", "jagonzn", "-d", "jagonzn",
         "-At", "-c", query],
        check=True, capture_output=True, text=True, timeout=15)
    rows = result.stdout.strip().splitlines()
    if len(rows) != 1:
        raise RuntimeError("Expected exactly one owner account membership")
    account, tenant, verified = rows[0].split("|")
    return uuid.UUID(account), uuid.UUID(tenant), verified == "true"


def project_fact(project_id: uuid.UUID) -> tuple[uuid.UUID, str]:
    result = subprocess.run(
        ["docker", "exec", POSTGRES, "psql", "-U", "jagonzn", "-d", "jagonzn",
         "-At", "-c", "SELECT tenant_id::text || '|' || status FROM public.sys_project "
         f"WHERE id='{project_id}'"],
        check=True, capture_output=True, text=True, timeout=15)
    rows = result.stdout.strip().splitlines()
    if len(rows) != 1:
        raise RuntimeError("Expected one durable project")
    tenant, status = rows[0].split("|")
    return uuid.UUID(tenant), status


def request(path: str, data: dict[str, str] | None = None,
            token: str | None = None) -> tuple[int, bytes]:
    payload = None if data is None else json.dumps(data).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["Authorization"] = "Bearer " + token
    http_request = urllib.request.Request(BASE + path, payload, headers,
                                          method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(http_request,
                                    context=ssl.create_default_context(cafile=str(CERT)),
                                    timeout=20) as response:
            return response.status, response.read(65536)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{path} returned HTTP {error.code}") from error


def token_from_mail(email: str, known: set[Path]) -> str:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        for path in sorted(MAIL.glob("message-*.eml")):
            if path in known or path.is_symlink():
                continue
            path.chmod(0o600)
            message = BytesParser(policy=policy.default).parsebytes(path.read_bytes())
            if email not in str(message.get("To", "")):
                continue
            body = message.get_body(preferencelist=("plain", "html"))
            content = body.get_content() if body else message.get_content()
            match = re.search(r"https?://[^\s<>]+/auth/verify-email\?token=([^\s<>&]+)", content)
            if match:
                return urllib.parse.unquote(match.group(1))
        time.sleep(0.5)
    raise RuntimeError("No matching verification mail captured within 30 seconds")


def main() -> None:
    identity = owner()
    account, tenant, verified = account_fact(identity["email"])
    if not verified:
        known = set(MAIL.glob("message-*.eml"))
        status, _ = request("/api/v1/auth/email/resend", {"email": identity["email"]})
        if status != 204:
            raise RuntimeError(f"Verification resend returned {status}")
        secret = token_from_mail(identity["email"], known)
        status, _ = request("/api/v1/auth/email/verify", {"token": secret})
        if status != 200:
            raise RuntimeError(f"Email verification returned {status}")
        account_again, tenant_again, verified = account_fact(identity["email"])
        if (account_again, tenant_again) != (account, tenant) or not verified:
            raise RuntimeError("Email verification did not preserve the owner identity")
    status, response = request("/api/v1/auth/login", {
        "email": identity["email"], "password": identity["password"]})
    if status != 200:
        raise RuntimeError(f"Owner login returned {status}")
    bearer = json.loads(response)["accessToken"]
    status, response = request("/api/v1/projects", token=bearer)
    if status != 200:
        raise RuntimeError(f"Project listing returned {status}")
    matching = [project for project in json.loads(response)
                if project["name"] == PROJECT_NAME and project["myRole"] == "OWNER"]
    if len(matching) > 1:
        raise RuntimeError("More than one matching isolated project")
    if matching:
        project = matching[0]
    else:
        status, response = request("/api/v1/projects", {
            "name": PROJECT_NAME, "region": "sh-1"}, bearer)
        if status != 200:
            raise RuntimeError(f"Project creation returned {status}")
        project = json.loads(response)
    project_id = uuid.UUID(project["id"])
    recorded_tenant, recorded_status = project_fact(project_id)
    if recorded_tenant != tenant or recorded_status != "ACTIVE":
        raise RuntimeError("Project belongs to an unexpected business tenant")
    print(f"ownerAccountId={account}")
    print(f"businessTenantId={tenant}")
    print(f"projectId={project_id}")
    print("emailVerified=true; project created through authenticated service API")
    print("Verification token, password and access token were not printed or committed.")


if __name__ == "__main__":
    main()

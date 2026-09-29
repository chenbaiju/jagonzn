#!/usr/bin/env python3
"""Create and retain one real business tenant through the isolated service registration API."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import urllib.error
import urllib.request
import uuid
import ssl


ROOT = Path(__file__).resolve().parent
STATE = ROOT / "owner.local.json"
CERTIFICATE = ROOT / "certs.local" / "lan.crt"
EMAIL = re.compile(r"shc-lan-owner-[0-9a-f]{32}@example\.invalid\Z")
POSTGRES = "jagonzn-lan-acceptance-postgres-1"


def save_once(state: dict[str, str]) -> None:
    descriptor = os.open(STATE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(state, stream, sort_keys=True)
        stream.write("\n")


def lookup(email: str) -> tuple[str, str, str] | None:
    if not EMAIL.fullmatch(email):
        raise RuntimeError("Owner identity format is invalid")
    query = (
        "SELECT t.id::text || '|' || a.id::text || '|' || t.status "
        "FROM public.sys_account a "
        "JOIN public.sys_tenant_member m ON m.account_id=a.id "
        "JOIN public.sys_tenant t ON t.id=m.tenant_id "
        f"WHERE a.email='{email}'"
    )
    result = subprocess.run(
        ["docker", "exec", POSTGRES, "psql", "-U", "jagonzn", "-d", "jagonzn",
         "-At", "-c", query],
        check=True, capture_output=True, text=True, timeout=15)
    lines = result.stdout.strip().splitlines()
    if len(lines) > 1:
        raise RuntimeError("Owner has more than one tenant membership")
    if not lines:
        return None
    tenant, account, status = lines[0].split("|")
    uuid.UUID(tenant)
    uuid.UUID(account)
    if status != "ACTIVE":
        raise RuntimeError("Created tenant is not ACTIVE")
    return tenant, account, status


def main() -> None:
    os.umask(0o077)
    if STATE.is_symlink():
        raise RuntimeError("Refusing symbolic-link owner record")
    if STATE.exists():
        if not STATE.is_file() or stat.S_IMODE(STATE.stat().st_mode) != 0o600:
            raise RuntimeError("Existing owner record must be a 0600 regular file")
        state = json.loads(STATE.read_text(encoding="utf-8"))
    else:
        state = {
            "email": f"shc-lan-owner-{uuid.uuid4().hex}@example.invalid",
            "password": secrets.token_urlsafe(36),
            "project": "jagonzn-lan-acceptance",
        }
        save_once(state)
    if state.get("project") != "jagonzn-lan-acceptance" or not EMAIL.fullmatch(state["email"]):
        raise RuntimeError("Existing owner record is not for this isolated project")
    found = lookup(state["email"])
    if found is None:
        payload = json.dumps({
            "email": state["email"],
            "password": state["password"],
            "displayName": "jagonzn 内网首期验收",
        }, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            "https://127.0.0.1:18444/api/v1/auth/register",
            data=payload, headers={"Content-Type": "application/json"},
            method="POST")
        try:
            with urllib.request.urlopen(
                    request, context=ssl.create_default_context(cafile=str(CERTIFICATE)),
                    timeout=30) as response:
                if response.status != 204:
                    raise RuntimeError(f"Registration returned {response.status}")
        except urllib.error.HTTPError as error:
            if error.code != 409 or lookup(state["email"]) is None:
                raise RuntimeError(f"Registration failed with HTTP {error.code}") from error
        found = lookup(state["email"])
    if found is None:
        raise RuntimeError("Registration returned without a durable tenant")
    tenant, account, status = found
    print(f"businessTenantId={tenant}")
    print(f"ownerAccountId={account}")
    print(f"tenantStatus={status}")
    print("Owner credentials remain only in ignored 0600 owner.local.json.")


if __name__ == "__main__":
    main()

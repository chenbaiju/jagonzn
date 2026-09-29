#!/usr/bin/env python3
"""Prepare private two-project delivery credentials and a non-secret TLS truststore."""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import runpy
import secrets
import stat
import subprocess
import uuid


ROOT = Path(__file__).resolve().parent
OWNER_TOOLS = runpy.run_path(str(ROOT / "activate-owner.py"))
PROJECT_NAME = "jagonzn-lan-acceptance-secondary"


def write_once(path: Path, contents: str) -> None:
    if path.is_symlink():
        raise RuntimeError("Refusing symbolic-link delivery file")
    if path.exists():
        if stat.S_IMODE(path.stat().st_mode) != 0o600 or path.read_text() != contents:
            raise RuntimeError("Existing private delivery file differs; keep existing keys")
        return
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        stream.write(contents)


def project_ids(tenant: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    identity = OWNER_TOOLS["owner"]()
    _, actual_tenant, verified = OWNER_TOOLS["account_fact"](identity["email"])
    if actual_tenant != tenant or not verified:
        raise RuntimeError("Isolated owner tenant or verification differs")
    status, response = OWNER_TOOLS["request"]("/api/v1/auth/login", {
        "email": identity["email"], "password": identity["password"]})
    if status != 200:
        raise RuntimeError("Owner login failed")
    token = json.loads(response)["accessToken"]
    status, response = OWNER_TOOLS["request"]("/api/v1/projects", token=token)
    if status != 200:
        raise RuntimeError("Project listing failed")
    projects = json.loads(response)
    result = []
    for name in (identity["project"], PROJECT_NAME):
        matches = [value for value in projects if value["name"] == name
                   and value["myRole"] == "OWNER"]
        if len(matches) > 1:
            raise RuntimeError("Duplicate isolated project name")
        if matches:
            project = matches[0]
        else:
            status, response = OWNER_TOOLS["request"]("/api/v1/projects", {
                "name": name, "region": "sh-1"}, token)
            if status != 200:
                raise RuntimeError("Second project creation failed")
            project = json.loads(response)
        project_id = uuid.UUID(project["id"])
        actual_tenant, project_status = OWNER_TOOLS["project_fact"](project_id)
        if actual_tenant != tenant or project_status != "ACTIVE":
            raise RuntimeError("Isolated project ownership differs")
        result.append(project_id)
    if result[0] == result[1]:
        raise RuntimeError("Expected two distinct projects")
    return result[0], result[1]


def truststore() -> None:
    source = ROOT / "certs.local" / "lan.crt"
    target = ROOT / "certs.local" / "cloud-truststore.p12"
    if source.is_symlink() or not source.is_file() or target.is_symlink():
        raise RuntimeError("LAN certificate is missing or symbolic-linked")
    if target.exists():
        if stat.S_IMODE(target.stat().st_mode) != 0o600:
            raise RuntimeError("Existing truststore must be 0600")
        return
    subprocess.run(["keytool", "-importcert", "-noprompt", "-storetype", "PKCS12",
                    "-keystore", str(target), "-storepass", "changeit", "-alias", "lan-cloud",
                    "-file", str(source)], check=True, capture_output=True)
    os.chmod(target, 0o600)


def render(path: Path, deployment: uuid.UUID, tenant: uuid.UUID,
           projects: tuple[uuid.UUID, uuid.UUID], sender_key: str, sender_secret: str,
           receiver_key: str, receiver_secret: str, previous_key: str = "",
           previous_secret: str = "") -> None:
    values = {
        "LAN_SOURCE_DEPLOYMENT_ID": str(deployment),
        "LAN_BUSINESS_TENANT_ID": str(tenant),
        "LAN_PROJECT_IDS": ",".join(map(str, projects)),
        "LAN_SENDER_KEY_ID": sender_key,
        "LAN_SENDER_SECRET_BASE64": sender_secret,
        "LAN_RECEIVER_KEY_ID": receiver_key,
        "LAN_RECEIVER_SECRET_BASE64": receiver_secret,
        "LAN_PREVIOUS_KEY_ID": previous_key,
        "LAN_PREVIOUS_SECRET_BASE64": previous_secret,
    }
    write_once(path, "".join(f"{key}={value}\n" for key, value in values.items()))


def main() -> None:
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument("--deployment-id", required=True, type=uuid.UUID)
    parser.add_argument("--tenant-id", required=True, type=uuid.UUID)
    args = parser.parse_args()
    projects = project_ids(args.tenant_id)
    truststore()
    first = ROOT / ".env.delivery.local"
    if first.exists():
        if first.is_symlink() or stat.S_IMODE(first.stat().st_mode) != 0o600:
            raise RuntimeError("Existing private delivery environment must be 0600")
        values = dict(line.split("=", 1) for line in first.read_text().splitlines())
        if (values.get("LAN_SOURCE_DEPLOYMENT_ID") != str(args.deployment_id)
                or values.get("LAN_BUSINESS_TENANT_ID") != str(args.tenant_id)
                or values.get("LAN_PROJECT_IDS") != ",".join(map(str, projects))):
            raise RuntimeError("Existing private delivery identity differs")
        old_secret = values["LAN_SENDER_SECRET_BASE64"]
        new_secret = None
        rotated = ROOT / ".env.delivery-rotated.local"
        if rotated.exists():
            if rotated.is_symlink() or stat.S_IMODE(rotated.stat().st_mode) != 0o600:
                raise RuntimeError("Existing rotated environment must be a 0600 regular file")
            rotated_values = dict(line.split("=", 1) for line in rotated.read_text().splitlines())
            new_secret = rotated_values["LAN_SENDER_SECRET_BASE64"]
        else:
            new_secret = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
    else:
        old_secret = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
        new_secret = base64.b64encode(secrets.token_bytes(32)).decode("ascii")
    render(first, args.deployment_id, args.tenant_id, projects,
           "lan-v1", old_secret, "lan-v1", old_secret)
    render(ROOT / ".env.delivery-rotated.local", args.deployment_id, args.tenant_id,
           projects, "lan-v2", new_secret, "lan-v2", new_secret, "lan-v1", old_secret)
    render(ROOT / ".env.delivery-final.local", args.deployment_id, args.tenant_id,
           projects, "lan-v2", new_secret, "lan-v2", new_secret)
    print(f"businessTenantId={args.tenant_id}")
    print(f"sourceDeploymentId={args.deployment_id}")
    print("projectIds=" + ",".join(map(str, projects)))
    print("Private delivery configurations and truststore created without printing keys.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Create distinct ignored credentials and local TLS material for the LAN laboratory."""

from __future__ import annotations

import base64
import os
from pathlib import Path
import secrets
import stat
import subprocess


ROOT = Path(__file__).resolve().parent
DEPLOY = ROOT.parent
ENV_FILE = ROOT / ".env.local"
SECRET_NAMES = (
    "JAGONZN_DATABASE_OWNER_PASSWORD",
    "JAGONZN_DATABASE_APP_PASSWORD",
    "JAGONZN_REDIS_PASSWORD",
    "JAGONZN_MINIO_SECRET_KEY",
    "JAGONZN_MINIO_APP_SECRET_KEY",
    "JAGONZN_SECURITY_JWT_SECRET",
    "JAGONZN_SECURITY_APP_JWT_SECRET",
    "JAGONZN_SECURITY_BROKER_CALLBACK_SECRET",
    "JAGONZN_NOTIFICATION_WEBHOOK_SIGNING_SECRET",
    "JAGONZN_EMQX_COOKIE",
    "JAGONZN_EMQX_DASHBOARD_PASSWORD",
    "JAGONZN_EMQX_APP_COOKIE",
    "JAGONZN_EMQX_APP_DASHBOARD_PASSWORD",
    "JAGONZN_INGRESS_HANDOFF_PASSWORD",
    "JAGONZN_EMQX_API_KEY",
    "JAGONZN_EMQX_API_SECRET",
    "JAGONZN_EMQX_SESSION_API_KEY",
    "JAGONZN_EMQX_SESSION_API_SECRET",
    "JAGONZN_REALTIME_MQTT_API_KEY",
    "JAGONZN_REALTIME_MQTT_API_SECRET",
    "JAGONZN_REALTIME_MQTT_SESSION_API_KEY",
    "JAGONZN_REALTIME_MQTT_SESSION_API_SECRET",
    "JAGONZN_CLOUD_DATABASE_PASSWORD",
)
CAPACITY = {
    "JAGONZN_TECHNICAL_PROJECTS": "20",
    "JAGONZN_TECHNICAL_DEVICES": "1000",
    "JAGONZN_TECHNICAL_END_USERS": "1000",
    "JAGONZN_TECHNICAL_DASHBOARDS": "100",
    "JAGONZN_TECHNICAL_EXTERNAL_SEATS": "50",
    "JAGONZN_TECHNICAL_HISTORY_DAYS": "30",
    "JAGONZN_TECHNICAL_DAILY_UPLINK_MESSAGE": "100000",
    "JAGONZN_TECHNICAL_DAILY_DOWNLINK_MESSAGE": "100000",
    "JAGONZN_TECHNICAL_DAILY_UPLINK_BYTES": "100000000",
    "JAGONZN_TECHNICAL_DAILY_TIME_SERIES_POINT": "1000000",
    "JAGONZN_TECHNICAL_DAILY_REST_API_CALL": "100000",
    "JAGONZN_TECHNICAL_DAILY_NOTIFICATION_DELIVERY": "10000",
    "JAGONZN_TECHNICAL_DAILY_SCRIPT_EXECUTION": "10000",
    "JAGONZN_TECHNICAL_DAILY_AUTOMATION_EXECUTION": "10000",
    "JAGONZN_TECHNICAL_DAILY_SCRIPT_CPU_MILLIS": "1000000",
}
FLAGS = {
    "JAGONZN_ENTITLEMENT_MODE": "NONCOMMERCIAL",
    "JAGONZN_INGRESS_HANDOFF_ENABLED": "true",
    "JAGONZN_PUBLIC_API_KEY_ENABLED": "false",
    "JAGONZN_PUBLIC_WEBHOOK_ENABLED": "false",
    "JAGONZN_PUBLIC_REALTIME_ENABLED": "false",
    "JAGONZN_REALTIME_WS_ALLOWED_ORIGINS": "https://127.0.0.1:13006",
}


def private_dir(path: Path) -> None:
    if path.is_symlink():
        raise RuntimeError(f"Refusing symbolic-link directory: {path}")
    path.mkdir(mode=0o700, exist_ok=True)
    os.chmod(path, 0o700)


def create_once(path: Path, contents: str) -> None:
    if path.is_symlink():
        raise RuntimeError(f"Refusing symbolic-link file: {path}")
    if path.exists():
        if path.read_text(encoding="utf-8") != contents:
            raise RuntimeError(f"Existing local file differs; refusing overwrite: {path}")
        return
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        stream.write(contents)


def credentials() -> dict[str, str]:
    if ENV_FILE.is_symlink():
        raise RuntimeError("Refusing symbolic-link environment file")
    if ENV_FILE.exists():
        if not ENV_FILE.is_file() or stat.S_IMODE(ENV_FILE.stat().st_mode) != 0o600:
            raise RuntimeError("Existing LAN environment must be a 0600 regular file")
        values: dict[str, str] = {}
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#"):
                continue
            name, separator, value = line.partition("=")
            if not separator or name in values or not value:
                raise RuntimeError("Invalid existing LAN environment")
            values[name] = value
    else:
        values = {name: secrets.token_urlsafe(48) for name in SECRET_NAMES}
        values["JAGONZN_PUBLIC_WEBHOOK_SIGNING_KEY"] = base64.b64encode(
            secrets.token_bytes(32)).decode("ascii")
        values.update(CAPACITY)
        values.update(FLAGS)
        create_once(ENV_FILE, "# Independent local LAN laboratory; never commit.\n"
                    + "".join(f"{name}={value}\n" for name, value in values.items()))
    required = set(SECRET_NAMES) | set(CAPACITY) | set(FLAGS) | {
        "JAGONZN_PUBLIC_WEBHOOK_SIGNING_KEY"}
    if not required.issubset(values):
        raise RuntimeError("Existing LAN environment is incomplete")
    return values


def render_emqx(values: dict[str, str]) -> None:
    output = ROOT / "emqx.local"
    private_dir(output)
    for source, target in (
        (DEPLOY / "emqx" / "base.hocon.template", output / "device-base.hocon"),
        (DEPLOY / "emqx-app" / "base.hocon.template", output / "app-base.hocon"),
    ):
        rendered = source.read_text(encoding="utf-8").replace(
            "__JAGONZN_CALLBACK_BASE_URL__", "http://app:18080").replace(
            "__JAGONZN_BROKER_CALLBACK_SECRET__",
            values["JAGONZN_SECURITY_BROKER_CALLBACK_SECRET"])
        if "__JAGONZN_" in rendered:
            raise RuntimeError("Unreplaced EMQX template token")
        create_once(target, rendered)
    create_once(output / "device-api-keys.conf",
                f"{values['JAGONZN_EMQX_API_KEY']}:{values['JAGONZN_EMQX_API_SECRET']}:publisher:publish\n"
                f"{values['JAGONZN_EMQX_SESSION_API_KEY']}:{values['JAGONZN_EMQX_SESSION_API_SECRET']}:administrator:connections\n")
    create_once(output / "app-api-keys.conf",
                f"{values['JAGONZN_REALTIME_MQTT_API_KEY']}:{values['JAGONZN_REALTIME_MQTT_API_SECRET']}:publisher:publish\n"
                f"{values['JAGONZN_REALTIME_MQTT_SESSION_API_KEY']}:{values['JAGONZN_REALTIME_MQTT_SESSION_API_SECRET']}:administrator:connections\n")


def create_certificate() -> None:
    output = ROOT / "certs.local"
    private_dir(output)
    certificate, key = output / "lan.crt", output / "lan.key"
    if certificate.is_symlink() or key.is_symlink() or certificate.exists() != key.exists():
        raise RuntimeError("LAN certificate state is incomplete or symbolic-linked")
    if certificate.exists():
        return
    command = [
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", str(key), "-out", str(certificate),
        "-days", "30", "-subj", "/CN=localhost",
        "-addext", "subjectAltName=DNS:localhost,DNS:cloud-https,IP:127.0.0.1",
    ]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL,
                   stderr=subprocess.PIPE)
    os.chmod(key, 0o600)
    os.chmod(certificate, 0o600)


def compile_smtp_sink() -> None:
    output = ROOT / "bin.local"
    private_dir(output)
    source = DEPLOY / "tests" / "SmokeSmtpSink.java"
    subprocess.run(["javac", "--release", "21", "-d", str(output), str(source)],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def main() -> None:
    os.umask(0o077)
    values = credentials()
    render_emqx(values)
    create_certificate()
    compile_smtp_sink()
    private_dir(ROOT / "logs")
    private_dir(ROOT / "logs" / "service")
    private_dir(ROOT / "logs" / "cloud")
    private_dir(ROOT / "logs" / "smtp")
    print("Independent LAN credentials, EMQX configuration and local certificate are ready.")


if __name__ == "__main__":
    main()

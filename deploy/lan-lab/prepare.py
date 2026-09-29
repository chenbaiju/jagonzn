#!/usr/bin/env python3
"""生成仅供本机 cloud 无互联网实验的稳定凭据和短期测试证书。"""

from pathlib import Path
import base64
import os
import secrets
import subprocess
import uuid

ROOT = Path(__file__).resolve().parent
ENV = ROOT / ".env.local"
CERTS = ROOT / "certs.local"


def main():
    if ENV.exists():
        print("现有 .env.local 已保留；若证书丢失请先人工核对实验栈状态。")
    else:
        values = {
            "JAGONZN_CLOUD_DATABASE_PASSWORD": secrets.token_urlsafe(36),
            "JAGONZN_CLOUD_SERVICE_SOURCE_DEPLOYMENT_ID": str(uuid.uuid4()),
            "JAGONZN_CLOUD_SERVICE_TENANT_ID": str(uuid.uuid4()),
            "JAGONZN_CLOUD_SERVICE_PROJECT_ID": str(uuid.uuid4()),
            "JAGONZN_CLOUD_SERVICE_SECRET_BASE64": base64.b64encode(secrets.token_bytes(32)).decode(),
        }
        descriptor = os.open(ENV, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            for name, value in values.items():
                stream.write(f"{name}={value}\n")
        print("本机测试凭据已生成到 Git 忽略文件；未输出秘密。")

    CERTS.mkdir(mode=0o700, exist_ok=True)
    certificate = CERTS / "lan.crt"
    private_key = CERTS / "lan.key"
    if certificate.exists() != private_key.exists():
        raise SystemExit("证书与私钥不完整，拒绝覆盖；请人工核对。")
    if not certificate.exists():
        subprocess.run([
            "openssl", "req", "-x509", "-newkey", "rsa:3072", "-nodes",
            "-days", "7", "-subj", "/CN=localhost",
            "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
            "-keyout", str(private_key), "-out", str(certificate),
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        private_key.chmod(0o600)
        print("本机自签测试证书已生成；此证书不用于正式客户环境。")


if __name__ == "__main__":
    main()

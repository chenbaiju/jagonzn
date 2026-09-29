#!/usr/bin/env python3
"""只读审计本机全内网双后端实验栈；不签发授权或修改容器。"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import urllib.error
import urllib.request
import ssl
from pathlib import Path


def docker_json(*arguments: str) -> object:
    completed = subprocess.run(
        ["docker", *arguments], capture_output=True, text=True, check=True, timeout=10
    )
    return json.loads(completed.stdout)


def record(results: list[dict[str, str]], name: str, passed: bool, detail: str) -> None:
    results.append({"check": name, "status": "PASS" if passed else "FAIL", "detail": detail})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="jagonzn-service", help="隔离 Compose 项目名")
    parser.add_argument("--service-url", default="https://127.0.0.1:18443/device-access/health")
    parser.add_argument("--cleartext-management-url", default="http://127.0.0.1:18080/actuator/health")
    parser.add_argument("--service-ca", type=Path, required=True, help="仅包含公开证书的受信 CA 文件")
    parser.add_argument("--cloud-url", help="cloud 受控 HTTPS 健康入口")
    parser.add_argument("--cloud-ca", type=Path, help="cloud 入口受信 CA，默认沿用 service CA")
    parser.add_argument("--console-url", help="console 内网 HTTPS 入口")
    parser.add_argument("--console-ca", type=Path, help="console 入口受信 CA，默认沿用 service CA")
    parser.add_argument("--grant-file", type=Path, help="本次实验签名授权文件")
    arguments = parser.parse_args()
    results: list[dict[str, str]] = []

    try:
        inventory = subprocess.run(
            ["docker", "ps", "--filter", f"label=com.docker.compose.project={arguments.project}",
             "--format", '{{.Label "com.docker.compose.service"}} {{.Names}}'],
            capture_output=True, text=True, check=True, timeout=10
        ).stdout.splitlines()
    except (OSError, subprocess.SubprocessError) as error:
        record(results, "docker_inventory", False, type(error).__name__)
        inventory = []
    services = {}
    for line in inventory:
        if " " in line:
            label, name = line.split(" ", 1)
            services.setdefault(label, []).append(name)
    expected = {"app", "cloud", "console"}
    for service in sorted(expected):
        record(results, f"process_{service}", bool(services.get(service)),
               "Compose 进程存在" if services.get(service) else "Compose 进程缺席")

    network_name = arguments.project + "_jagonzn"
    try:
        network = docker_json("network", "inspect", network_name)[0]
        record(results, "internet_isolation", bool(network.get("Internal")),
               "Docker internal 网络" if network.get("Internal") else "当前网络允许默认出站；未证明无互联网")
        containers = network.get("Containers") or {}
        attached = {item.get("Name") for item in containers.values()}
        for service in sorted(expected):
            matching = services.get(service, [])
            record(results, f"route_{service}", bool(matching) and all(name in attached for name in matching),
                   "同一隔离网络" if matching and all(name in attached for name in matching)
                   else "未发现该进程在指定内网")
            for name in matching:
                container = docker_json("inspect", name)[0]
                networks = container.get("NetworkSettings", {}).get("Networks") or {}
                record(results, f"network_exclusive_{service}", set(networks) == {network_name},
                       "仅连接指定内网" if set(networks) == {network_name} else "存在其他网络连接")
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, IndexError) as error:
        record(results, "internet_isolation", False, f"无法读取隔离网络：{type(error).__name__}")

    if arguments.service_ca.is_file() and arguments.service_url.startswith("https://"):
        try:
            context = ssl.create_default_context(cafile=str(arguments.service_ca))
            request = urllib.request.Request(arguments.service_url, method="GET")
            try:
                with urllib.request.urlopen(request, context=context, timeout=5) as response:
                    status = response.status
            except urllib.error.HTTPError as error:
                status = error.code
            record(results, "service_https", status in (200, 401, 403, 404),
                   f"已验证 TLS 证书，HTTP {status}；仅说明入口与鉴权边界可达")
        except (OSError, ValueError, ssl.SSLError, urllib.error.URLError) as error:
            record(results, "service_https", False, type(error).__name__)
    else:
        record(results, "service_https", False, "缺少受信公开证书或 HTTPS 入口")

    try:
        request = urllib.request.Request(arguments.cleartext_management_url, method="GET")
        with urllib.request.urlopen(request, timeout=3) as response:
            status = response.status
        record(results, "management_tls_only", False, f"明文管理入口返回 HTTP {status}")
    except urllib.error.HTTPError as error:
        record(results, "management_tls_only", error.code in (403, 404),
               f"明文管理入口返回 HTTP {error.code}")
    except urllib.error.URLError:
        record(results, "management_tls_only", True, "明文管理入口不可达")

    for name, url, ca in (("cloud_https", arguments.cloud_url, arguments.cloud_ca or arguments.service_ca),
                          ("console_https", arguments.console_url, arguments.console_ca or arguments.service_ca)):
        if not url or not url.startswith("https://"):
            record(results, name, False, "未提供 HTTPS 入口")
            continue
        try:
            context = ssl.create_default_context(cafile=str(ca))
            with urllib.request.urlopen(url, context=context, timeout=5) as response:
                record(results, name, response.status == 200, f"已验证 TLS 证书，HTTP {response.status}")
        except (OSError, ValueError, ssl.SSLError, urllib.error.URLError) as error:
            record(results, name, False, type(error).__name__)

    if arguments.grant_file and arguments.grant_file.is_file() and not arguments.grant_file.is_symlink():
        if arguments.grant_file.stat().st_size > 262_144:
            record(results, "offline_grant_input", False, "授权文件超过本审计上限")
        else:
            with arguments.grant_file.open("rb") as source:
                digest = hashlib.sha256(source.read(262_145)).hexdigest()
            record(results, "offline_grant_input", True,
                   f"普通文件存在；sha256={digest}；未验证签发资格或导入")
    else:
        record(results, "offline_grant_input", False, "未提供签名授权文件")

    passed = all(item["status"] == "PASS" for item in results)
    print(json.dumps({"schemaVersion": 1, "project": arguments.project,
                      "readiness": "PASS" if passed else "BLOCKED", "checks": results},
                     ensure_ascii=False, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())

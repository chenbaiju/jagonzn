#!/usr/bin/env python3
"""只读检查静态 Console 的隔离路由、回环发布和受信 HTTPS；不验业务授权。"""
from __future__ import annotations

import argparse
import hashlib
import json
import socket
import ssl
import subprocess
import sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import ProxyHandler, HTTPSHandler, build_opener


def docker(*arguments: str) -> str:
    return subprocess.run(["docker", *arguments], capture_output=True, text=True,
                          check=True, timeout=15).stdout


class Assets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attributes):
        values = dict(attributes)
        target = values.get("src") if tag == "script" else values.get("href") if tag == "link" else None
        if target:
            self.paths.append(target)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="jagonzn-lan-acceptance")
    parser.add_argument("--url", required=True)
    parser.add_argument("--ca", type=Path, required=True)
    parser.add_argument("--dist", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--expect-backends-stopped", action="store_true",
                        help="两后端已停止时，检查静态入口仍可访问；不会启停容器")
    arguments = parser.parse_args()
    results = []

    def check(name, operation):
        try:
            detail = operation()
            results.append({"check": name, "status": "PASS", "detail": detail})
        except Exception as error:
            results.append({"check": name, "status": "FAIL", "detail": str(error)})

    def require(condition, detail):
        if not condition:
            raise AssertionError(detail)
        return detail

    def container(service):
        ids = docker("ps", "--filter", f"label=com.docker.compose.project={arguments.project}",
                     "--filter", f"label=com.docker.compose.service={service}", "-q").split()
        require(len(ids) == 1, f"{service} 需要恰好一个运行容器")
        return json.loads(docker("inspect", ids[0]))[0]

    # 输出只读筛选结果，避免把 inspect 的环境凭据写入公开证据。
    console = container("console")
    proxy = container("console-test-https")
    network = arguments.project + "_jagonzn"
    ingress = arguments.project + "_host-ingress"

    def no_default_route(item):
        rows = docker("exec", item["Id"], "cat", "/proc/net/route").splitlines()[1:]
        require(not any(row.split()[1] == "00000000" for row in rows if row.split()),
                "发现默认 IPv4 路由")
        ipv6 = docker("exec", item["Id"], "cat", "/proc/net/ipv6_route").splitlines()
        require(not any(row.split()[0] == "0" * 32 and row.split()[1] == "00"
                        and int(row.split()[8], 16) & 1 and not int(row.split()[8], 16) & 0x200
                        for row in ipv6 if row.split()), "发现可用默认 IPv6 路由")
        return "IPv4/IPv6 无可用默认出站路由"

    check("console_internal_network_only", lambda: require(
        set(console["NetworkSettings"]["Networks"]) == {network}
        and json.loads(docker("network", "inspect", network))[0]["Internal"], "Console 仅接入 internal 网络"))
    check("console_no_default_route", lambda: no_default_route(console))
    check("console_no_published_ports", lambda: require(not console["HostConfig"]["PortBindings"], "静态容器不发布宿主端口"))
    check("proxy_networks", lambda: require(set(proxy["NetworkSettings"]["Networks"]) == {network, ingress}, "代理仅接入实验内网与受控入口网络"))
    check("proxy_no_default_route", lambda: no_default_route(proxy))
    check("proxy_loopback_only", lambda: require(
        proxy["HostConfig"]["PortBindings"] and all(binding["HostIp"] == "127.0.0.1"
        for bindings in proxy["HostConfig"]["PortBindings"].values() for binding in bindings), "HTTPS 只发布到 127.0.0.1"))

    def project_ports():
        ids = docker("ps", "--filter", f"label=com.docker.compose.project={arguments.project}", "-q").split()
        items = json.loads(docker("inspect", *ids))
        require(all(binding["HostIp"] == "127.0.0.1" for item in items
                    for bindings in (item["HostConfig"]["PortBindings"] or {}).values()
                    for binding in bindings), "项目存在非回环发布端口")
        return f"{len(items)} 个运行容器均无非回环发布端口"

    check("project_loopback_only", project_ports)
    context = ssl.create_default_context(cafile=str(arguments.ca))
    opener = build_opener(ProxyHandler({}), HTTPSHandler(context=context))

    def read(relative):
        with opener.open(urljoin(arguments.url, relative), timeout=8) as response:
            require(response.status == 200, "HTTP 非 200")
            return response.read(), response.headers.get_content_type()

    def html():
        content, mime = read("/")
        require(content == (arguments.dist / "index.html").read_bytes(), "首页字节与构建产物不同")
        require(mime == "text/html", "首页 MIME 不正确")
        return "受信 CA + 主机名校验成功；首页 HTTP 200 且字节一致"

    check("https_html_matches_candidate", html)

    def assets():
        collector = Assets()
        collector.feed((arguments.dist / "index.html").read_text(encoding="utf-8"))
        require(len(collector.paths) == 3, "预期 favicon、JS 和 CSS 三个静态资源")
        receipts = []
        for target in collector.paths:
            require(target.startswith("/") and not target.startswith("//"), "发现外部资源")
            candidate = (arguments.dist / target.lstrip("/")).resolve()
            require(candidate.is_relative_to(arguments.dist.resolve()), "资源越出构建目录")
            content, mime = read(target)
            require(content == candidate.read_bytes(), f"{target} 字节不同")
            expected = {".svg": "image/svg+xml", ".css": "text/css", ".js": "text/javascript"}[candidate.suffix]
            require(mime == expected or candidate.suffix == ".js" and mime == "application/javascript", f"{target} MIME 不正确")
            receipts.append({"path": target, "sha256": hashlib.sha256(content).hexdigest(), "mime": mime})
        return receipts

    check("https_assets_match_candidate", assets)
    endpoint = urlparse(arguments.url)

    def rejection(trust, server_name):
        try:
            with socket.create_connection((endpoint.hostname, endpoint.port or 443), timeout=5) as connection:
                with trust.wrap_socket(connection, server_hostname=server_name):
                    raise AssertionError("错误信任或主机名仍被接受")
        except ssl.SSLCertVerificationError:
            return "按预期拒绝 TLS 证书"

    check("unknown_ca_rejected", lambda: rejection(ssl.create_default_context(), endpoint.hostname))
    check("wrong_hostname_rejected", lambda: rejection(context, "console-name-mismatch.invalid"))

    def no_api():
        for target in ("/api/v1/projects", "/actuator/health"):
            try:
                read(target)
            except Exception as error:
                require(getattr(error, "code", None) == 404, "静态入口 API 路径没有返回 404")
            else:
                raise AssertionError("静态测试入口意外提供业务 API")
        return "两个 API 路径均为静态 404，没有业务代理"

    check("no_business_api_proxy", no_api)
    for service, port in (("app", 18080), ("cloud", 18081)):
        if arguments.expect_backends_stopped:
            def stopped(service=service):
                ids = docker("ps", "-a", "--filter", f"label=com.docker.compose.project={arguments.project}",
                             "--filter", f"label=com.docker.compose.service={service}", "-q").split()
                require(len(ids) == 1, "需要恰好一个后端容器")
                return require(not json.loads(docker("inspect", ids[0]))[0]["State"]["Running"], f"{service} 已停止")

            def unreachable(service=service, port=port):
                response = subprocess.run(["docker", "exec", console["Id"], "wget", "-q", "-T", "3", "-O", "-",
                                           f"http://{service}:{port}/actuator/health"], capture_output=True, timeout=8)
                require(response.returncode == 1, f"{service} 探针退出 {response.returncode}，预期 1；"
                        + response.stderr.decode("utf-8", errors="replace"))
                return f"{service} 健康入口按预期不可达，探针退出 1"

            check(f"{service}_stopped", stopped)
            check(f"{service}_unreachable", unreachable)
        else:
            check(f"console_route_to_{service}", lambda service=service, port=port: require(
                "UP" in docker("exec", console["Id"], "wget", "-q", "-T", "8", "-O", "-", f"http://{service}:{port}/actuator/health"),
                f"Console 容器可通过内网读取 {service} 健康状态；页面自身不调用该 API"))

    report = {"scope": "STATIC_CONSOLE_NETWORK_PREFLIGHT_ONLY", "checkedAt": datetime.now(timezone.utc).isoformat(),
              "expectBackendsStopped": arguments.expect_backends_stopped,
              "url": arguments.url, "caSha256": hashlib.sha256(arguments.ca.read_bytes()).hexdigest(),
              "consoleImageId": console["Image"], "proxyImageId": proxy["Image"], "checks": results}
    arguments.evidence.parent.mkdir(parents=True, exist_ok=True)
    arguments.evidence.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if all(item["status"] == "PASS" for item in results) else 1


if __name__ == "__main__":
    # Windows 重定向输出也保持 UTF-8；证据文件始终显式采用 UTF-8。
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())

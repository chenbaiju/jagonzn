#!/usr/bin/env python3
"""Test-only public HTTPS receiver for the V4a Webhook acceptance journey.

The sender needs a CA-trusted certificate for the actual public target. A
test-only tunnel may terminate that public TLS connection and forward to this
loopback TLS origin. It does not relax the sender's DNS, address, or TLS checks.
No request body or signing secret is written to the receipt directory or stdout.

Use ``self-test`` before ``serve``. Pass a fresh, private run directory and a
0600 file containing the one-time base64 signingSecret from subscription creation.
Use ``--resume`` with the same directory after a receiver restart so deliveryId
deduplication survives an uncertain HTTP response.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import ssl
import stat
import tempfile
import threading
import time
from unittest import mock
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


MAX_BODY = 262_144
MAX_SKEW_SECONDS = 300
SOCKET_TIMEOUT_SECONDS = 5
SIGNATURE_RE = re.compile(r"v1=[0-9a-f]{64}\Z")
KEY_ID_RE = re.compile(r"[A-Za-z0-9_-]{1,32}\Z")
HEADERS = (
    "X-ThingsCloud-Delivery-Id",
    "X-ThingsCloud-Timestamp",
    "X-ThingsCloud-Nonce",
    "X-ThingsCloud-Signature",
    "X-ThingsCloud-Key-Id",
)


def _private_file(path: Path) -> bytes:
    # O_NOFOLLOW closes the check/open race after lstat rejects a symlink.
    if stat.S_ISLNK(path.lstat().st_mode):
        raise ValueError("secret/key file must not be a symbolic link")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    with os.fdopen(os.open(path, flags), "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
            raise ValueError("secret/key file must be user-owned, regular and private (mode 0600)")
        return source.read()


def _private_directory(path: Path) -> None:
    try:
        info = path.lstat()
    except OSError as error:
        raise ValueError("receiver directory is missing") from error
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError("receiver directory must be a real user-owned directory with mode 0700")


def _write_new(path: Path, data: bytes) -> bool:
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags, 0o600)
    except FileExistsError:
        return False
    with os.fdopen(fd, "wb") as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    return True


def _sync_directory(path: Path) -> None:
    if hasattr(os, "O_DIRECTORY"):
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)


def _one_header(headers: object, name: str) -> str | None:
    if hasattr(headers, "get_all"):
        values = headers.get_all(name, [])  # type: ignore[attr-defined]
        return values[0] if len(values) == 1 else None
    value = headers.get(name)  # type: ignore[attr-defined]
    return value if isinstance(value, str) else None


class ReceiptStore:
    """Durable receiver effect: one body digest for each deliveryId."""

    def __init__(
        self,
        run_dir: Path,
        signing_key: bytes,
        key_id: str,
        *,
        resume: bool = False,
        first_response: int = 200,
    ) -> None:
        if len(signing_key) != 32 or not KEY_ID_RE.fullmatch(key_id):
            raise ValueError("expected a 32-byte subscription key and valid key ID")
        if first_response not in (200, 503):
            raise ValueError("first response must be 200 or 503")
        self.key = signing_key
        self.key_id = key_id
        self.first_response = first_response
        self.directory = run_dir
        self.deliveries = run_dir / "deliveries"
        self.nonces = run_dir / "nonces"
        self.journal = run_dir / "decisions.jsonl"
        self.lock = threading.Lock()
        if resume:
            for directory in (run_dir, self.deliveries, self.nonces):
                _private_directory(directory)
            metadata = json.loads((run_dir / "receiver.json").read_text("utf-8"))
            if metadata != {"schema": 1, "keyId": key_id, "firstResponse": first_response}:
                raise ValueError("receiver run metadata does not match")
        else:
            run_dir.mkdir(mode=0o700, parents=False, exist_ok=False)
            self.deliveries.mkdir(mode=0o700)
            self.nonces.mkdir(mode=0o700)
            for directory in (run_dir, self.deliveries, self.nonces):
                _private_directory(directory)
            metadata = {"schema": 1, "keyId": key_id, "firstResponse": first_response}
            _write_new(run_dir / "receiver.json", json.dumps(metadata, separators=(",", ":")).encode())
            _sync_directory(run_dir)

    def _record(self, delivery_id: str, digest: str, disposition: str, status: int) -> None:
        # The journal contains identifiers and hashes only, never secret or body.
        item = {
            "at": int(time.time()),
            "deliveryId": delivery_id,
            "bodySha256": digest,
            "disposition": disposition,
            "httpStatus": status,
        }
        fd = os.open(self.journal, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, "ab") as output:
            output.write(json.dumps(item, separators=(",", ":")).encode() + b"\n")
            output.flush()
            os.fsync(output.fileno())

    def accept(self, headers: object, body: bytes, *, now: int | None = None) -> int:
        values = {name: _one_header(headers, name) for name in HEADERS}
        if any(value is None for value in values.values()) or len(body) > MAX_BODY:
            return 400
        delivery_id = values["X-ThingsCloud-Delivery-Id"]
        timestamp = values["X-ThingsCloud-Timestamp"]
        nonce = values["X-ThingsCloud-Nonce"]
        signature = values["X-ThingsCloud-Signature"]
        if values["X-ThingsCloud-Key-Id"] != self.key_id:
            return 401
        try:
            if str(uuid.UUID(delivery_id)) != delivery_id or str(uuid.UUID(nonce)) != nonce:
                return 400
            seconds = int(timestamp)
            if str(seconds) != timestamp:
                return 400
        except (TypeError, ValueError):
            return 400
        if abs((int(time.time()) if now is None else now) - seconds) > MAX_SKEW_SECONDS:
            return 401
        if not SIGNATURE_RE.fullmatch(signature):
            return 401
        signed = (timestamp + "\n" + nonce + "\n" + delivery_id + "\n").encode() + body
        expected = "v1=" + hmac.new(self.key, signed, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            return 401
        try:
            document = json.loads(body)
            if not isinstance(document, dict) or document.get("deliveryId") != delivery_id or not isinstance(document.get("event"), dict):
                return 400
        except (UnicodeDecodeError, json.JSONDecodeError):
            return 400

        digest = hashlib.sha256(body).hexdigest()
        nonce_digest = hashlib.sha256(nonce.encode()).hexdigest()
        with self.lock:
            # A signed nonce may be seen once, including across receiver restarts.
            if not _write_new(self.nonces / nonce_digest, str(seconds).encode()):
                return 409
            _sync_directory(self.nonces)
            receipt = self.deliveries / delivery_id
            if _write_new(receipt, digest.encode()):
                _sync_directory(self.deliveries)
                self._record(delivery_id, digest, "FIRST", self.first_response)
                return self.first_response
            if receipt.read_text("ascii") != digest:
                self._record(delivery_id, digest, "BODY_CONFLICT", 409)
                return 409
            self._record(delivery_id, digest, "DUPLICATE", 200)
            return 200


class ReceiverServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, address: tuple[str, int], store: ReceiptStore, tls: ssl.SSLContext, path: str):
        self.store = store
        self.tls = tls
        self.route = path
        self.slots = threading.BoundedSemaphore(8)
        super().__init__(address, ReceiverHandler)

    def get_request(self):
        raw, address = self.socket.accept()
        raw.settimeout(SOCKET_TIMEOUT_SECONDS)
        try:
            secure = self.tls.wrap_socket(raw, server_side=True, do_handshake_on_connect=False)
            secure.settimeout(SOCKET_TIMEOUT_SECONDS)
            secure.do_handshake()
            return secure, address
        except Exception:
            raw.close()
            raise

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


class ReceiverHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server: ReceiverServer

    def setup(self):
        super().setup()
        self.connection.settimeout(SOCKET_TIMEOUT_SECONDS)

    def log_message(self, _format, *_args):
        # BaseHTTPRequestHandler otherwise logs target paths and request metadata.
        pass

    def _reply(self, status: int) -> None:
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def do_POST(self):
        if self.path != self.server.route or self.headers.get("Transfer-Encoding"):
            self._reply(404)
            return
        lengths = self.headers.get_all("Content-Length", [])
        if len(lengths) != 1 or not lengths[0].isdigit():
            self._reply(400)
            return
        length = int(lengths[0])
        if length > MAX_BODY:
            self._reply(413)
            return
        try:
            body = self.rfile.read(length)
            if len(body) != length:
                self._reply(400)
                return
            self._reply(self.server.store.accept(self.headers, body))
        except (TimeoutError, OSError):
            self.close_connection = True

    def do_GET(self):
        self._reply(405)


def _signed_headers(key: bytes, key_id: str, delivery_id: str, nonce: str, at: int, body: bytes) -> dict[str, str]:
    timestamp = str(at)
    payload = (timestamp + "\n" + nonce + "\n" + delivery_id + "\n").encode() + body
    return {
        "X-ThingsCloud-Delivery-Id": delivery_id,
        "X-ThingsCloud-Timestamp": timestamp,
        "X-ThingsCloud-Nonce": nonce,
        "X-ThingsCloud-Signature": "v1=" + hmac.new(key, payload, hashlib.sha256).hexdigest(),
        "X-ThingsCloud-Key-Id": key_id,
    }


def self_test() -> None:
    key = bytes(range(32))
    at = int(time.time())
    delivery_id = str(uuid.uuid4())
    body = json.dumps({"deliveryId": delivery_id, "event": {"marker": "private-body-marker"}}, separators=(",", ":")).encode()
    with tempfile.TemporaryDirectory(prefix="v4a-receiver-self-test-") as root:
        run = Path(root) / "run"
        store = ReceiptStore(run, key, "test", first_response=503)
        first = _signed_headers(key, "test", delivery_id, str(uuid.uuid4()), at, body)
        assert store.accept(first, body, now=at) == 503
        assert store.accept(first, body, now=at) == 409  # nonce replay
        resumed = ReceiptStore(run, key, "test", resume=True, first_response=503)
        second = _signed_headers(key, "test", delivery_id, str(uuid.uuid4()), at, body)
        assert resumed.accept(second, body, now=at) == 200
        conflict = json.dumps({"deliveryId": delivery_id, "event": {"marker": "changed"}}, separators=(",", ":")).encode()
        assert resumed.accept(_signed_headers(key, "test", delivery_id, str(uuid.uuid4()), at, conflict), conflict, now=at) == 409
        bad = dict(second)
        bad["X-ThingsCloud-Nonce"] = str(uuid.uuid4())
        assert resumed.accept(bad, body, now=at) == 401
        stale = _signed_headers(key, "test", delivery_id, str(uuid.uuid4()), at - 301, body)
        assert resumed.accept(stale, body, now=at) == 401
        assert len(list((run / "deliveries").iterdir())) == 1
        journal = (run / "decisions.jsonl").read_text("utf-8")
        assert [json.loads(line)["disposition"] for line in journal.splitlines()] == ["FIRST", "DUPLICATE", "BODY_CONFLICT"]

        def must_reject(action):
            try:
                action()
            except ValueError:
                return
            raise AssertionError("insecure private path was accepted")

        secret_file = Path(root) / "secret"
        secret_file.write_bytes(base64.b64encode(key))
        secret_file.chmod(0o600)
        for name in ("secret.link", "key.link"):
            link = Path(root) / name
            link.symlink_to(secret_file)
            must_reject(lambda path=link: _private_file(path))
        alias = Path(root) / "run-alias"
        alias.symlink_to(run, target_is_directory=True)
        must_reject(lambda: ReceiptStore(alias, key, "test", resume=True, first_response=503))
        run.chmod(0o755)
        must_reject(lambda: ReceiptStore(run, key, "test", resume=True, first_response=503))
        run.chmod(0o700)
        with mock.patch.object(os, "getuid", return_value=os.getuid() + 1):
            must_reject(lambda: ReceiptStore(run, key, "test", resume=True, first_response=503))
        for folder in ("deliveries", "nonces"):
            original = run / folder
            actual = run / (folder + "-real")
            original.rename(actual)
            original.symlink_to(actual, target_is_directory=True)
            must_reject(lambda: ReceiptStore(run, key, "test", resume=True, first_response=503))
            original.unlink()
            actual.rename(original)
            original.chmod(0o750)
            must_reject(lambda: ReceiptStore(run, key, "test", resume=True, first_response=503))
            original.chmod(0o700)
        for path in run.rglob("*"):
            if path.is_file():
                content = path.read_bytes()
                assert b"private-body-marker" not in content
                assert key not in content
    print("V4A_RECEIVER_SELF_TEST_PASS")


def serve(args: argparse.Namespace) -> None:
    secret = base64.b64decode(_private_file(args.secret_file).strip(), validate=True)
    store = ReceiptStore(args.run_dir, secret, args.key_id, resume=args.resume, first_response=args.first_response)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    _private_file(args.key_file)
    context.load_cert_chain(str(args.cert_file), str(args.key_file))
    with ReceiverServer((args.bind, args.port), store, context, args.path) as server:
        print(f"V4A_RECEIVER_READY bind={args.bind}:{args.port} path={args.path} runDir={args.run_dir}", flush=True)
        try:
            server.serve_forever(poll_interval=0.5)
        except KeyboardInterrupt:
            pass


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("self-test", help="run synthetic signature, retry and persistence checks without TLS/network")
    run = sub.add_parser("serve", help="serve a controlled public HTTPS V4a receiver")
    run.add_argument("--bind", default="127.0.0.1")
    run.add_argument("--port", type=int, default=8443)
    run.add_argument("--path", default="/events")
    run.add_argument("--run-dir", type=Path, required=True, help="new private directory; use --resume to reopen")
    run.add_argument("--resume", action="store_true")
    run.add_argument("--secret-file", type=Path, required=True, help="0600 file containing one-time base64 signingSecret")
    run.add_argument("--key-id", required=True, help="subscription signingKeyId, not the secret")
    run.add_argument("--cert-file", type=Path, required=True, help="certificate for this TLS origin")
    run.add_argument("--key-file", type=Path, required=True, help="0600 private TLS key for the certificate")
    run.add_argument("--first-response", type=int, choices=(200, 503), default=200, help="503 records the first effect, then a duplicate returns 200")
    args = parser.parse_args()
    if args.command == "self-test":
        self_test()
    else:
        if not args.path.startswith("/") or "?" in args.path or "#" in args.path:
            parser.error("--path must be a plain absolute path")
        serve(args)


if __name__ == "__main__":
    main()

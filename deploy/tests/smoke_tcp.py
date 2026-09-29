"""TC v1 frame probe over local TLS, with credentials passed only on stdin."""

import json
import socket
import ssl
import struct
import sys


def frame(kind, payload):
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return struct.pack("!2sBBHI", b"TC", 1, kind, 0, len(body)) + body


def read_exact(stream, count):
    result = bytearray()
    while len(result) < count:
        chunk = stream.recv(count - len(result))
        if not chunk:
            raise RuntimeError("TCP peer closed before response")
        result.extend(chunk)
    return bytes(result)


def read_frame(stream):
    magic, version, kind, flags, length = struct.unpack("!2sBBHI", read_exact(stream, 10))
    if magic != b"TC" or version != 1 or flags != 0 or length > 65536:
        raise RuntimeError("Invalid TC response frame")
    return kind, json.loads(read_exact(stream, length))


def main():
    request = json.load(sys.stdin)
    # This probe runs only against the local self-signed candidate certificate.
    tls = ssl._create_unverified_context()
    with socket.create_connection((request["host"], request["port"]), timeout=8) as raw:
        with tls.wrap_socket(raw, server_hostname="localhost") as stream:
            stream.settimeout(8)
            stream.sendall(frame(1, {
                "projectKey": request["projectKey"],
                "deviceKey": request["deviceKey"],
                "secret": request["password"],
            }))
            kind, response = read_frame(stream)
            if kind != 2 or response.get("status") != "OK":
                raise RuntimeError(f"TCP AUTH failed: type={kind}, code={response.get('errorCode')}")
            stream.sendall(frame(0x10, request["payload"]))
            kind, response = read_frame(stream)
            if (kind != 0x13 or response.get("messageId") != request["payload"]["messageId"]
                    or response.get("status") != "ACCEPTED"):
                raise RuntimeError(f"TCP UPLINK rejected: type={kind}, code={response.get('errorCode')}")
    print("TC v1 TLS authentication and ACCEPTED response passed")


if __name__ == "__main__":
    main()

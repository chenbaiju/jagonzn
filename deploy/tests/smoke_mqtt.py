"""Minimal MQTT 3.1.1 QoS1 client for the isolated local candidate test.

Reads a single JSON request from stdin so device credentials never enter process
arguments or repository files. Uses only Python's standard library.
"""

import json
import socket
import struct
import sys


def utf8(value):
    data = value.encode("utf-8")
    return struct.pack("!H", len(data)) + data


def remaining_length(length):
    encoded = bytearray()
    while True:
        digit = length % 128
        length //= 128
        encoded.append(digit | (0x80 if length else 0))
        if not length:
            return bytes(encoded)


def read_exact(stream, count):
    result = bytearray()
    while len(result) < count:
        chunk = stream.recv(count - len(result))
        if not chunk:
            raise RuntimeError("MQTT connection closed")
        result.extend(chunk)
    return bytes(result)


def main():
    request = json.load(sys.stdin)
    with socket.create_connection((request["host"], request["port"]), timeout=8) as stream:
        stream.settimeout(8)
        connect = (
            utf8("MQTT") + b"\x04\xc2\x00\x1e"
            + utf8(request["clientId"])
            + utf8(request["username"])
            + utf8(request["password"])
        )
        stream.sendall(b"\x10" + remaining_length(len(connect)) + connect)
        connack = read_exact(stream, 4)
        if connack != b"\x20\x02\x00\x00":
            raise RuntimeError(f"MQTT CONNACK rejected: {connack.hex()}")
        packet_id = 1
        publish = (
            utf8(request["topic"])
            + struct.pack("!H", packet_id)
            + request["payload"].encode("utf-8")
        )
        stream.sendall(b"\x32" + remaining_length(len(publish)) + publish)
        ack = read_exact(stream, 4)
        if ack != b"\x40\x02\x00\x01":
            raise RuntimeError(f"MQTT PUBACK rejected: {ack.hex()}")
        stream.sendall(b"\xe0\x00")
    print("MQTT 3.1.1 authentication and QoS1 PUBACK passed")


if __name__ == "__main__":
    main()

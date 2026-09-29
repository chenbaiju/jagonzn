"""Check a one-use public realtime MQTT ticket over the isolated app broker.

Credentials arrive on stdin and are never passed in process arguments.
"""

import json
import socket
import struct
import sys
import base64
import urllib.request
import ssl
from datetime import datetime, timezone


def field(value):
    payload = value.encode("utf-8")
    return struct.pack("!H", len(payload)) + payload


def packet_length(value):
    result = bytearray()
    while True:
        digit = value % 128
        value //= 128
        result.append(digit | (0x80 if value else 0))
        if not value:
            return bytes(result)


def read_exact(sock, count):
    data = bytearray()
    while len(data) < count:
        chunk = sock.recv(count - len(data))
        if not chunk:
            raise RuntimeError("MQTT connection closed")
        data.extend(chunk)
    return bytes(data)


def read_packet(sock):
    header = read_exact(sock, 1)[0]
    length = 0
    shift = 0
    for _ in range(4):
        digit = read_exact(sock, 1)[0]
        length |= (digit & 127) << shift
        if not digit & 128:
            return header, read_exact(sock, length)
        shift += 7
    raise RuntimeError("MQTT length malformed")


def main():
    request = json.load(sys.stdin)
    with socket.create_connection(("127.0.0.1", 31883), timeout=8) as sock:
        sock.settimeout(40)
        connect = (field("MQTT") + b"\x04\xc2\x00\x3c"
                   + field(request["clientId"])
                   + field(request["username"])
                   + field(request["credential"]))
        sock.sendall(b"\x10" + packet_length(len(connect)) + connect)
        if read_packet(sock) != (0x20, b"\x00\x00"):
            raise RuntimeError("public realtime MQTT CONNECT rejected")
        subscribe = b"\x00\x01" + field(request["topic"]) + b"\x01"
        sock.sendall(b"\x82" + packet_length(len(subscribe)) + subscribe)
        if read_packet(sock) != (0x90, b"\x00\x01\x01"):
            raise RuntimeError("public realtime exact-topic QoS1 SUBSCRIBE rejected")
        marker = "jagonzn-local-broker-transport-probe"
        auth = base64.b64encode((request["apiKey"] + ":" + request["apiSecret"]).encode()).decode()
        publish_request = urllib.request.Request(
            "http://127.0.0.1:38083/api/v5/publish",
            data=json.dumps({"topic": request["topic"], "payload": marker,
                             "qos": 1, "retain": False}).encode(),
            headers={"Authorization": "Basic " + auth, "Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(publish_request, timeout=8) as response:
            if response.status not in (200, 202):
                raise RuntimeError(f"application broker publisher API rejected: HTTP {response.status}")
        header, received = read_packet(sock)
        if header != 0x32 or not received.startswith(field(request["topic"])):
            raise RuntimeError("application broker QoS1 PUBLISH not delivered")
        offset = len(field(request["topic"]))
        packet_id = received[offset:offset + 2]
        if received[offset + 2:] != marker.encode():
            raise RuntimeError("application broker PUBLISH payload mismatch")
        sock.sendall(b"\x40\x02" + packet_id)
        report = json.dumps({
            "messageId": request["messageId"],
            "occurredAt": datetime.now(timezone.utc).isoformat(),
            "payload": {"temperature": 28.5},
        }).encode()
        device_request = urllib.request.Request(
            "https://127.0.0.1:18443/device-access/v1/property/report",
            data=report,
            headers={"Content-Type": "application/json",
                     "X-TC-Device-Key": request["deviceKey"],
                     "X-TC-Device-Secret": request["deviceSecret"]},
            method="POST",
        )
        with urllib.request.urlopen(device_request,
                                    context=ssl._create_unverified_context(), timeout=8) as response:
            if response.status != 202:
                raise RuntimeError("local device HTTPS property report rejected")
        header, received = read_packet(sock)
        if header != 0x32 or not received.startswith(field(request["topic"])):
            raise RuntimeError("device-derived public realtime PUBLISH not delivered")
        offset = len(field(request["topic"]))
        packet_id = received[offset:offset + 2]
        event = json.loads(received[offset + 2:])
        if (event.get("eventId") != request["messageId"]
                or event.get("eventType") != "device.property.report"
                or event.get("deviceId") != request["deviceId"]
                or "temperature" not in event.get("properties", {})):
            raise RuntimeError("device-derived public realtime event mismatch")
        sock.sendall(b"\x40\x02" + packet_id)
        sock.sendall(b"\xe0\x00")
    print("public realtime MQTT ticket, broker QoS1 transport and device HTTPS-to-MQTT event passed")


if __name__ == "__main__":
    main()

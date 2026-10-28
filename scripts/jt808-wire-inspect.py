#!/usr/bin/env python3
"""只读核对专用pcap中的JT808帧；脱敏回执不输出终端标识、鉴权码或报文体。"""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import socket
import struct

ROOT = Path(__file__).resolve().parents[1]


def streams(raw):
    if len(raw) < 24 or raw[:4] not in (b'\xd4\xc3\xb2\xa1', b'\xa1\xb2\xc3\xd4'):
        raise ValueError('只支持classic pcap；不猜测其他容器格式')
    order = '<' if raw[:4] == b'\xd4\xc3\xb2\xa1' else '>'
    link = struct.unpack(order + 'I', raw[20:24])[0]
    offset, flows, incomplete = 24, {}, False
    while offset < len(raw):
        if len(raw) - offset < 16:
            incomplete = True
            break
        _, _, captured, original = struct.unpack(order + 'IIII', raw[offset:offset + 16])
        offset += 16
        if captured > 65535 or original < captured:
            raise ValueError('pcap记录长度越界')
        if offset + captured > len(raw):
            incomplete = True
            break
        packet = raw[offset:offset + captured]
        offset += captured
        if link == 276:
            if packet[:2] != b'\x08\x00':
                continue
            ip = packet[20:]
        elif link == 113:
            if packet[14:16] != b'\x08\x00':
                continue
            ip = packet[16:]
        elif link == 1:
            if packet[12:14] != b'\x08\x00':
                continue
            ip = packet[14:]
        else:
            raise ValueError('未支持此pcap链路类型')
        if len(ip) < 20 or ip[0] >> 4 != 4 or ip[9] != 6:
            continue
        head, size = (ip[0] & 15) * 4, int.from_bytes(ip[2:4], 'big')
        if size > len(ip) or int.from_bytes(ip[6:8], 'big') & 0x3fff:
            raise ValueError('TCP捕获截断或IP分片，不能声称完整帧')
        tcp = ip[head:size]
        if len(tcp) < 20:
            raise ValueError('TCP头不足')
        source, dest, serial = struct.unpack('>HHI', tcp[:8])
        if 6808 not in (source, dest):
            continue
        key = (ip[12:16], source, ip[16:20], dest)
        flow = flows.setdefault(key, {'direction': 'uplink' if dest == 6808 else 'downlink', 'segments': [], 'syn': None})
        if tcp[13] & 2:
            flow['syn'] = serial + 1
        payload = tcp[(tcp[12] >> 4) * 4:]
        if payload:
            flow['segments'].append((serial, payload))
    results = []
    for key, flow in flows.items():
        result = {'flowId': hashlib.sha256(repr(key).encode()).hexdigest()[:16], 'direction': flow['direction'], 'payloadBytes': 0, 'gap': False}
        merged = bytearray()
        chunks = sorted(flow['segments'])
        expected = flow['syn'] if flow['syn'] is not None else chunks[0][0] if chunks else 0
        for serial, payload in chunks:
            if serial > expected:
                result['gap'] = True
                break
            overlap = expected - serial
            if overlap < len(payload):
                extra = payload[overlap:]
                merged.extend(extra)
                expected += len(extra)
        result['payloadBytes'] = len(merged)
        results.append((result, bytes(merged)))
    return results, incomplete


def inspect_frame(wire, direction, cipher, terminal):
    raw, index = bytearray(), 0
    while index < len(wire):
        value = wire[index]
        index += 1
        if value == 0x7d:
            if index >= len(wire) or wire[index] not in (1, 2):
                raise ValueError('非法转义')
            value = 0x7d if wire[index] == 1 else 0x7e
            index += 1
        raw.append(value)
    if len(raw) < 15:
        raise ValueError('消息头长度不足')
    message, properties, actual_terminal, serial = struct.unpack('>HH8sH', raw[:14])
    length = properties & 1023
    result = {'messageId': '0x%04X' % message, 'serial': serial, 'terminalMatchesBinding': actual_terminal == terminal,
              'wireSha256': hashlib.sha256(wire).hexdigest()}
    if properties & 0xf800 or len(raw) != 15 + ((length + 15) // 16) * 16:
        result['frameValid'] = False
        result['reason'] = 'HEADER_OR_LENGTH'
        return result
    plain = cipher.crypt(bytes(raw[14:-1]), False)
    check_body = raw[14:14 + length] if direction == 'uplink' else plain[:length]
    check = 0
    for value in raw[:14] + check_body:
        check ^= value
    result['checksumValid'] = check == raw[-1]
    result['zeroPaddingValid'] = not any(plain[length:])
    expected_crypto = 0 if direction == 'uplink' else 0x400
    result['cryptoBitsMatchDocument'] = properties & 0x1c00 == expected_crypto
    result['frameValid'] = all(result[k] for k in ('terminalMatchesBinding', 'checksumValid', 'zeroPaddingValid', 'cryptoBitsMatchDocument'))
    if result['frameValid']:
        body = plain[:length]
        if message == 0x0100 and len(body) == 59:
            result['registrationBodyLength'] = 59
        if message == 0x8001 and len(body) == 5:
            result['replyToMessage'] = '0x%04X' % int.from_bytes(body[2:4], 'big')
            result['genericReplyResult'] = body[4]
        if message == 0x8100 and len(body) in (3, 9):
            result['registrationReplyResult'] = body[2]
        if message in (0x0200, 0x0201):
            report = body[2:] if message == 0x0201 else body
            cursor = 28
            while cursor + 2 <= len(report):
                kind, count = report[cursor:cursor + 2]
                cursor += 2
                value = report[cursor:cursor + count]
                if len(value) != count:
                    result['reportTlvTruncated'] = True
                    break
                if kind == 0xe7 and count == 2:
                    result['firmwareFromE7'] = str(value[0]) + '.' + str(value[1])
                cursor += count
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    if args.receipt.exists() or args.receipt.is_symlink():
        raise FileExistsError('拒绝覆盖抓包检查回执')
    lab = runpy.run_path(str(ROOT / 'scripts/jt808-runtime-lab.py'), run_name='lab')
    data, home, vm, work = lab['layout']()
    if not args.receipt.resolve().is_relative_to(data):
        raise ValueError('回执必须外置')
    capture = json.loads((work / 'real-device/capture-process.json').read_text())
    pcap = Path(capture['pcap'])
    if not pcap.resolve().is_relative_to(data) or pcap.stat().st_size > 70 * 1024 * 1024:
        raise ValueError('抓包不在外盘或超过有界容量')
    raw = pcap.read_bytes()
    params = dict(line.split('=', 1) for line in (data / '.private/ci-tools/jt808/document-crypto.properties').read_text().splitlines() if '=' in line)
    binding = dict(line.split('=', 1) for line in (work / 'real-device/binding.properties').read_text().splitlines() if '=' in line)
    probe = runpy.run_path(str(ROOT / 'scripts/jt808-runtime-probe.py'), run_name='probe')
    cipher = probe['Sm4'](bytes.fromhex(params['sm4.key.hex']), bytes.fromhex(params['sm4.iv.hex']))
    flows, incomplete = streams(raw)
    output = []
    for result, stream in flows:
        frames = []
        if not result['gap']:
            # 只解析两个完整7E之间的帧，末尾半包留待后续快照，不能当作有效帧。
            parts = stream.split(b'\x7e')
            for wire in parts[1:-1]:
                if not wire:
                    continue
                try:
                    frames.append(inspect_frame(wire, result['direction'], cipher, bytes.fromhex(binding['terminal.id'])))
                except (ValueError, struct.error):
                    frames.append({'frameValid': False, 'reason': 'FRAME_DECODE_REJECTED'})
        output.append({**result, 'frames': frames})
    snapshot = args.receipt.with_suffix('.pcap')
    with snapshot.open('xb') as target:
        snapshot.chmod(0o600)
        target.write(raw)
    result = {'pcapSnapshot': str(snapshot), 'snapshotBytes': len(raw), 'snapshotSha256': hashlib.sha256(raw).hexdigest(),
              'finalRecordIncomplete': incomplete, 'flows': output, 'physicalDeviceProvenance': 'requires expected terminal match and operator confirmation; TCP handshakes alone do not prove hardware'}
    args.receipt.write_text(json.dumps(result, indent=2) + '\n')
    args.receipt.chmod(0o600)
    print('JT808只读抓包核对完成，帧数=' + str(sum(len(v['frames']) for v in output)))


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""通过真实HTTPS API及国密TCP模拟锁具验证独立运行时；写入只发一次，原请求和结果私有外置。"""
import argparse
import base64
import ctypes
import datetime as dt
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import re
import runpy
import secrets
import socket
import ssl
import struct
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA256 = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()


def private_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    path.chmod(0o600)


def wait_for(read, accepted, seconds=30):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        result = read()
        if accepted(result):
            return result
        time.sleep(.3)
    raise RuntimeError('只读结果等待超时，保留原请求，不自动重发写入')


class Api:
    def __init__(self, work, scope):
        self.work, self.scope, self.token = work, scope, None
        self.cookies = http.cookiejar.MozillaCookieJar(str(work / ('cookies-' + scope + '.txt')))
        if Path(self.cookies.filename).exists():
            self.cookies.load(ignore_discard=True)
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=str(work / 'tls/cert.pem'))),
            urllib.request.HTTPCookieProcessor(self.cookies))
        self.requests = work / 'requests'
        self.requests.mkdir(mode=0o700, exist_ok=True)

    def call(self, method, path, body=None, expected=200, label=None, headers=None):
        raw = json.dumps(body, separators=(',', ':')).encode() if body is not None else None
        request_headers = {'Content-Type': 'application/json', **(headers or {})}
        if self.token:
            request_headers['Authorization'] = 'Bearer ' + self.token
        journal = self.requests / (self.scope + '-' + label + '.json') if label else None
        if method != 'GET' and journal is None:
            raise ValueError('写请求必须有持久原件标识')
        if journal and journal.exists():
            prior = json.loads(journal.read_text())
            if prior['method'] != method or prior['path'] != path or prior['body'] != body:
                raise ValueError('原请求键不能换载荷')
            if prior.get('completed') and prior['status'] == expected:
                return prior['response']
            raise RuntimeError('原请求未确认成功，不自动重发；先核对外盘请求回执')
        record = {'method': method, 'path': path, 'body': body, 'headers': headers or {}, 'completed': False}
        if journal:
            private_json(journal, record)
        request = urllib.request.Request('https://127.0.0.1:18280' + path, raw, request_headers, method=method)
        try:
            with self.opener.open(request, timeout=20) as response:
                status, content = response.status, response.read()
        except urllib.error.HTTPError as response:
            status, content = response.code, response.read()
        decoded = json.loads(content) if content else None
        self.cookies.save(ignore_discard=True)
        Path(self.cookies.filename).chmod(0o600)
        if journal:
            record.update(completed=True, status=status, response=decoded)
            private_json(journal, record)
        if status != expected:
            code = decoded.get('code') if isinstance(decoded, dict) else None
            raise RuntimeError(method + ' ' + path + ': HTTP ' + str(status) + ', code=' + str(code))
        return decoded

    def refresh_if_needed(self, phase):
        payload = self.token.split('.')[1]
        expires = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['exp']
        if expires > time.time() + 120:
            return
        self.token = None
        self.token = self.call('POST', '/api/v1/auth/refresh', expected=200, label=phase + '-refresh')['accessToken']


def mailbox_token(email):
    def check():
        with urllib.request.urlopen('http://127.0.0.1:28025/api/v1/messages', timeout=3) as response:
            listing = json.load(response)
        for item in listing.get('messages', []):
            if any(recipient.get('Address') == email for recipient in item.get('To', [])):
                with urllib.request.urlopen('http://127.0.0.1:28025/api/v1/message/' + item['ID'], timeout=3) as response:
                    message = json.load(response)
                match = re.search(r'[?&]token=([A-Za-z0-9_-]+)', message.get('Text', '') + message.get('HTML', ''))
                if match:
                    return match.group(1)
        return None
    return wait_for(check, bool, 20)


def setup(work):
    fixture_file = work / 'fixture.json'
    fixture = json.loads(fixture_file.read_text()) if fixture_file.exists() else {
        'run': secrets.token_hex(4), 'startedAt': dt.datetime.now(dt.timezone.utc).isoformat()}
    private_json(fixture_file, fixture)
    for scope in ('owner', 'outsider'):
        api = Api(work, scope)
        account = fixture.setdefault(scope, {'email': scope + '-' + fixture['run'] + '@jagonzn.test',
                                             'password': secrets.token_urlsafe(36)})
        private_json(fixture_file, fixture)
        api.call('POST', '/api/v1/auth/register', {'email': account['email'], 'password': account['password']}, 204, 'register')
        verification = work / 'requests' / (scope + '-verify.json')
        token = json.loads(verification.read_text())['body']['token'] if verification.exists() else mailbox_token(account['email'])
        api.call('POST', '/api/v1/auth/email/verify', {'token': token}, 200, 'verify')
        login = api.call('POST', '/api/v1/auth/login', {'email': account['email'], 'password': account['password']}, 200, 'login')
        api.token = login['accessToken']
        account['token'] = api.token
        account['identity'] = api.call('GET', '/api/v1/auth/me')
        account['project'] = api.call('POST', '/api/v1/projects', {'name': 'jt808-' + scope + '-' + fixture['run'], 'region': 'sh-1'}, 200, 'project')
        api.token = api.call('POST', '/api/v1/auth/switch-project', {'projectId': account['project']['id']}, 200, 'switch-project')['accessToken']
        account['token'] = api.token
        private_json(fixture_file, fixture)
    api = Api(work, 'owner')
    api.token = fixture['owner']['token']
    project = fixture['owner']['project']
    prefix = '/api/v1/projects/' + project['id']
    device_type = api.call('POST', prefix + '/device-types',
                          {'typeKey': 'jt808_' + fixture['run'], 'name': 'JT808 isolated 4G lock',
                           'deviceKind': 'DIRECT', 'payloadProtocol': 'STANDARD', 'networkType': 'CELLULAR_4G'}, 201, 'device-type')
    types = prefix + '/device-types/' + device_type['id']
    for key, kind in (('door_closed', 'SWITCH'), ('battery_percent', 'NUMBER')):
        data = {'propertyKey': key, 'name': key, 'accessType': 'REPORT', 'dataType': kind, 'sortOrder': 0}
        if kind == 'NUMBER':
            data.update(decimalPlaces=0, minimumValue=0, maximumValue=100)
        api.call('POST', types + '/properties', data, 201, 'property-' + key)
    for key in ('jt808_query', 'jt808_unlock', 'jt808_lock'):
        api.call('POST', types + '/commands', {'commandKey': key, 'name': key,
                 'inputSchema': '{"type":"object","properties":{},"additionalProperties":false}',
                 'outputSchema': '{"type":"object"}', 'timeoutSeconds': 8, 'sortOrder': 0}, 201, 'definition-' + key)
    api.call('POST', types + '/publish', expected=200, label='publish')
    model = api.call('GET', types + '/thing-model-versions/latest')
    device = api.call('POST', prefix + '/devices', {'deviceTypeId': device_type['id'],
                          'deviceKey': 'jt808-' + fixture['run'], 'name': 'JT808 simulated peer'}, 201, 'device')
    device_path = prefix + '/devices/' + device['id']
    credential = api.call('POST', device_path + '/credentials', expected=201, label='credential')
    access = api.call('GET', device_path + '/access-config')
    if access['protocol'] != 'TCP' or not access['enabled']:
        api.call('PUT', device_path + '/access-config', {'protocol': 'TCP', 'enabled': True,
                 'expectedConfigVersion': access['configVersion']}, 200, 'tcp-plane')
    fixture.update(device=device, model=model, devicePath=device_path, credential=credential, deviceType=device_type)
    private_json(fixture_file, fixture)
    until = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=15)).isoformat()
    binding = {'terminal.id': '0000000000000001', 'bluetooth.mac.hex': '001122334455',
               'platform.project-key': project['projectKey'], 'platform.device-key': device['deviceKey'],
               'platform.secret': credential['plainSecret'], 'model.version': model['versionNumber'],
               'enrollment.until': until, 'property.door_closed': 'door_closed', 'property.battery_percent': 'battery_percent'}
    path = work / 'binding.properties'
    if path.exists():
        raise RuntimeError('已有预绑定原件，不覆盖；请使用既有fixture继续')
    with path.open('x') as output:
        path.chmod(0o600)
        output.write(''.join(key + '=' + value + '\n' for key, value in binding.items()))
    return {'result': 'PASS', 'phase': 'prepare', 'projectId': project['id'], 'deviceId': device['id'],
            'modelVersionId': model['id'], 'modelVersion': model['versionNumber'], 'accountVerification': 'real isolated SMTP and public API'}


class Sm4:
    def __init__(self, key, iv):
        self.key, self.iv = key, iv
        self.lib = ctypes.CDLL('/opt/homebrew/opt/openssl@3/lib/libcrypto.dylib')
        self.lib.EVP_CIPHER_CTX_new.restype = ctypes.c_void_p
        self.lib.EVP_sm4_cbc.restype = ctypes.c_void_p
        self.lib.EVP_CIPHER_CTX_free.argtypes = [ctypes.c_void_p]
        self.lib.EVP_CipherInit_ex.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int]
        self.lib.EVP_CIPHER_CTX_set_padding.argtypes = [ctypes.c_void_p, ctypes.c_int]
        self.lib.EVP_CipherUpdate.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(ctypes.c_int), ctypes.c_void_p, ctypes.c_int]
        self.lib.EVP_CipherFinal_ex.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(ctypes.c_int)]

    def crypt(self, data, encrypt):
        if not data:
            return b''
        context = self.lib.EVP_CIPHER_CTX_new()
        try:
            key, iv = ctypes.create_string_buffer(self.key), ctypes.create_string_buffer(self.iv)
            assert self.lib.EVP_CipherInit_ex(context, self.lib.EVP_sm4_cbc(), None, key, iv, int(encrypt)) == 1
            assert self.lib.EVP_CIPHER_CTX_set_padding(context, 0) == 1
            source, output = ctypes.create_string_buffer(data), ctypes.create_string_buffer(len(data) + 16)
            length, final = ctypes.c_int(), ctypes.c_int()
            assert self.lib.EVP_CipherUpdate(context, output, ctypes.byref(length), source, len(data)) == 1
            assert self.lib.EVP_CipherFinal_ex(context, ctypes.byref(output, length.value), ctypes.byref(final)) == 1
            return output.raw[:length.value + final.value]
        finally:
            self.lib.EVP_CIPHER_CTX_free(context)


class Lock:
    def __init__(self, data):
        params = dict(line.split('=', 1) for line in (data / '.private/ci-tools/jt808/document-crypto.properties').read_text().splitlines() if line)
        self.cipher = Sm4(bytes.fromhex(params['sm4.key.hex']), bytes.fromhex(params['sm4.iv.hex']))
        self.socket = socket.create_connection(('127.0.0.1', 16808), timeout=3)
        self.socket.settimeout(3)
        self.serial = 1

    @staticmethod
    def xor(data):
        value = 0
        for item in data:
            value ^= item
        return value

    def send(self, message, body=b'', serial=None):
        serial = serial if serial is not None else self.serial
        self.serial += 1
        header = struct.pack('>HH8sH', message, len(body), bytes.fromhex('0000000000000001'), serial)
        encrypted = self.cipher.crypt(body + bytes((-len(body)) % 16), True)
        raw = header + encrypted + bytes([self.xor(header + encrypted[:len(body)])])
        wire = b'\x7e' + raw.replace(b'\x7d', b'\x7d\x01').replace(b'\x7e', b'\x7d\x02') + b'\x7e'
        self.socket.sendall(wire)
        return {'message': message, 'serial': serial, 'body': body.hex(), 'wireSha256': hashlib.sha256(wire).hexdigest()}

    def receive(self, seconds=3):
        self.socket.settimeout(seconds)
        while True:
            first = self.socket.recv(1)
            if not first:
                raise EOFError('模拟锁具连接已被关闭')
            if first == b'\x7e':
                break
        raw = bytearray()
        while True:
            value = self.socket.recv(1)
            if not value:
                raise EOFError('模拟锁具连接已被关闭')
            if value == b'\x7e':
                break
            if value == b'\x7d':
                escape = self.socket.recv(1)
                if escape not in (b'\x01', b'\x02'):
                    raise ValueError('下行非法转义')
                value = b'\x7d' if escape == b'\x01' else b'\x7e'
            raw.extend(value)
        message, properties, terminal, serial = struct.unpack('>HH8sH', raw[:14])
        if properties & 0xfc00 != 0x400 or terminal != bytes.fromhex('0000000000000001'):
            raise ValueError('下行型号或国密标识不符')
        length = properties & 1023
        plain = self.cipher.crypt(bytes(raw[14:-1]), False)
        if any(plain[length:]) or self.xor(raw[:14] + plain[:length]) != raw[-1]:
            raise ValueError('下行校验或零补齐错误')
        return message, serial, plain[:length]

    def authenticate(self, token):
        self.send(0x0102, token)
        message, _, body = self.receive()
        assert message == 0x8001 and body[-1] == 0

    def close(self):
        self.socket.close()


def location(closed=True, percent=80):
    current = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
    stamp = bytes.fromhex(current.strftime('%y%m%d%H%M%S'))
    return struct.pack('>IIIIHHH', 0, 2, 31_230_400, 121_473_700, 5, 0, 90) + stamp + bytes([0xe2, 2, 0, int(closed), 0xe3, 6]) + struct.pack('>HHH', percent, 400, 0)


def sql(lab, vm, work, statement, app=False, scoped=None):
    identifier, _ = lab['container'](vm, work, 'postgres')
    values = dict(line.split('=', 1) for line in (work / 'credentials.env').read_text().splitlines() if line)
    env = os.environ.copy()
    env['PGPASSWORD'] = values['JAGONZN_LAB_DB_APP_PASSWORD' if app else 'JAGONZN_LAB_DB_OWNER_PASSWORD']
    role = 'jagonzn_app' if app else 'jagonzn'
    context = ''
    if scoped is True or scoped is None and not app:
        fixture = json.loads((work / 'fixture.json').read_text())
        tenant = str(uuid.UUID(fixture['owner']['identity']['tenantId']))
        project = str(uuid.UUID(fixture['owner']['project']['id']))
        context = "SET LOCAL app.tenant_id='" + tenant + "'; SET LOCAL app.project_id='" + project + "'; "
    raw = lab['run'](lab['docker_command'](vm, work) + ['exec', '--env', 'PGPASSWORD', identifier, 'psql', '-X', '-U', role, '-d', 'jagonzn', '-v', 'ON_ERROR_STOP=1', '-Atqc',
                      'BEGIN READ ONLY; ' + context + statement + '; COMMIT'], env=env)
    return raw.decode().strip()


def exercise(lab, data, vm, work, restart=False):
    fixture = json.loads((work / 'fixture.json').read_text())
    api = Api(work, 'owner')
    api.token = fixture['owner']['token']
    phase = 'restart' if restart else 'exercise'
    api.refresh_if_needed(phase)
    fixture['owner']['token'] = api.token
    private_json(work / 'fixture.json', fixture)
    path, device, project = fixture['devicePath'], fixture['device']['id'], fixture['owner']['project']['id']
    lock = Lock(data)
    token_file = work / 'peer-token.bin'
    try:
        if not token_file.exists():
            body = bytearray(59)
            body[29:35] = bytes.fromhex('001122334455')
            body[35], body[36] = 255, 2
            lock.send(0x0100, bytes(body))
            kind, _, response = lock.receive()
            assert kind == 0x8100 and response[2] == 0 and len(response) == 9
            token_file.write_bytes(response[3:])
            token_file.chmod(0o600)
        token = token_file.read_bytes()
        lock.authenticate(token)
        replay_file = work / 'peer-report.json'
        payload = bytes.fromhex(json.loads(replay_file.read_text())['body']) if replay_file.exists() else location()
        before_replay = int(sql(lab, vm, work, "SELECT count(*) FROM ts_property_point WHERE device_id='" + device + "'"))
        if not replay_file.exists():
            private_json(replay_file, {'body': payload.hex(), 'serial': 100})
        report = lock.send(0x0200, payload, 100)
        assert lock.receive()[2][-1] == 0
        count_sql = "SELECT count(*) FROM ts_property_point WHERE device_id='" + device + "'"
        initial = int(wait_for(lambda: sql(lab, vm, work, count_sql), lambda value: int(value) >= 2))
        if restart:
            assert initial == before_replay, '重启后原报文重复写入历史'
        lock.send(0x0200, payload, 100)
        assert lock.receive()[2][-1] == 0
        time.sleep(1)
        assert int(sql(lab, vm, work, count_sql)) == initial
        initial_shadow = api.call('GET', path + '/shadow')
        reported = json.loads(initial_shadow['reported'])
        assert reported['door_closed'] is (False if restart else True)
        assert reported['battery_percent'] == 80
        phase = 'restart' if restart else 'exercise'
        accepted = api.call('POST', path + '/commands', {'commandKey': 'jt808_query', 'input': {}}, 202,
                            phase + '-query', {'Idempotency-Key': 'jt808-' + fixture['run'] + '-' + phase + '-query'})
        message, serial, _ = lock.receive(20)
        assert message == 0x8201
        lock.send(0x0001, struct.pack('>HHB', serial, 0x8201, 0))
        ack = wait_for(lambda: api.call('GET', path + '/commands/' + accepted['id']),
                       lambda value: value['status'] == 'ACKNOWLEDGED')
        lock.send(0x0201, struct.pack('>H', serial) + location(), 101)
        assert lock.receive()[2][-1] == 0
        result = wait_for(lambda: api.call('GET', path + '/commands/' + accepted['id']),
                          lambda value: value['status'] == 'SUCCEEDED')
        outsider = Api(work, 'outsider')
        outsider.token = fixture['outsider']['token']
        outsider.refresh_if_needed(phase)
        fixture['outsider']['token'] = outsider.token
        private_json(work / 'fixture.json', fixture)
        outsider.call('GET', path + '/commands/' + accepted['id'], expected=404)
        history_query = urllib.parse.urlencode({'expectedModelVersionId': fixture['model']['id'], 'propertyKey': 'door_closed',
                          'from': (dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=30)).isoformat(),
                          'to': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=1)).isoformat(), 'limit': 20})
        history = api.call('GET', path + '/property-observations/history?' + history_query)
        shadow = api.call('GET', path + '/shadow')
        assert json.loads(shadow['reported'])['door_closed'] is True
        no_context = int(sql(lab, vm, work, 'SELECT count(*) FROM dev_device', app=True))
        assert no_context == 0
        correct_scope = int(sql(lab, vm, work, 'SELECT count(*) FROM dev_device', app=True, scoped=True))
        assert correct_scope == 1
        migrations = int(sql(lab, vm, work, "SELECT count(*) FROM flyway_schema_history WHERE type='SQL' AND success"))
        assert migrations == 548
        receipt = {'phase': phase, 'result': 'PASS', 'migrations': migrations, 'propertyPointCountAfterDuplicate': initial,
                   'queryCommandId': accepted['id'], 'queryStatus': result['status'], 'queryReply': result,
                   'crossTenantRead': '404', 'appRoleWithoutScopeDeviceCount': no_context,
                   'appRoleWithScopeDeviceCount': correct_scope,
                   'history': history, 'shadow': shadow, 'syntheticPeer': True, 'realPhysicalDevice': 'NOTRUN'}
        private_json(work / (phase + '-progress.json'), receipt)
        if not restart:
            control = api.call('POST', path + '/commands', {'commandKey': 'jt808_unlock', 'input': {}}, 202,
                               'unlock', {'Idempotency-Key': 'jt808-' + fixture['run'] + '-unlock'})
            message, serial, body = lock.receive(20)
            assert message == 0x8500 and body == b'\x01\x00'
            lock.send(0x0001, struct.pack('>HHB', serial, 0x8500, 0))
            wait_for(lambda: api.call('GET', path + '/commands/' + control['id']), lambda value: value['status'] == 'ACKNOWLEDGED')
            lock.send(0x0200, location(False), 102)
            assert lock.receive()[2][-1] == 0
            assert api.call('GET', path + '/commands/' + control['id'])['status'] != 'SUCCEEDED'
            # 真正经过原状态机的时间窗口，期间不能收到第二次物理控制。
            until = time.monotonic() + 65
            final = None
            while time.monotonic() < until:
                try:
                    observed = lock.receive(1.5)
                    if observed[0] == 0x8500:
                        raise AssertionError('原命令重试造成重复物理控制')
                except socket.timeout:
                    pass
                final = api.call('GET', path + '/commands/' + control['id'])
                if final['status'] in ('FAILED', 'TIMED_OUT'):
                    break
                time.sleep(.8)
            assert final['status'] in ('FAILED', 'TIMED_OUT'), final['status']
            fixture['controlId'] = control['id']
            private_json(work / 'fixture.json', fixture)
            receipt.update(controlCommandId=control['id'], controlFinalStatus=final['status'], controlWireCount=1)
        return receipt
    finally:
        lock.close()


def revoke(lab, data, vm, work):
    fixture = json.loads((work / 'fixture.json').read_text())
    api = Api(work, 'owner')
    api.token = fixture['owner']['token']
    api.refresh_if_needed('revoke')
    fixture['owner']['token'] = api.token
    private_json(work / 'fixture.json', fixture)
    peer = Lock(data)
    wrong = None
    try:
        peer.authenticate((work / 'peer-token.bin').read_bytes())
        # 无效六字节鉴权码的负例，不读取或构造平台身份。
        wrong = Lock(data)
        wrong.send(0x0102, bytes(6))
        kind, _, body = wrong.receive()
        assert kind == 0x8001 and body[-1] != 0
        wrong.close()
        wrong = None
        device = fixture['device']['id']
        query = "SELECT count(*) FROM ts_property_point WHERE device_id='" + device + "'"
        before = int(sql(lab, vm, work, query))
        api.call('DELETE', fixture['devicePath'] + '/credentials/' + fixture['credential']['id'],
                 expected=204, label='credential-revoke')
        assert api.call('GET', fixture['devicePath'] + '/credentials') == []
        peer.send(0x0002)
        try:
            peer.receive(5)
        except (EOFError, ConnectionResetError):
            pass
        else:
            raise AssertionError('撤销后原连接仍获得心跳成功应答')
        after = int(sql(lab, vm, work, query))
        assert before == after
        return {'phase': 'revoke', 'result': 'PASS', 'badToken': 'REJECTED', 'publicCredentialDelete': 204,
                'remainingCredentials': 0, 'priorConnection': 'CLOSED_WITHOUT_ACK',
                'propertyPointCountBefore': before, 'propertyPointCountAfter': after, 'physicalDevice': 'NOTRUN'}
    finally:
        peer.close()
        if wrong:
            wrong.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['prepare', 'exercise', 'restart', 'revoke'])
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    if args.receipt.exists() or args.receipt.is_symlink():
        raise FileExistsError('回执已存在，拒绝覆盖原始证据；请指定新的外盘文件名')
    lab = runpy.run_path(str(ROOT / 'scripts/jt808-runtime-lab.py'), run_name='lab')
    data, home, vm, work = lab['layout']()
    lab['doctor'](data, home, vm, work)
    if not args.receipt.resolve().is_relative_to(data):
        raise ValueError('回执必须外置')
    if args.phase == 'prepare':
        result = setup(work)
    elif args.phase == 'revoke':
        result = revoke(lab, data, vm, work)
    else:
        result = exercise(lab, data, vm, work, args.phase == 'restart')
    result['probeSourceSha256'] = SOURCE_SHA256
    process = json.loads((work / 'runtime-process.json').read_text())
    result['jarSha256'] = process['jarSha256']
    result['runtimeConfigurationSha256'] = process['configurationSha256']
    private_json(args.receipt, result)
    print('JT808真实运行时联调：' + args.phase + ' PASS')


if __name__ == '__main__':
    main()

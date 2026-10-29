#!/usr/bin/env python3
"""两个实际JAR、外盘中间件和本机JSON第三方验证；只使用合成锁，不启动公网或实物动作。"""
import argparse
import base64
import datetime as dt
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import runpy
import secrets
import signal
import socket
import ssl
import subprocess
import threading
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    args = parser.parse_args()
    if not args.run.replace('-', '').isalnum():
        raise ValueError('非法运行标识')
    lab = runpy.run_path(str(ROOT / 'scripts/jt808-runtime-lab.py'), run_name='lab')
    data, home, vm, work = lab['layout']()
    proof = lab['doctor'](data, home, vm, work)
    probe = runpy.run_path(str(ROOT / 'scripts/jt808-runtime-probe.py'), run_name='probe')
    evidence = data / '.private/deployment-session/http-lock-log-20261028'
    run = data / ('.private/workspaces/http-lock-log-runtime-' + args.run)
    run.mkdir(mode=0o700)
    for name in ('tmp', 'journal', 'state', 'service-logs', 'cloud-logs'):
        (run / name).mkdir(mode=0o700)
    for port in (18280, 18281, 16808, 18884):
        with socket.socket() as sock:
            if sock.connect_ex(('127.0.0.1', port)) == 0:
                raise ValueError('测试端口已占用，不接管现有进程')
    requests = []
    lock = threading.Lock()

    class Partner(BaseHTTPRequestHandler):
        def receive(self):
            body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            record = {'method': self.command, 'path': self.path, 'eventId': self.headers.get('X-Jagonzn-Event-Id'),
                      'idempotencyKey': self.headers.get('Idempotency-Key'), 'body': body}
            with lock:
                requests.append(record)
                with (run / 'partner-requests.jsonl').open('a') as output:
                    (run / 'partner-requests.jsonl').chmod(0o600)
                    output.write(json.dumps(record, ensure_ascii=False) + '\n')
            response = json.dumps({'received': True, 'code': 0, 'eventId': record['eventId']}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response)))
            self.end_headers()
            self.wfile.write(response)
        do_POST = receive
        do_PUT = receive
        def log_message(self, *unused):
            pass

    partner = ThreadingHTTPServer(('127.0.0.1', 0), Partner)
    partner_thread = threading.Thread(target=partner.serve_forever, daemon=True)
    partner_thread.start()
    children = []
    app_record = json.loads((work / 'runtime-process.json').read_text())
    original = dict(line.split('=', 1) for line in Path(app_record['configuration']).read_text().splitlines() if '=' in line)
    fixture = json.loads((work / 'fixture.json').read_text())
    database = json.loads((evidence / 'test-database.json').read_text())
    source = str(uuid.uuid4())
    key = secrets.token_bytes(32)
    project = fixture['owner']['project']['id']
    tenant = fixture['owner']['identity']['tenantId']
    service_jar = data / '.private/workspaces/http-lock-log-service-verified/jagonzn-service-0.0.1-SNAPSHOT.jar'
    cloud_jar = data / '.private/workspaces/http-lock-log-cloud-verified/jagonzn-cloud-0.0.1-SNAPSHOT.jar'
    trust = run / 'trust.p12'
    subprocess.run(['keytool', '-importcert', '-noprompt', '-alias', 'local-lab', '-file', str(work / 'tls/cert.pem'), '-keystore', str(trust), '-storepass', 'changeit'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    trust.chmod(0o600)

    def properties(name, values):
        path = run / (name + '.properties')
        with path.open('x') as output:
            path.chmod(0o600)
            output.write(''.join(k + '=' + str(v) + '\n' for k, v in values.items()))
        return path

    def start(name, jar, config, port):
        log = run / (name + '.log')
        env = os.environ.copy()
        env.update(JAGONZN_SERVICE_LOG_PATH=str(run / 'service-logs'), JAGONZN_CLOUD_LOG_PATH=str(run / 'cloud-logs'), TMPDIR=str(run / 'tmp'))
        with log.open('x') as output:
            log.chmod(0o600)
            process = subprocess.Popen(['java', '-Xmx768m', '-Djava.io.tmpdir=' + str(run / 'tmp'), '-Djavax.net.ssl.trustStore=' + str(trust), '-Djavax.net.ssl.trustStorePassword=changeit', '-DsocksNonProxyHosts=localhost|127.0.0.1', '-Dhttp.nonProxyHosts=localhost|127.0.0.1', '-jar', str(jar), '--spring.config.additional-location=file:' + str(config)], cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        children.append(process)
        for _ in range(180):
            if process.poll() is not None:
                raise RuntimeError(name + '启动失败，首因见外盘日志')
            try:
                with urllib.request.urlopen('https://127.0.0.1:' + str(port) + '/actuator/health', context=ssl.create_default_context(cafile=str(work / 'tls/cert.pem')), timeout=1) as response:
                    if response.status == 200:
                        return process
            except Exception:
                pass
            time.sleep(.3)
        raise RuntimeError(name + '未就绪')

    result = {'run': args.run, 'result': 'FAIL', 'physicalDevice': 'NOTRUN', 'sourceDeploymentId': source,
              'jarHashes': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in [service_jar, cloud_jar]}, 'environment': proof}
    try:
        original.update({'jagonzn.jt808.enabled': 'false', 'jagonzn.jt808.logs.enabled': 'false', 'jagonzn.jt808.logs.delivery-enabled': 'false'})
        bootstrap = start('bootstrap', service_jar, properties('bootstrap', original), 18280)
        api = probe['Api'](work, 'owner')
        api.token = fixture['owner']['token']
        api.refresh_if_needed('http-log-smoke-' + args.run)
        prefix = '/api/v1/projects/' + project
        device = api.call('POST', prefix + '/devices', {'deviceTypeId': fixture['deviceType']['id'], 'deviceKey': 'jt808-http-json-test', 'name': 'JT808 JSON synthetic peer'}, 201, 'http-log-smoke-device')
        path = prefix + '/devices/' + device['id']
        credential = api.call('POST', path + '/credentials', expected=201, label='http-log-smoke-credential')
        access = api.call('GET', path + '/access-config')
        if not access['enabled'] or access['protocol'] != 'TCP':
            api.call('PUT', path + '/access-config', {'protocol': 'TCP', 'enabled': True, 'expectedConfigVersion': access['configVersion']}, 200, 'http-log-smoke-tcp')
        bootstrap.send_signal(signal.SIGTERM)
        bootstrap.wait(timeout=30)
        targets = []
        for method in ('POST', 'PUT'):
            targets.append({'id': 'runtime-' + method.lower(), 'revision': 1, 'sourceDeploymentId': source, 'tenantId': tenant, 'projectId': project,
                            'url': 'http://127.0.0.1:' + str(partner.server_port) + '/partner/' + method.lower(), 'method': method,
                            'eventTypes': ['jagonzn.lock.log'], 'headers': {}, 'secretHeaderEnvironment': {},
                            'fieldMappings': {'lockCode': '/deviceId', 'operation': '/payload/logType', 'at': '/occurredAt'} if method == 'POST' else {},
                            'constants': {}, 'successStatuses': [200], 'successPointer': '/received', 'successValue': True,
                            'idempotencySupported': True, 'maxAttempts': 3, 'timeoutSeconds': 3, 'loopbackTest': True})
        targets_file = run / 'targets.json'
        probe['private_json'](targets_file, targets)
        cloud = {'server.address': '127.0.0.1', 'server.port': '18281', 'server.ssl.enabled': 'true',
                 'server.ssl.certificate': str(work / 'tls/cert.pem'), 'server.ssl.certificate-private-key': str(work / 'tls/key.pem'),
                 'spring.datasource.url': 'jdbc:postgresql://127.0.0.1:25432/' + database['database'], 'spring.datasource.username': database['user'], 'spring.datasource.password': database['password'],
                 'jagonzn.cloud.service-events.enabled': 'true', 'jagonzn.cloud.service-events.source-deployment-id': source,
                 'jagonzn.cloud.service-events.tenant-id': tenant, 'jagonzn.cloud.service-events.project-id': project,
                 'jagonzn.cloud.service-events.key-id': 'runtime', 'jagonzn.cloud.service-events.secret-base64': base64.b64encode(key).decode(),
                 'jagonzn.cloud.http-delivery.enabled': 'true', 'jagonzn.cloud.http-delivery.targets-file': str(targets_file),
                 'jagonzn.cloud.http-delivery.loopback-test': 'true', 'jagonzn.cloud.http-delivery.poll-millis': '250'}
        start('cloud', cloud_jar, properties('cloud', cloud), 18281)
        binding = {'terminal.id': '0000000000000001', 'bluetooth.mac.hex': '001122334455',
                   'platform.project-key': fixture['owner']['project']['projectKey'], 'platform.device-key': device['deviceKey'],
                   'platform.secret': credential['plainSecret'], 'model.version': fixture['model']['versionNumber'],
                   'enrollment.until': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=15)).isoformat(),
                   'property.door_closed': 'door_closed', 'property.battery_percent': 'battery_percent'}
        binding_file = properties('binding', binding)
        # 新候选须先独立固定空日志目录与发送边界，不能因继承旧环境变量而补交其他日志。
        scope_file = run / 'service-log-delivery-scope.json'
        probe['private_json'](scope_file, {
            'schemaVersion': 1, 'scopeId': str(uuid.uuid4()), 'mode': 'NEW_ONLY',
            'journalDirectory': str((run / 'journal').resolve()),
            'cloudUrl': 'https://127.0.0.1:18281/api/v1/internal/service-events',
            'sourceDeploymentId': source, 'tenantId': tenant, 'projectId': project, 'deviceId': device['id'],
            'afterSequence': 0, 'receivedNotBefore': (dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=30)).isoformat(),
            'receivedNotAfter': (dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=15)).isoformat(),
            'logTypes': ['REGISTERED', 'AUTHENTICATED', 'UNLOCK_REPORTED', 'LOCK_REPORTED']})
        original.update({'jagonzn.jt808.enabled': 'true', 'jagonzn.jt808.binding-file': str(binding_file), 'jagonzn.jt808.state-directory': str(run / 'state'),
                         'jagonzn.jt808.logs.enabled': 'true', 'jagonzn.jt808.logs.directory': str(run / 'journal'),
                         'jagonzn.jt808.logs.delivery-enabled': 'true', 'jagonzn.jt808.logs.poll-millis': '250',
                         'jagonzn.jt808.logs.delivery-scope-file': str(scope_file),
                         'jagonzn.cloud.private-delivery.url': 'https://127.0.0.1:18281/api/v1/internal/service-events',
                         'jagonzn.cloud.private-delivery.source-deployment-id': source, 'jagonzn.cloud.private-delivery.key-id': 'runtime',
                         'jagonzn.cloud.private-delivery.secret-base64': base64.b64encode(key).decode()})
        start('service', service_jar, properties('service', original), 18280)
        peer = probe['Lock'](data)
        try:
            registration = bytearray(59)
            registration[29:35] = bytes.fromhex('001122334455')
            registration[36] = 2
            peer.send(0x0100, bytes(registration))
            kind, _, response = peer.receive()
            assert kind == 0x8100 and response[2] == 0
            peer.authenticate(response[3:])
            def report(reason, closed):
                body = bytearray(probe['location'](closed))
                body[31] = (reason << 1) | int(closed)
                return bytes(body)
            opened = report(1, False)
            peer.send(0x0200, opened, 100)
            assert peer.receive()[2][-1] == 0
            peer.send(0x0200, report(2, True), 101)
            assert peer.receive()[2][-1] == 0
            peer.send(0x0200, opened, 100)
            assert peer.receive()[2][-1] == 0
            until = time.monotonic() + 30
            while time.monotonic() < until:
                with lock:
                    copies = list(requests)
                operations = [(r['method'], r['body'].get('operation') if r['method'] == 'POST' else r['body'].get('payload', {}).get('logType')) for r in copies]
                if all((method, operation) in operations for method in ('POST', 'PUT') for operation in ('UNLOCK_REPORTED', 'LOCK_REPORTED')):
                    break
                time.sleep(.2)
            else:
                raise RuntimeError('日志三段链路未完成，保留全部原件')
            for method in ('POST', 'PUT'):
                for operation in ('UNLOCK_REPORTED', 'LOCK_REPORTED'):
                    assert operations.count((method, operation)) == 1
            cloud_env = os.environ.copy()
            cloud_env['PGPASSWORD'] = database['password']
            pg, _ = lab['container'](vm, work, 'postgres')
            facts = None
            for _ in range(100):
                query = "BEGIN READ ONLY; SELECT json_build_object('inbox',(SELECT count(*) FROM cloud_service_event_inbox WHERE source_deployment_id='" + source + "'),'deliveries',(SELECT count(*) FROM cloud_http_log_delivery WHERE source_deployment_id='" + source + "'),'delivered',(SELECT count(*) FROM cloud_http_log_delivery WHERE source_deployment_id='" + source + "' AND state='DELIVERED')); COMMIT;"
                raw = lab['run'](lab['docker_command'](vm, work) + ['exec', '--env', 'PGPASSWORD', pg, 'psql', '-X', '-U', database['user'], '-d', database['database'], '-Atqc', query], env=cloud_env)
                facts = json.loads(raw.decode().strip())
                if facts['inbox'] == 4 and facts['deliveries'] == facts['delivered'] == 8 and len(list((run / 'journal').glob('*.accepted'))) == 4:
                    break
                time.sleep(.2)
            else:
                raise RuntimeError('第三方已接收但交付状态未全部提交，保留原件')
            source_events = [json.loads(p.read_text()) for p in (run / 'journal').glob('log-*.json')]
            assert sorted(e['sourceSequence'] for e in source_events) == [1, 2, 3, 4]
            assert '接收成功_来源事件已持久保存' in (run / 'cloud.log').read_text()
            assert '发送成功_第三方已按合同接收' in (run / 'cloud.log').read_text()
            result['databaseFacts'] = facts
            result.update(result='PASS', syntheticDeviceId=device['id'], operations=operations, partnerRequestCount=len(copies), duplicateProducedNoSecondLog=True,
                          cloudSignedHttpsReception='PASS', realPostPutJsonDelivery='PASS', physicalControlCommandsSent=0,
                          consoleJsonEvidence={'service': str(run / 'service.log'), 'cloud': str(run / 'cloud.log'), 'thirdParty': str(run / 'partner-requests.jsonl')})
        finally:
            peer.close()
    finally:
        for process in reversed(children):
            if process.poll() is None:
                process.send_signal(signal.SIGTERM)
                process.wait(timeout=30)
        partner.shutdown()
        partner.server_close()
        result['ownProcessesStopped'] = True
        result['runDirectory'] = str(run)
        probe['private_json'](evidence / ('runtime-' + args.run + '.json'), result)
    print('packaged JSON log flow PASS; evidence=' + str(run))


if __name__ == '__main__':
    main()

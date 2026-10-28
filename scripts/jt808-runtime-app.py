#!/usr/bin/env python3
"""从源码工作目录启动固定JAR的独立本机联调进程，配置、临时文件与日志均在外盘。"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import signal
import ssl
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def load_lab():
    return runpy.run_path(str(ROOT / 'scripts/jt808-runtime-lab.py'), run_name='jagonzn_lab')


def check_process(record):
    pid = record['pid']
    process = subprocess.run(['ps', '-ww', '-p', str(pid), '-o', 'stat=', '-o', 'command='], capture_output=True, text=True)
    if process.returncode:
        return False
    # SIGTERM后短暂僵尸进程已无监听/执行能力，不能误判为PID被他人接管。
    fields = process.stdout.strip().split(None, 1)
    if fields and fields[0].startswith('Z'):
        return False
    if str(record['jar']) not in process.stdout or str(record['configuration']) not in process.stdout:
        raise ValueError('PID已不属于本轮Jagonzn测试进程，拒绝操作')
    return True


def prepare(data, work, mode):
    values = dict(line.split('=', 1) for line in (work / 'credentials.env').read_text().splitlines() if line)
    secret = lambda name: values['JAGONZN_LAB_' + name]
    jdbc = 'jdbc:postgresql://127.0.0.1:25432/jagonzn'
    config = {
        'server.address': '127.0.0.1', 'server.port': '18280',
        'server.ssl.enabled': 'true', 'server.ssl.certificate': str(work / 'tls/cert.pem'),
        'server.ssl.certificate-private-key': str(work / 'tls/key.pem'),
        'spring.datasource.url': jdbc, 'spring.datasource.username': 'jagonzn_app',
        'spring.datasource.password': secret('DB_APP_PASSWORD'),
        'spring.flyway.url': jdbc, 'spring.flyway.user': 'jagonzn', 'spring.flyway.password': secret('DB_OWNER_PASSWORD'),
        'spring.flyway.placeholders.app_role_password': secret('DB_APP_PASSWORD'),
        'things-link.datasource.control.maximum-pool-size': '2', 'things-link.datasource.control.minimum-idle': '0',
        'things-link.datasource.data.maximum-pool-size': '4', 'things-link.datasource.data.minimum-idle': '0',
        'spring.data.redis.host': '127.0.0.1', 'spring.data.redis.port': '26379', 'spring.data.redis.password': secret('REDIS_PASSWORD'),
        'spring.data.redis.timeout': '2s', 'spring.data.redis.connect-timeout': '2s',
        'spring.kafka.bootstrap-servers': '127.0.0.1:39092', 'spring.kafka.admin.auto-create': 'false',
        'spring.kafka.listener.auto-startup': 'true',
        'things-link.security.jwt.secret': secret('JWT_SECRET'), 'things-link.security.app-jwt.secret': secret('APP_JWT_SECRET'),
        'things-link.security.broker-callback.secret': secret('BROKER_CALLBACK_SECRET'),
        'things-link.notification.webhook.signing-secret': secret('NOTIFICATION_SECRET'),
        'things-link.storage.internal-endpoint': 'http://127.0.0.1:29000',
        'things-link.storage.external-endpoint': 'http://127.0.0.1:29000',
        'things-link.storage.access-key': 'jagonzn_lab_app', 'things-link.storage.secret-key': secret('S3_APP_PASSWORD'),
        'things-link.ingestion.emqx-api.base-url': 'http://127.0.0.1:48083',
        'things-link.device.emqx-session-api.base-url': 'http://127.0.0.1:48083',
        'things-link.ingress.handoff.broker-uri': 'tcp://127.0.0.1:41883',
        'spring.mail.host': '127.0.0.1', 'spring.mail.port': '21025',
        'spring.mail.username': 'jt808@jagonzn.test', 'spring.mail.password': '',
        'spring.mail.properties.mail.smtp.auth': 'false', 'spring.mail.properties.mail.smtp.ssl.enable': 'false',
        'spring.mail.properties.mail.smtp.starttls.enable': 'false', 'things-link.mail.from': 'jt808@jagonzn.test',
        'things-link.access.tcp.enabled': 'true', 'things-link.access.tcp.bind-address': '127.0.0.1',
        'things-link.access.tcp.port': '18884', 'things-link.access.tls.certificate': (work / 'tls/cert.pem').as_uri(),
        'things-link.access.tls.private-key': (work / 'tls/key.pem').as_uri(),
        'jagonzn.jt808.enabled': 'false' if mode == 'bootstrap' else 'true',
        'jagonzn.jt808.bind-address': '127.0.0.1', 'jagonzn.jt808.port': '16808',
        'jagonzn.jt808.external-root': str(data),
        'jagonzn.jt808.crypto-file': str(data / '.private/ci-tools/jt808/document-crypto.properties'),
        # 真机独立绑定及状态不复用模拟鉴权码或控制UNKNOWN。
        'jagonzn.jt808.binding-file': str(work / ('real-device/binding.properties' if mode == 'real-device' else 'binding.properties')),
        'jagonzn.jt808.state-directory': str(work / ('real-device/state' if mode == 'real-device' else 'jt808-state')),
    }
    tls = work / 'tls'
    tls.mkdir(mode=0o700, exist_ok=True)
    if not (tls / 'key.pem').exists() and not (tls / 'cert.pem').exists():
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '7',
                        '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
                        '-keyout', str(tls / 'key.pem'), '-out', str(tls / 'cert.pem')],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        (tls / 'key.pem').chmod(0o600)
    if not (tls / 'key.pem').exists() or not (tls / 'cert.pem').exists():
        raise ValueError('TLS测试原件不完整，拒绝覆盖')
    for name in ('tmp', 'logs', 'jt808-state'):
        (work / name).mkdir(mode=0o700, exist_ok=True)
    number = len(list(work.glob('runtime-' + mode + '-*.properties'))) + 1
    path = work / ('runtime-' + mode + '-%04d.properties' % number)
    with path.open('x') as output:
        path.chmod(0o600)
        output.write('\n'.join(key + '=' + value for key, value in config.items()) + '\n')
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'stop', 'status'])
    parser.add_argument('--mode', choices=['bootstrap', 'jt808', 'real-device'], default='bootstrap')
    parser.add_argument('--jar', type=Path)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    if args.receipt.exists() or args.receipt.is_symlink():
        raise FileExistsError('回执已存在，拒绝覆盖原始证据；请指定新的外盘文件名')
    lab = load_lab()
    data, home, vm, work = lab['layout']()
    if not args.receipt.resolve().is_relative_to(data):
        raise ValueError('回执必须外置')
    lab['doctor'](data, home, vm, work)
    pidfile = work / 'runtime-process.json'
    old = json.loads(pidfile.read_text()) if pidfile.exists() else None
    running = bool(old and check_process(old))
    if args.action == 'stop':
        if running:
            os.kill(old['pid'], signal.SIGTERM)
            for _ in range(150):
                if not check_process(old):
                    break
                time.sleep(.2)
            else:
                raise RuntimeError('测试进程尚未退出，不强杀或覆盖原件')
        args.receipt.write_text(json.dumps({'stopped': True, 'process': old}, indent=2) + '\n')
        print('独立联调进程已停止，资源和原件保留')
        return
    if args.action == 'status':
        args.receipt.write_text(json.dumps({'running': running, 'process': old}, indent=2) + '\n')
        print('独立联调进程运行状态：' + str(running))
        return
    if running:
        raise ValueError('已有本轮测试进程运行，请先显式停止，不能覆盖其配置')
    if not args.jar or not args.jar.resolve().is_relative_to(data) or not args.jar.is_file():
        raise ValueError('必须指定外盘固定JAR')
    binding = work / ('real-device/binding.properties' if args.mode == 'real-device' else 'binding.properties')
    if args.mode != 'bootstrap' and not binding.is_file():
        raise ValueError('尚未通过真实API建立所选设备的专用绑定')
    configuration = prepare(data, work, args.mode)
    jar = args.jar.resolve()
    digest = hashlib.sha256(jar.read_bytes()).hexdigest()
    previous = sorted(work.glob('console-' + args.mode + '-*.log'))
    log = work / ('console-' + args.mode + '-%04d.log' % (len(previous) + 1))
    env = os.environ.copy()
    env.update(JAGONZN_SERVICE_LOG_PATH=str(work / 'logs'), TMPDIR=str(work / 'tmp'))
    command = ['java', '-Xmx1024m', '-Djava.io.tmpdir=' + str(work / 'tmp'),
               '-XX:ErrorFile=' + str(work / 'logs/hs_err_pid%p.log'),
               '-XX:HeapDumpPath=' + str(work / 'logs'), '-DsocksNonProxyHosts=localhost|127.0.0.1',
               '-Dhttp.nonProxyHosts=localhost|127.0.0.1', '-jar', str(jar),
               '--spring.config.additional-location=file:' + str(configuration)]
    with log.open('x') as output:
        log.chmod(0o600)
        process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
    record = {'pid': process.pid, 'jar': str(jar), 'jarSha256': digest, 'configuration': str(configuration),
              'configurationSha256': hashlib.sha256(configuration.read_bytes()).hexdigest(), 'mode': args.mode, 'consoleLog': str(log)}
    pidfile.write_text(json.dumps(record, indent=2) + '\n')
    for _ in range(240):
        if process.poll() is not None:
            raise RuntimeError('真实运行时启动失败，退出码=' + str(process.returncode) + '，首败见外盘console日志')
        try:
            with urllib.request.urlopen('https://127.0.0.1:18280/actuator/health', timeout=2,
                                        context=ssl.create_default_context(cafile=str(work / 'tls/cert.pem'))) as response:
                if response.status == 200:
                    args.receipt.write_text(json.dumps(record, indent=2) + '\n')
                    print('真实Jagonzn运行时已在本机启动，健康入口可响应；不据此认领JT808链路通过')
                    return
        except Exception:
            pass
        time.sleep(.5)
    raise RuntimeError('健康检查等待超时，保留进程和日志供诊断')


if __name__ == '__main__':
    main()

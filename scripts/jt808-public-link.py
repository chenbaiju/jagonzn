#!/usr/bin/env python3
"""管理单一临时JT808公网TCP转发；不上传JAR、不修改线上ThingsLink配置或SSH全局策略。"""
import argparse
import json
import os
from pathlib import Path
import runpy
import shlex
import signal
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
UNIT = 'jagonzn-jt808-relay'
HOST = 'thingslink-recovery'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'status', 'stop'])
    parser.add_argument('--ssh-config', type=Path, default=Path.home() / '.ssh/thingslink-recovery.conf')
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    if args.receipt.exists() or args.receipt.is_symlink():
        raise FileExistsError('拒绝覆盖原始回执')
    lab = runpy.run_path(str(ROOT / 'scripts/jt808-runtime-lab.py'), run_name='lab')
    data, home, vm, work = lab['layout']()
    if not args.receipt.resolve().is_relative_to(data):
        raise ValueError('回执必须外置')
    private = work / 'real-device'
    private.mkdir(mode=0o700, exist_ok=True)
    ssh = ['ssh', '-F', str(args.ssh_config), '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10']
    resolved = dict(line.split(' ', 1) for line in lab['run'](ssh + ['-G', HOST]).decode().splitlines() if ' ' in line)
    address = resolved['hostname']
    state_file = private / 'public-link.json'
    state = json.loads(state_file.read_text()) if state_file.exists() else None

    def remote(arguments):
        return lab['run'](ssh + [HOST, shlex.join(arguments)]).decode()

    def live():
        if not state:
            return False
        process = subprocess.run(['ps', '-ww', '-p', str(state['pid']), '-o', 'command='], capture_output=True, text=True)
        if process.returncode:
            return False
        if '127.0.0.1:26808:127.0.0.1:16808' not in process.stdout or HOST not in process.stdout:
            raise ValueError('PID归属不匹配，拒绝操作')
        return True

    running = live()
    if args.action == 'start':
        if running:
            raise ValueError('已有本项目隧道，不重复创建')
        # 首次只在未占用的端口及未存在的专属单位创建，失败不覆盖任何线上监听。
        before = remote(['sudo', '-n', 'ss', '-lntH', '( sport = :6808 or sport = :26808 )'])
        if before.strip():
            raise ValueError('公网或回环转发端口已占用，拒绝覆盖')
        unit = remote(['systemctl', 'show', UNIT + '.socket', '-p', 'LoadState', '--value']).strip()
        if unit != 'not-found':
            raise ValueError('专属socket单位已存在，拒绝覆盖')
        log = private / ('ssh-tunnel-' + str(time.time_ns()) + '.log')
        command = ssh + ['-N', '-T', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15',
                         '-o', 'ServerAliveCountMax=3', '-R', '127.0.0.1:26808:127.0.0.1:16808', HOST]
        with log.open('x') as output:
            log.chmod(0o600)
            process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        state = {'pid': process.pid, 'host': HOST, 'address': address, 'port': 6808, 'loopbackPort': 26808,
                 'localTarget': '127.0.0.1:16808', 'unit': UNIT, 'log': str(log), 'maxDurationHours': 4, 'createConfirmed': False}
        state_file.write_text(json.dumps(state, indent=2) + '\n')
        state_file.chmod(0o600)
        # 等待远端回环端口权威可见，不能仅凭本机ssh进程存在认定隧道成功。
        for _ in range(15):
            if process.poll() is not None:
                raise RuntimeError('SSH隧道启动失败，保留外盘日志')
            if remote(['sudo', '-n', 'ss', '-lntH', 'sport = :26808']).strip():
                break
            time.sleep(.2)
        else:
            raise RuntimeError('回环端口未就绪，保留进程，不盲重建')
        remote(['sudo', '-n', 'systemd-run', '--unit=' + UNIT, '--description=Jagonzn JT808 temporary TCP relay',
                '--socket-property=ListenStream=0.0.0.0:6808', '--socket-property=Backlog=32',
                '--property=DynamicUser=yes', '--property=NoNewPrivileges=yes', '--property=ProtectSystem=strict',
                '--property=ProtectHome=yes', '--property=PrivateTmp=yes', '--property=StandardOutput=null', '--property=StandardError=null',
                '/usr/lib/systemd/systemd-socket-proxyd', '--connections-max=32', '127.0.0.1:26808'])
        remote(['sudo', '-n', 'systemd-run', '--unit=' + UNIT + '-expiry', '--on-active=4h',
                '--description=Jagonzn JT808 relay expiry', '/usr/bin/systemctl', 'stop', UNIT + '.socket', UNIT + '.service'])
        state['createConfirmed'] = True
        state_file.write_text(json.dumps(state, indent=2) + '\n')
    elif args.action == 'stop':
        if not state or not state.get('createConfirmed'):
            raise ValueError('无已确认归属原件，请先只读核对，不自动停止未知单位')
        description = remote(['systemctl', 'show', UNIT + '.socket', '-p', 'Description', '--value']).strip()
        if description != 'Jagonzn JT808 temporary TCP relay':
            raise ValueError('远端单位归属不匹配，拒绝操作')
        remote(['sudo', '-n', 'systemctl', 'stop', UNIT + '-expiry.timer', UNIT + '.socket', UNIT + '.service'])
        if running:
            os.kill(state['pid'], signal.SIGTERM)
            for _ in range(30):
                if not live():
                    break
                time.sleep(.1)
    status = remote(['sudo', '-n', 'ss', '-lntH', '( sport = :6808 or sport = :26808 )'])
    result = {'action': args.action, 'address': address, 'port': 6808, 'remoteListeners': status.splitlines(),
              'tunnelRunning': live(), 'internetReachability': 'NOT_PROVEN_BY_LISTENER', 'state': state}
    args.receipt.write_text(json.dumps(result, indent=2) + '\n')
    args.receipt.chmod(0o600)
    print('JT808独立公网转发：' + args.action + '；公网可达性须另行实测')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""限定JT808专用端口的短期抓包，pcap经SSH直接写外盘；不保存到线上业务目录。"""
import argparse
import json
from pathlib import Path
import runpy
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'status'])
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    if args.receipt.exists() or args.receipt.is_symlink():
        raise FileExistsError('拒绝覆盖抓包回执')
    lab = runpy.run_path(str(ROOT / 'scripts/jt808-runtime-lab.py'), run_name='lab')
    data, home, vm, work = lab['layout']()
    if not args.receipt.resolve().is_relative_to(data):
        raise ValueError('抓包回执必须外置')
    target = work / 'real-device'
    state_file = target / 'capture-process.json'
    previous = json.loads(state_file.read_text()) if state_file.exists() else None
    if args.action == 'start':
        if previous:
            process = subprocess.run(['ps', '-ww', '-p', str(previous['pid']), '-o', 'stat=', '-o', 'command='], capture_output=True, text=True)
            if process.returncode == 0 and not process.stdout.strip().startswith('Z'):
                raise ValueError('已有记录的抓包进程，先只读核对，不重复启动')
        stamp = str(time.time_ns())
        pcap, log = target / ('wire-' + stamp + '.pcap'), target / ('capture-' + stamp + '.log')
        command = ['ssh', '-F', str(Path.home() / '.ssh/thingslink-recovery.conf'), '-o', 'BatchMode=yes',
                   'thingslink-recovery', "sudo -n timeout --signal=INT 1800 tcpdump -n -i any -s 65535 -U -c 1000 -w - 'tcp port 6808'"]
        with pcap.open('xb') as output, log.open('x') as errors:
            pcap.chmod(0o600)
            log.chmod(0o600)
            child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=errors, start_new_session=True)
        previous = {'pid': child.pid, 'pcap': str(pcap), 'log': str(log), 'maxPackets': 1000,
                    'maxSeconds': 1800, 'maxSnaplen': 65535, 'filter': 'tcp port 6808', 'remoteStorage': 'NONE, SSH stdout only'}
        state_file.write_text(json.dumps(previous, indent=2) + '\n')
        state_file.chmod(0o600)
        # 必须看到tcpdump已开始，单有ssh PID不能认领抓包就绪。
        for _ in range(50):
            if 'listening on' in log.read_text():
                break
            if child.poll() is not None:
                raise RuntimeError('抓包启动失败，首因保留在外盘专用日志')
            time.sleep(.1)
        else:
            raise RuntimeError('抓包就绪未知，不盲重试，检查原进程及日志')
    result = {'action': args.action, 'process': previous,
              'pcapBytes': Path(previous['pcap']).stat().st_size if previous else 0,
              'hardwareConnected': 'NOT_PROVEN_BY_CAPTURE_PROCESS', 'controlCommandsSent': 0}
    args.receipt.write_text(json.dumps(result, indent=2) + '\n')
    args.receipt.chmod(0o600)
    print('JT808专用端口外盘抓包：' + args.action + ' 完成；实际设备身份须另核对')


if __name__ == '__main__':
    main()

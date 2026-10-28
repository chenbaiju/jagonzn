#!/usr/bin/env python3
"""为真实锁具建立隔离绑定，并只读核对外盘状态；不发送控制命令。"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]


def prepare(data, work, probe):
    target = work / 'real-device'
    target.mkdir(mode=0o700, exist_ok=True)
    binding_file = target / 'binding.properties'
    if binding_file.exists():
        raise FileExistsError('真实绑定已存在，拒绝重新签发或覆盖；请使用inspect读取现有状态')
    device_input = data / '.private/deployment-session/jt808-development-20261028/device-input.json'
    hardware = json.loads(device_input.read_text())
    fixture = json.loads((work / 'fixture.json').read_text())
    api = probe['Api'](work, 'owner')
    api.token = fixture['owner']['token']
    api.refresh_if_needed('real-device-prepare')
    # 复用已发布型号和正常Free额度，通过平台API签发真机自己的身份。
    parent = '/api/v1/projects/' + fixture['owner']['project']['id']
    kind = fixture['deviceType']['id']
    device = api.call('POST', parent + '/devices', {
        'deviceTypeId': kind, 'deviceKey': 'jt808-real-' + hashlib.sha256(hardware['imei'].encode()).hexdigest()[:10],
        'name': 'ZN-DM08 V(A) physical test lock'}, 201, 'real-device-create')
    path = parent + '/devices/' + device['id']
    credential = api.call('POST', path + '/credentials', expected=201, label='real-device-credential')
    current = api.call('GET', path + '/access-config')
    if current['protocol'] != 'TCP' or not current['enabled']:
        api.call('PUT', path + '/access-config', {'protocol': 'TCP', 'enabled': True,
                 'expectedConfigVersion': current['configVersion']}, 200, 'real-device-tcp')
    model = api.call('GET', parent + '/device-types/' + kind + '/thing-model-versions/latest')
    assert model['versionNumber'] == fixture['model']['versionNumber']
    record = {'deviceId': device['id'], 'devicePath': path, 'projectId': fixture['owner']['project']['id'],
              'credentialId': credential['id'], 'modelVersion': model['versionNumber'], 'createdAt': dt.datetime.now(dt.timezone.utc).isoformat()}
    probe['private_json'](target / 'platform-reference.json', record)
    properties = {'terminal.id': hardware['terminalIdBcd16'], 'bluetooth.mac.hex': hardware['bluetoothMac'].replace(':', ''),
                  'platform.project-key': fixture['owner']['project']['projectKey'], 'platform.device-key': device['deviceKey'],
                  'platform.secret': credential['plainSecret'], 'model.version': model['versionNumber'],
                  'property.door_closed': 'door_closed', 'property.battery_percent': 'battery_percent'}
    # 首绑窗口由arm显式开启，准备数据本身不允许陌生注册。
    with binding_file.open('x') as output:
        binding_file.chmod(0o600)
        output.write(''.join(k + '=' + v + '\n' for k, v in properties.items()))
    (target / 'state').mkdir(mode=0o700, exist_ok=True)
    return {'result': 'PASS', 'phase': 'prepare-real-device', **record, 'bindingSha256': hashlib.sha256(binding_file.read_bytes()).hexdigest(),
            'enrollment': 'CLOSED_UNTIL_ARM', 'hardwareConnected': False, 'firmwareInteroperability': 'NOTRUN'}


def arm(work, minutes):
    # 应用启动前设置有限首绑窗口，保留每份原件；已有状态时不修改鉴权或命令证据。
    process = json.loads((work / 'runtime-process.json').read_text())
    import subprocess
    live = subprocess.run(['ps', '-ww', '-p', str(process['pid']), '-o', 'command='], capture_output=True, text=True)
    if live.returncode == 0 and process['configuration'] in live.stdout:
        raise ValueError('请先停止本轮应用再开启首绑窗口，防止内存配置与原件不一致')
    target = work / 'real-device'
    if (target / 'state/adapter-state.properties').exists():
        raise ValueError('已有真机协议状态，拒绝修改；应先只读核对实际接入结果')
    path = target / 'binding.properties'
    old = path.read_text()
    if 'enrollment.until=' in old:
        raise ValueError('已设置首绑窗口，拒绝自动续期或覆盖原件')
    until = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=minutes)
    backup = target / 'binding-before-enrollment.properties'
    with backup.open('x') as output:
        backup.chmod(0o600)
        output.write(old)
    temporary = target / 'binding-armed.properties'
    with temporary.open('x') as output:
        temporary.chmod(0o600)
        output.write(old + 'enrollment.until=' + until.isoformat() + '\n')
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary, path)
    return {'phase': 'arm-real-device', 'result': 'PASS', 'enrollmentUntil': until.isoformat(), 'minutes': minutes,
            'bindingSha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'hardwareConnected': False}


def inspect(work):
    target = work / 'real-device'
    path = target / 'state/adapter-state.properties'
    # Properties只读取低敏状态标志，不输出token、身份、消息体或任何原始值。
    text = path.read_text() if path.exists() else ''
    reference = json.loads((target / 'platform-reference.json').read_text()) if (target / 'platform-reference.json').exists() else {}
    return {'phase': 'inspect-real-device', 'result': 'PASS', 'deviceId': reference.get('deviceId'),
            'bindingPrepared': (target / 'binding.properties').exists(), 'adapterStateExists': path.exists(),
            'registrationTokenPersisted': any(line.startswith('token=') for line in text.splitlines()),
            'upstreamIdentityPinned': any(line.startswith('identity=') for line in text.splitlines()),
            'hardwareProvenance': 'requires wire capture and operator confirmation; state flags alone are insufficient'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'arm', 'inspect'])
    parser.add_argument('--minutes', type=int, default=30, choices=range(5, 121), metavar='5..120')
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    if args.receipt.exists() or args.receipt.is_symlink():
        raise FileExistsError('回执已存在，拒绝覆盖')
    lab = runpy.run_path(str(ROOT / 'scripts/jt808-runtime-lab.py'), run_name='lab')
    data, home, vm, work = lab['layout']()
    if not args.receipt.resolve().is_relative_to(data):
        raise ValueError('回执必须位于已核验外盘')
    lab['doctor'](data, home, vm, work)
    probe = runpy.run_path(str(ROOT / 'scripts/jt808-runtime-probe.py'), run_name='probe')
    result = prepare(data, work, probe) if args.action == 'prepare' else arm(work, args.minutes) if args.action == 'arm' else inspect(work)
    result['toolSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    probe['private_json'](args.receipt, result)
    print('JT808真实设备准备：' + args.action + ' 完成；未发送物理控制命令')


if __name__ == '__main__':
    main()

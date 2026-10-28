#!/usr/bin/env python3
"""管理JT808独立本机资源；固定外盘Lima守护进程，不切换或写入Docker Desktop。"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PROJECT = 'jagonzn-jt808-lab'


def layout():
    config = json.loads((ROOT / '.private/storage-management/storage.json').read_text())
    # 与Maven共用只读核验，禁止源码侧__pycache__。
    namespace = {'__file__': str(ROOT / 'scripts/check-storage.py'), '__name__': 'jagonzn_storage'}
    exec(compile((ROOT / 'scripts/check-storage.py').read_text(), namespace['__file__'], 'exec'), namespace)
    namespace['check']()
    data = Path(config['data_root']).resolve(strict=True)
    home = data / '.private/workspaces/lima'
    work = data / '.private/workspaces/jt808-runtime-lab'
    if work.is_symlink() or not work.is_dir() or not work.resolve().is_relative_to(data):
        raise ValueError('缺少已准备的外盘私有工作目录，拒绝自动回落或重建')
    metadata = work.stat()
    if metadata.st_uid != os.getuid() or metadata.st_mode & 0o077:
        raise ValueError('外盘工作目录须归当前用户所有且权限0700')
    return data, home, home / 'jt808', work


def docker_command(vm, work):
    # 每次显式指定守护进程，不执行context use，不继承共享DOCKER_HOST。
    return ['docker', '--config', str(work / 'docker-config'), '--host', 'unix://' + str(vm / 'sock/docker.sock')]


def run(arguments, **kwargs):
    result = subprocess.run(arguments, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError('命令失败，退出码=' + str(result.returncode) + ': ' + result.stderr.decode(errors='replace')[-1500:])
    return result.stdout


def doctor(data, home, vm, work):
    # 本轮固定的Lima 2.2.1/VZ使用单一raw disk文件，不能套旧版basedisk/diffdisk布局。
    for name in ('disk',):
        disk = vm / name
        if not disk.is_file() or not disk.resolve().is_relative_to(data):
            raise ValueError('虚拟磁盘不属于本机外盘测试根')
    env = os.environ.copy()
    env.update(LIMA_HOME=str(home), TMPDIR=str(data / '.private/workspaces/jt808-runtime-tmp'))
    lima = data / '.private/ci-tools/lima-2.2.1/bin/limactl'
    info = json.loads(run([str(lima), 'list', 'jt808', '--json'], env=env))
    if info['name'] != 'jt808' or Path(info['dir']).resolve() != vm or info['status'] != 'Running':
        raise ValueError('专用Lima实例不匹配或未运行')
    daemon = json.loads(run(docker_command(vm, work) + ['info', '--format', '{{json .}}']))
    if daemon['Name'] != 'lima-jt808' or daemon['DockerRootDir'] != '/var/lib/docker':
        raise ValueError('专用Docker守护进程身份不匹配')
    return {'instance': info['name'], 'vmDirectory': str(vm), 'vmType': info['vmType'],
            'dockerName': daemon['Name'], 'dockerId': daemon['ID'], 'dockerRootDir': daemon['DockerRootDir'],
            'serverVersion': daemon['ServerVersion'],
            'disks': {'disk': str((vm / 'disk').resolve())}}


def credentials(work):
    path = work / 'credentials.env'
    if not path.exists():
        names = ('DB_OWNER_PASSWORD', 'DB_APP_PASSWORD', 'REDIS_PASSWORD', 'S3_ROOT_PASSWORD', 'S3_APP_PASSWORD',
                 'JWT_SECRET', 'APP_JWT_SECRET', 'BROKER_CALLBACK_SECRET', 'NOTIFICATION_SECRET')
        with path.open('x') as output:
            path.chmod(0o600)
            output.write(''.join('JAGONZN_LAB_' + name + '=' + secrets.token_urlsafe(40) + '\n' for name in names))
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError('测试凭据必须是私有原件')
    return path


def compose(vm, work):
    return docker_command(vm, work) + ['compose', '--project-name', PROJECT, '--env-file', str(credentials(work)),
                                       '--file', str(ROOT / 'deploy/lab/jt808-compose.yml')]


def container(vm, work, service):
    ids = run(compose(vm, work) + ['ps', '--all', '--quiet', service]).decode().strip().splitlines()
    if len(ids) != 1:
        raise ValueError('专用测试容器数量不匹配：' + service)
    item = json.loads(run(docker_command(vm, work) + ['inspect', ids[0]]))[0]
    labels = item['Config']['Labels']
    if labels.get('com.docker.compose.project') != PROJECT or labels.get('io.jagonzn.lab') != 'jt808-runtime':
        raise ValueError('测试容器归属不匹配')
    return ids[0], item


def status(vm, work):
    result = {}
    for service in ('postgres', 'redis', 'redpanda', 'minio', 'mail'):
        identifier, item = container(vm, work, service)
        mounts = [{'name': mount.get('Name'), 'source': mount['Source'], 'target': mount['Destination']} for mount in item['Mounts']]
        if any(not mount['source'].startswith('/var/lib/docker/volumes/' + PROJECT + '_') for mount in mounts):
            raise ValueError('容器数据不在专用VM持久卷中')
        ports = item['NetworkSettings']['Ports']
        if any(binding['HostIp'] != '127.0.0.1' for bindings in ports.values() if bindings for binding in bindings):
            raise ValueError('本机测试端口不允许公网绑定')
        result[service] = {'id': identifier, 'imageId': item['Image'], 'state': item['State']['Status'],
                           'health': item['State'].get('Health', {}).get('Status'), 'ports': ports, 'mounts': mounts}
    return result


def topics(vm, work):
    identifier, _ = container(vm, work, 'redpanda')
    # v24.3通过管理配置接口关闭自动建主题，start不接受--set参数。
    run(docker_command(vm, work) + ['exec', identifier, 'rpk', 'cluster', 'config', 'set', 'auto_create_topics_enabled', 'false'])
    run(docker_command(vm, work) + ['exec', '-i', identifier, 'bash', '-s'],
        input=(ROOT / 'deploy/redpanda/init-topics.sh').read_bytes())


def buckets(vm, work):
    # 只在独立VM创建五个私桶和受限应用身份，凭据通过外盘env-file传递。
    script = '''set -eu
cat > /tmp/policy.json
mc alias set lab http://minio:9000 jagonzn_lab_root "$JAGONZN_LAB_S3_ROOT_PASSWORD" >/dev/null
for bucket in firmware device-image export backup jagonzn-ota; do
  mc mb --ignore-existing "lab/$bucket" >/dev/null
  mc anonymous set none "lab/$bucket" >/dev/null
done
mc version enable lab/firmware >/dev/null
mc version enable lab/jagonzn-ota >/dev/null
users=$(mc admin user list --json lab)
case "$users" in
  *'"accessKey":"jagonzn_lab_app"'*) :;;
  '') mc admin user add lab jagonzn_lab_app "$JAGONZN_LAB_S3_APP_PASSWORD" >/dev/null;;
  *) echo 'unknown MinIO users; refusing overwrite' >&2; exit 1;;
esac
mc admin policy create lab jagonzn-lab /tmp/policy.json >/dev/null
info=$(mc admin user info --json lab jagonzn_lab_app)
case "$info" in
  *'"policyName":"jagonzn-lab"'*) :;;
  *'"policyName":""'*) mc admin policy attach lab jagonzn-lab --user jagonzn_lab_app >/dev/null;;
  *'"policyName":'*) echo 'unknown MinIO policy; refusing overwrite' >&2; exit 1;;
  *'"accessKey":"jagonzn_lab_app"'*) mc admin policy attach lab jagonzn-lab --user jagonzn_lab_app >/dev/null;;
  *) echo 'unknown MinIO policy; refusing overwrite' >&2; exit 1;;
esac
mc alias set app http://minio:9000 jagonzn_lab_app "$JAGONZN_LAB_S3_APP_PASSWORD" >/dev/null
mc ls app/export >/dev/null
'''
    run(docker_command(vm, work) + ['run', '--rm', '-i', '--network', PROJECT + '_lab',
                                   '--env-file', str(credentials(work)), '--entrypoint', '/bin/sh',
                                   'minio/mc:RELEASE.2025-04-16T18-13-26Z', '-ec', script],
        input=(ROOT / 'deploy/minio/app-policy.json').read_bytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['doctor', 'up', 'status', 'stop'])
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    if args.receipt.exists() or args.receipt.is_symlink():
        raise FileExistsError('回执已存在，拒绝覆盖原始证据；请指定新的外盘文件名')
    data, home, vm, work = layout()
    if not args.receipt.resolve().is_relative_to(data):
        raise ValueError('回执必须在已核验外盘')
    proof = doctor(data, home, vm, work)
    if args.action == 'up':
        run(compose(vm, work) + ['config', '--quiet'])
        run(compose(vm, work) + ['up', '--detach', '--wait', '--wait-timeout', '240'])
        topics(vm, work)
        buckets(vm, work)
    elif args.action == 'stop':
        # 只停止本项目容器，不删卷或原件，不停止其他Docker守护进程。
        run(compose(vm, work) + ['stop'])
    if args.action in ('up', 'status', 'stop'):
        proof['containers'] = status(vm, work)
    proof['composeSha256'] = hashlib.sha256((ROOT / 'deploy/lab/jt808-compose.yml').read_bytes()).hexdigest()
    args.receipt.parent.mkdir(parents=True, exist_ok=True)
    args.receipt.write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n')
    print('JT808独立外盘测试资源：' + args.action + ' 完成')


if __name__ == '__main__':
    main()

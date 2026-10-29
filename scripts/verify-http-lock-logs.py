#!/usr/bin/env python3
"""只在已核验外盘VM准备独立cloud测试库并执行后端测试，保留原件、不清卷。"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import secrets
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('module', choices=['cloud', 'service'])
    parser.add_argument('--run', required=True)
    args = parser.parse_args()
    if not args.run.replace('-', '').isalnum():
        raise ValueError('运行标识只允许字母数字与连字符')
    lab = runpy.run_path(str(ROOT / 'scripts/jt808-runtime-lab.py'), run_name='lab')
    data, home, vm, work = lab['layout']()
    proof = lab['doctor'](data, home, vm, work)
    evidence = data / '.private/deployment-session/http-lock-log-20261028'
    credentials = evidence / 'test-database.json'
    if not credentials.exists():
        with credentials.open('x') as output:
            credentials.chmod(0o600)
            output.write(json.dumps({'database': 'jagonzn_cloud_http_20261028', 'user': 'jagonzn_cloud_http_20261028', 'password': secrets.token_hex(24)}))
    config = json.loads(credentials.read_text())
    database = config['database']
    if database != 'jagonzn_cloud_http_20261028' or config['user'] != database or len(config['password']) != 48 or any(c not in '0123456789abcdef' for c in config['password']):
        raise ValueError('测试库凭据归属或格式不匹配，拒绝执行SQL')
    owner = dict(line.split('=', 1) for line in (work / 'credentials.env').read_text().splitlines() if line)
    identifier, _ = lab['container'](vm, work, 'postgres')
    docker = lab['docker_command'](vm, work)
    env = os.environ.copy()
    env['PGPASSWORD'] = owner['JAGONZN_LAB_DB_OWNER_PASSWORD']

    def sql(statement):
        return lab['run'](docker + ['exec', '-i', '--env', 'PGPASSWORD', identifier, 'psql', '-X', '-U', 'jagonzn', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], input=statement.encode(), env=env).decode().strip()

    if not sql("SELECT rolname FROM pg_roles WHERE rolname='" + database + "';"):
        sql('CREATE ROLE ' + database + " LOGIN PASSWORD '" + config['password'] + "';")
    existing = sql("SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='" + database + "';")
    if not existing:
        sql('CREATE DATABASE ' + database + ' OWNER ' + database + ';')
    elif existing != database:
        raise ValueError('同名测试库归属不匹配，拒绝覆盖')
    env.update(JAGONZN_CLOUD_TEST_DATABASE_URL='jdbc:postgresql://127.0.0.1:25432/' + database,
               JAGONZN_CLOUD_TEST_DATABASE_USER=config['user'], JAGONZN_CLOUD_TEST_DATABASE_PASSWORD=config['password'])
    destination = data / ('.private/workspaces/http-lock-log-' + args.module + '-' + args.run)
    if destination.exists():
        raise FileExistsError('测试目录已存在，保留原候选，请换运行标识')
    destination.mkdir(mode=0o700)
    module = 'jagonzn-' + args.module
    selected = 'Cloud*Tests,JagonznCloudApplicationTests,HttpDelivery*Tests' if args.module == 'cloud' else 'Jt808*Tests,JagonznMigrationNamespaceTests,Jt808LogForwarderTests'
    command = [str(ROOT / module / 'mvnw'), '-B', '-f', str(ROOT / module / 'pom.xml'),
               '-Dmaven.repo.local=' + str(data / '.private/ci-tools/maven-repository'),
               '-Djagonzn.build.directory=' + str(destination), '-Dtest=' + selected, 'test']
    log = evidence / (args.module + '-' + args.run + '.log')
    with log.open('x') as output:
        process = subprocess.run(command, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT)
    (evidence / (args.module + '-' + args.run + '.json')).write_text(json.dumps({'exitCode': process.returncode, 'outputDirectory': str(destination), 'physicalEnvironment': proof, 'database': database, 'log': str(log)}, indent=2) + '\n')
    print(args.module + ' exit=' + str(process.returncode) + ' evidence=' + str(log))
    raise SystemExit(process.returncode)


if __name__ == '__main__':
    main()

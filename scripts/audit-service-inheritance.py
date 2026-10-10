#!/usr/bin/env python3
"""只读核对 service 内核 JAR、迁移内容和部署主题与当前上游构建的一致性。"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile
import io

ROOT = Path(__file__).resolve().parents[1]
ROLES = ['app', 'quota_operator', 'commercial_admin', 'topology_guard', 'constraint', 'automation_cleanup']

def sha(data):
    return hashlib.sha256(data).hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT.parent)
    parser.add_argument('--jar', type=Path, default=ROOT/'jagonzn-service/target/jagonzn-service-0.0.1-SNAPSHOT.jar')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    report = {'sourceCommit': subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip(), 'serviceSha256': sha(args.jar.read_bytes()), 'modules': [], 'migrations': 0, 'errors': []}
    dirty = subprocess.check_output(['git','-C',str(source),'status','--porcelain','--','things-cloud','deploy/docker-compose.yml'],text=True)
    if dirty: report['errors'].append('上游工作区存在未提交修改，提交号不能唯一标识构建来源')
    with zipfile.ZipFile(args.jar) as app:
        expected_domains = set()
        for name in app.namelist():
            if not name.startswith('BOOT-INF/lib/things-cloud-') or not name.endswith('.jar'): continue
            blob = app.read(name)
            artifact = name.rsplit('/',1)[1]
            module = artifact.removesuffix('-0.0.1-SNAPSHOT.jar')
            upstream = source/'things-cloud'/module/'target'/artifact
            match = upstream.exists() and sha(upstream.read_bytes()) == sha(blob)
            report['modules'].append({'module':module,'sha256':sha(blob),'matchesSourceBuild':match})
            if not match: report['errors'].append('制品不同步: '+module)
            with zipfile.ZipFile(io.BytesIO(blob)) as lib:
                for migration in lib.namelist():
                    if not migration.startswith('db/migration/') or not migration.endswith(('.sql','.sql.conf')): continue
                    expected_domains.add(migration.split('/')[2])
                    expected = lib.read(migration).decode().replace('\r\n','\n')
                    if migration.endswith('.sql'):
                        for role in ROLES: expected=expected.replace('thingscloud_'+role,'jagonzn_'+role)
                    target = 'BOOT-INF/classes/jagonzn/'+migration
                    if target not in app.namelist() or app.read(target).decode().replace('\r\n','\n') != expected:
                        report['errors'].append('迁移内容缺失或不一致: '+migration)
                    report['migrations'] += 1
        properties = app.read('BOOT-INF/classes/application.properties').decode()
        line = next(l for l in properties.splitlines() if l.startswith('spring.flyway.locations='))
        actual_domains = {part.rsplit('/',1)[1] for part in line.split('=',1)[1].split(',')}
        if actual_domains != expected_domains: report['errors'].append('实际 Flyway 目录与运行时模块不一致')
        report['migrationDomains'] = sorted(actual_domains)
    def topics(path):
        return {name:(int(parts),int(retention)) for name,parts,retention in re.findall(r'^\s*create\s+(tc\.\S+)\s+(\d+)\s+(\d+)',path.read_text(),re.M)}
    upstream_topics=topics(source/'deploy/docker-compose.yml')
    local_topics=topics(ROOT/'deploy/redpanda/init-topics.sh')
    if not upstream_topics or upstream_topics != local_topics: report['errors'].append('主题/分区/保留期与上游不同步')
    report['topics'] = len(local_topics)
    report['passed'] = not report['errors'] and bool(report['modules'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k != 'modules'},ensure_ascii=False))
    return 0 if report['passed'] else 1

if __name__ == '__main__':
    raise SystemExit(main())

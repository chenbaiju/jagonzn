#!/usr/bin/env python3
"""只读核验本机外设身份、既有映射和构建输出；外设缺失时不创建替代目录。"""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]


def check(build_directory=None, maven_repository=None):
    config = json.loads((ROOT / '.private/storage-management/storage.json').read_text())
    if Path(config['project_root']).resolve() != ROOT or config.get('status') != 'ready':
        raise ValueError('本机存储配置不属于当前独立仓库')
    data = Path(config['data_root']).resolve(strict=True)
    if data.is_relative_to(ROOT) or ROOT.is_relative_to(data):
        raise ValueError('外设资料根不能位于源码或其父目录')
    if sys.platform == 'darwin' and data.parts[1:2] == ('Volumes',):
        if not Path(*data.parts[:3]).is_mount():
            raise ValueError('配置的外设未挂载')
    marker = json.loads((data / '.thingslink-storage-owner.json').read_text())
    if marker['id'] != config['marker_id'] or Path(marker['project_root']).resolve() != ROOT:
        raise ValueError('外设身份与本机配置不匹配')
    required = {'.private/workspaces', '.private/deployment-session', '.private/ci-tools', 'logs/ci'}
    if set(config['paths']) != required:
        raise ValueError('简工构建与测试所需映射不完整')
    for name in sorted(required):
        source = ROOT / name
        linked = source.is_symlink() or bool(getattr(source.lstat(), 'st_file_attributes', 0) & 0x400)
        if not linked or source.resolve(strict=True) != (data / name).resolve(strict=True):
            raise ValueError('外设映射丢失或被重建：' + name)
    for name, value in [('构建目录', build_directory), ('Maven缓存', maven_repository)]:
        if value is not None and not Path(value).resolve().is_relative_to(data):
            raise ValueError(name + '必须位于当前已核验的外设资料根')
    print('存储检查通过：' + str(data))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-directory')
    parser.add_argument('--maven-repository')
    args = parser.parse_args()
    try:
        check(args.build_directory, args.maven_repository)
    except (OSError, ValueError, KeyError) as error:
        print('[storage] 已停止：' + str(error), file=sys.stderr)
        raise SystemExit(1)

#!/usr/bin/env python3
"""只生成上游三方合并候选，不覆盖工作区；审阅后由维护者接纳整个候选。"""
import argparse
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args])


def tree(repo, revision, mappings):
    """只读取指定提交的受控路径；本机未提交文件不进入同步。"""
    result = {}
    for source, target in mappings.items():
        entries = git(repo, 'ls-tree', '-rz', revision, '--', source).split(b'\0')
        for entry in filter(None, entries):
            meta, name = entry.split(b'\t', 1)
            mode, kind, oid = meta.decode().split()
            if kind != 'blob' or mode not in ('100644', '100755'):
                raise ValueError('同步不接受链接或子模块: ' + name.decode())
            name = name.decode()
            dest = target + name[len(source):] if source.endswith('/') else target
            path = pathlib.PurePosixPath(dest)
            if path.is_absolute() or '..' in path.parts:
                raise ValueError('非法目标路径: ' + dest)
            result[dest] = (git(repo, 'cat-file', 'blob', oid), int(mode, 8) & 0o777)
    return result


def merge(base, local, remote):
    """保留单方修改；双方冲突采用 diff3，删除/二进制冲突交人工裁决。"""
    if local == base:
        return remote, False
    if remote == base or local == remote:
        return local, False
    if base is None or local is None or remote is None:
        return local, True
    if any(b'\0' in item[0] for item in (base, local, remote)):
        return local, True
    # 权限与内容分别合并，避免遗漏上游可执行位变化。
    mode, conflict = merge_scalar(base[1], local[1], remote[1])
    with tempfile.TemporaryDirectory() as tmp:
        files = [pathlib.Path(tmp) / name for name in ('local', 'base', 'upstream')]
        for file, item in zip(files, (local, base, remote)):
            file.write_bytes(item[0])
        process = subprocess.run(['git', 'merge-file', '-p', '--diff3',
                                  '-L', 'jagonzn', '-L', 'previous-upstream', '-L', 'new-upstream',
                                  *map(str, files)], capture_output=True)
        if process.returncode < 0 or process.returncode > 127:
            raise RuntimeError(process.stderr.decode())
        return (process.stdout, mode), conflict or process.returncode != 0


def merge_scalar(base, local, remote):
    if local == base:
        return remote, False
    if remote == base or local == remote:
        return local, False
    return local, True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=pathlib.Path, help='ThingsCloud Git 仓库路径')
    parser.add_argument('--revision', required=True, help='本次上游候选提交')
    parser.add_argument('--output', required=True, type=pathlib.Path, help='不存在的仓外候选目录')
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or ROOT in output.parents or output.exists():
        parser.error('output 必须是尚不存在的仓外目录')
    manifest = json.loads((ROOT / 'docs/console-upstream.json').read_text())
    revision = git(args.source, 'rev-parse', '--verify', args.revision + '^{commit}').decode().strip()
    base = tree(args.source, manifest['revision'], manifest['paths'])
    remote = tree(args.source, revision, manifest['paths'])
    output.mkdir(parents=True)
    changed, deleted, conflicts = [], [], []
    for name in sorted(base.keys() | remote.keys()):
        path = ROOT / name
        if path.is_symlink():
            raise ValueError('本地目标不能是符号链接: ' + name)
        local = (path.read_bytes(), path.stat().st_mode & 0o777) if path.exists() else None
        merged, conflict = merge(base.get(name), local, remote.get(name))
        if conflict:
            conflicts.append(name)
        if merged != local or conflict:
            if merged is None:
                deleted.append(name)
            else:
                dest = output / 'files' / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(merged[0])
                dest.chmod(merged[1])
                changed.append(name)
        # 保存冲突的三个原件，包含删除和二进制，便于独立恢复。
        if conflict:
            for label, item in [('base', base.get(name)), ('local', local), ('upstream', remote.get(name))]:
                if item is not None:
                    dest = output / 'conflicts' / label / name
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(item[0])
    report = {'previousRevision': manifest['revision'], 'revision': revision,
              'changed': changed, 'deleted': deleted, 'conflicts': conflicts}
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    manifest['revision'] = revision
    (output / 'console-upstream.next.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'changed': len(changed), 'deleted': len(deleted), 'conflicts': len(conflicts),
                      'output': str(output)}, ensure_ascii=False))
    print('仅生成候选。解决全部冲突、逐项审阅和验证后，才接纳变更及新的上游基线。')


if __name__ == '__main__':
    main()

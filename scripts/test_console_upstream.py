"""验证同步不会静默丢失本地定制、删除或二进制冲突。"""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('console_upstream', Path(__file__).with_name('console-upstream.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def file(text, mode=0o644):
    return text.encode(), mode


class UpstreamMergeTests(unittest.TestCase):
    def test_unchanged_upstream_preserves_brand(self):
        base, local = file('ThingsCloud\n'), file('jagonzn\n')
        self.assertEqual(module.merge(base, local, base), (local, False))

    def test_separate_changes_merge(self):
        base = file('brand=ThingsCloud\na\nb\nc\ncolor=blue\n')
        local = file('brand=jagonzn\na\nb\nc\ncolor=blue\n')
        remote = file('brand=ThingsCloud\na\nb\nc\ncolor=green\n')
        merged, conflict = module.merge(base, local, remote)
        self.assertFalse(conflict)
        self.assertEqual(merged, file('brand=jagonzn\na\nb\nc\ncolor=green\n'))

    def test_same_line_conflicts(self):
        _, conflict = module.merge(file('a\n'), file('b\n'), file('c\n'))
        self.assertTrue(conflict)

    def test_upstream_delete_does_not_discard_customization(self):
        local = file('custom')
        self.assertEqual(module.merge(file('old'), local, None), (local, True))

    def test_local_delete_does_not_silently_reappear(self):
        self.assertEqual(module.merge(file('old'), None, file('new')), (None, True))

    def test_binary_conflicts(self):
        local = (b'\0local', 0o644)
        self.assertEqual(module.merge((b'\0base', 0o644), local, (b'\0new', 0o644)), (local, True))

    def test_new_file_and_mode(self):
        remote = file('new', 0o755)
        self.assertEqual(module.merge(None, None, remote), (remote, False))


if __name__ == '__main__':
    unittest.main()

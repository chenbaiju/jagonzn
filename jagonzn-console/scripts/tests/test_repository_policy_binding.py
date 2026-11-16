"""Repository policy fingerprints use real isolated Git repos; no middleware required."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('evidence', Path(__file__).parents[1] / 'e2e-evidence.py')
E = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(E)


class RepositoryPolicyBindingTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.root.mkdir(parents=True, exist_ok=True)
        self.git('init', '-q')
        for name in E.DOCUMENTS:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('Frozen policy\n')
        self.commit()
        mock = patch.object(E, 'REPO', self.root)
        mock.start()
        self.addCleanup(mock.stop)

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args]).decode().strip()

    def commit(self):
        self.git('add', '.')
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com',
                 'commit', '-qm', 'fixture')

    def test_fingerprint_has_source_commit_and_three_real_byte_hashes(self):
        value = E.documentation_identity()
        self.assertEqual(self.git('rev-parse', 'HEAD'), value['sourceCommit'])
        self.assertEqual({name: E.sha(self.root / name) for name in E.DOCUMENTS}, value['files'])
        E.check_documentation_identity({'documentationBinding': value})

    def test_dirty_policy_is_rejected(self):
        (self.root / E.DOCUMENTS[0]).write_text('Changed\n')
        with self.assertRaisesRegex(ValueError, 'clean repository'):
            E.documentation_identity()

    def test_committed_policy_drift_is_rejected(self):
        frozen = E.documentation_identity()
        (self.root / E.DOCUMENTS[0]).write_text('New policy\n')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'drift'):
            E.check_documentation_identity({'documentationBinding': frozen})

    def test_same_bytes_with_new_source_commit_is_rejected(self):
        frozen = E.documentation_identity()
        self.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com',
                 'commit', '--allow-empty', '-qm', 'new identity')
        with self.assertRaisesRegex(ValueError, 'drift'):
            E.check_documentation_identity({'documentationBinding': frozen})

    def test_missing_policy_fails_even_when_deletion_is_committed(self):
        (self.root / E.DOCUMENTS[0]).unlink()
        self.commit()
        with self.assertRaisesRegex(ValueError, 'missing repository policy'):
            E.documentation_identity()

    def test_missing_repository_does_not_fall_back_to_parent(self):
        with patch.object(E, 'REPO', self.root / 'absent'):
            with self.assertRaisesRegex(ValueError, 'main repository'):
                E.documentation_identity()

    def test_committed_external_symlink_is_rejected(self):
        policy = self.root / E.DOCUMENTS[0]
        policy.unlink()
        external = self.root / 'external.md'
        external.write_text('outside')
        policy.symlink_to(external)
        self.commit()
        with self.assertRaisesRegex(ValueError, 'escapes root|symlink'):
            E.documentation_identity()

    def test_historical_candidate_cannot_resume_live_qualification(self):
        with self.assertRaisesRegex(ValueError, 'offline verification only'):
            E.check_documentation_identity({})


if __name__ == '__main__':
    unittest.main()

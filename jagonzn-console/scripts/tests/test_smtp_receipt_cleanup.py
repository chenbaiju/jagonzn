"""Exercise the real runner archival helper without services or TLS mutations."""
from pathlib import Path
import subprocess
import tempfile
import unittest


class ReceiptCleanupTests(unittest.TestCase):
    def run_cleanup(self, private, logs):
        runner = (Path(__file__).parents[1] / 'run-e2e-tests.sh').read_text()
        start = runner.index('archive_restored_test_tls_directory() {')
        end = runner.index('\n}', start) + 2
        function = runner[start:end]
        return subprocess.run(['bash', '-c', function + '\narchive_restored_test_tls_directory "$1" "$2"',
                               'cleanup-test', str(private), str(logs)], capture_output=True, timeout=5)

    def test_copy_failure_preserves_only_receipt_and_private_directory(self):
        with tempfile.TemporaryDirectory() as value:
            root = Path(value)
            private = root / 'private'
            private.mkdir()
            (private / 'smtp-receipts.json').write_text('[{"accepted":false}]')
            logs = root / 'unavailable-parent' / 'logs'
            result = self.run_cleanup(private, logs)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((private / 'smtp-receipts.json').read_text(), '[{"accepted":false}]')

    def test_success_archives_before_removing_restored_private_material(self):
        with tempfile.TemporaryDirectory() as value:
            root = Path(value)
            private, logs = root / 'private', root / 'logs'
            private.mkdir(); logs.mkdir()
            (private / 'smtp-receipts.json').write_text('[{"accepted":true}]')
            (private / 'server.key').write_text('private test material')
            result = self.run_cleanup(private, logs)
            self.assertEqual(result.returncode, 0)
            self.assertFalse(private.exists())
            self.assertEqual((logs / 'controlled-smtp-receipts.json').read_text(), '[{"accepted":true}]')
            self.assertEqual(list(logs.iterdir()), [logs / 'controlled-smtp-receipts.json'])


if __name__ == '__main__':
    unittest.main()

"""Exercise the real runner archival helper without services or TLS mutations."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest


class ReceiptCleanupTests(unittest.TestCase):
    def test_actual_cleanup_receipt_matches_terminal_exit(self):
        source = (Path(__file__).parents[1] / 'run-e2e-tests.sh').read_text()
        functions = source[source.index('archive_restored_test_tls_directory() {'):source.index('trap cleanup EXIT')]
        # 执行真实清理函数和真实回执CLI；仅替换TLS网络恢复与锁删除故障，不启动服务。
        for restore, archive, lock, original in [(0, False, False, 0), (17, False, False, 0),
                                               (0, True, False, 0), (0, False, True, 0),
                                               (17, False, False, 37)]:
            with self.subTest(restore=restore, archive=archive, lock=lock, original=original), \
                    tempfile.TemporaryDirectory(prefix='cleanup receipt 中文 ') as directory:
                console = Path(directory)
                scripts = console / 'scripts'; scripts.mkdir()
                shutil.copyfile(Path(__file__).parents[1] / 'e2e-evidence.py', scripts / 'e2e-evidence.py')
                batch = console / '.e2e-evidence/batch'
                run = batch / 'runs/test'; run.mkdir(parents=True)
                tls = console / 'tls'; tls.mkdir()
                (tls / 'smtp-receipts.json').write_text('[]')
                logs = console / 'logs'
                if not archive: logs.mkdir()
                env = dict(os.environ, CONSOLE_DIR=str(console), SCRIPT_DIR=str(scripts),
                           E2E_BATCH_DIR=str(batch), E2E_RUN_DIR=str(run), TEST_TLS_DIRECTORY=str(tls),
                           DEFAULT_E2E_LOG_DIR=str(logs), TEST_PYTHON=sys.executable,
                           RESTORE_EXIT=str(restore), ORIGINAL_EXIT=str(original), LOCK_FAILURE=str(int(lock)),
                           EMQX_DASHBOARD_USER='fixture', EMQX_DASHBOARD_PASSWORD='fixture',
                           TS='fixture', NORMAL_LEASE='true' if lock else 'false')
                for name in ('WEBAPP_PID', 'VITE_PID', 'SIMULATOR_PID', 'SIGNER_PID', 'BACKEND_PID',
                             'SMTP_PID', 'WEBAPP_PORT', 'OTA_SIGNER_PORT_FILE', 'PROBE_TOPIC'):
                    env[name] = ''
                for name in ('EMQX_AUTH_CALLBACK_REPOINTED', 'EMQX_AUTHZ_CALLBACK_REPOINTED',
                             'EMQX_LIFECYCLE_CALLBACK_REPOINTED', 'EMQX_KEY_OWNED', 'REDIS_TOUCHED'):
                    env[name] = 'false'
                prefix = '''set -uo pipefail
log() { :; }
capture_dependency_diagnostics() { :; }
python3() {
  if [[ "$1" == */emqx-test-tls.py ]]; then return "$RESTORE_EXIT"; fi
  "$TEST_PYTHON" "$@"
}
rm() {
  if [[ "$LOCK_FAILURE" == 1 && "$*" == *runtime.lock* ]]; then return 4; fi
  command rm "$@"
}
printf 'normal:%s' "$$" > "$CONSOLE_DIR/.e2e-evidence/runtime.lock"
'''
                result = subprocess.run(['bash', '-c', prefix + functions + '\n(exit "$ORIGINAL_EXIT")\ncleanup'],
                                        env=env, capture_output=True, text=True, timeout=10)
                expected = original or (1 if restore or archive or lock else 0)
                self.assertEqual(result.returncode, expected, result.stderr)
                receipt = json.loads((run / 'cleanup.json').read_text())
                self.assertEqual(receipt['runnerExitCode'], expected)
                if restore or archive: self.assertTrue(tls.is_dir())
                if lock: self.assertTrue((console / '.e2e-evidence/runtime.lock').exists())

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

"""Q7：执行真实 Runner 的契约/Playwright 参数分支，只以命令替身截获 argv。"""

import json
import os
from pathlib import Path
import shutil
import shlex
import subprocess
import sys
import tempfile
import unittest


RUNNER = Path(__file__).resolve().parents[1] / "run-e2e-tests.sh"
BASH = shutil.which("bash")
MATRIX = ["anomaly-auth.spec.ts", "journey-1.spec.ts", "journey-2.spec.ts",
          "journey-3.spec.ts", "journey-6.spec.ts", "journey-7.spec.ts"]


class RunnerArgumentTests(unittest.TestCase):
    """不运行启动/清理分支；被测 argv 构造与调用直接取自当前 Runner，不能另写宽松替身。"""

    def execute_branch(self, *, simulator=True, selector="", formal=False, matrix=False,
                       contract_exit=0, playwright_exit=0, missing_base=False,
                       private_identity=False, controlled_smtp=False):
        source = RUNNER.read_text()
        marker = '# 8. 复验 C2c 契约测试'
        self.assertEqual(source.count(marker), 1)
        # 此尾段只含实际两条命令及其参数分支；临时目录和 pnpm 替身阻止共享环境副作用。
        branch = source[source.index(marker):]
        with tempfile.TemporaryDirectory(prefix="q7 argv with spaces ") as directory:
            env = os.environ.copy()
            for key in ("E2E_BATCH_DIR", "E2E_RUN_DIR", "E2E_MATRIX_SPECS", "E2E_SPEC", "BASE_URL", "EMQX_MQTT_PORT"):
                env.pop(key, None)
            env.update({"CONSOLE_DIR": directory, "BASE_URL": "http://127.0.0.1:8081",
                        "E2E_URL": "http://127.0.0.1:3007", "OWNER_EMAIL": "owner@example.invalid",
                        "MEMBER_EMAIL": "member@example.invalid", "PASSWORD": "isolated-test-placeholder",
                        "E2E_PROJECT_KEY": "isolated-project", "E2E_SPEC": selector,
                        "E2E_MATRIX_SPECS": ":".join(MATRIX) if matrix else "",
                        "WITH_SIMULATOR": "true" if simulator else "false", "Q7_PYTHON": sys.executable,
                        "PLAN_EMAIL": "plan@example.invalid", "PLAN_PROJECT": "plan-fixture",
                        "SHC_OPERATOR_EMAIL": "operator@example.invalid",
                        "SHC_REVIEWER_ONE_EMAIL": "reviewer-one@example.invalid",
                        "SHC_REVIEWER_TWO_EMAIL": "reviewer-two@example.invalid",
                        "OTA_LIFECYCLE": "false", "OTA_FIXTURE_DIR": str(RUNNER.parents[1] / 'e2e/fixtures'),
                        "CONTROLLED_SMTP": "true" if controlled_smtp else "false",
                        "E2E_CONTROLLED_SMTP": "1" if controlled_smtp else "",
                        "E2E_SMTP_PRIVATE_IDENTITY": "1" if private_identity else "",
                        "Q7_CONTRACT_EXIT": str(contract_exit), "Q7_PLAYWRIGHT_EXIT": str(playwright_exit)})
            if formal:
                env["E2E_RUN_DIR"] = str(Path(directory) / "正式 evidence with spaces")
            if missing_base:
                env.pop("BASE_URL")
            prefix = """set -euo pipefail
EMQX_MQTT_PORT=21883
PGUSER=fixture_user
PGDB=fixture_db
log() { :; }
sleep() { "$Q7_PYTHON" -c 'import json,sys;print(json.dumps(["wait",int(sys.argv[1])]))' "$1"; }
pnpm() {
  "$Q7_PYTHON" -c 'import json,os,sys; assert sys.argv[1]=="test:contract" or (os.environ.get("EMQX_MQTT_PORT")=="21883" and os.environ.get("E2E_PG_USER")=="fixture_user" and os.environ.get("E2E_PG_DB")=="fixture_db"); print(json.dumps(sys.argv[1:])); sys.exit(int(os.environ["Q7_CONTRACT_EXIT" if sys.argv[1]=="test:contract" else "Q7_PLAYWRIGHT_EXIT"]))' "$@"
}
IFS=':' read -r -a E2E_MATRIX_FILES <<< "$E2E_MATRIX_SPECS"
"""
            result = subprocess.run([BASH, "-c", prefix + branch], env=env,
                                    text=True, capture_output=True, timeout=10)
            calls = [json.loads(line) for line in result.stdout.splitlines()]
            return result, calls, env.get("E2E_RUN_DIR")

    def assert_calls(self, *, simulator=True, selector="", formal=False, matrix=False):
        result, calls, directory = self.execute_branch(simulator=simulator, selector=selector,
                                                       formal=formal, matrix=matrix)
        self.assertEqual(result.returncode, 0, result.stderr)
        contract = ["test:contract"]
        if formal:
            contract += ["--reporter=default", "--reporter=json", f"--outputFile={directory}/contract.json"]
        playwright = ["exec", "playwright", "test"] + (MATRIX if matrix else [selector] if selector else [])
        if not simulator:
            playwright += ["--grep-invert", "@simulator"]
        self.assertEqual(calls, [contract, playwright])

    def test_controlled_smtp_requires_own_backend_and_simulator(self):
        source = RUNNER.read_text()
        branch = source[source.index('CONTROLLED_SMTP=false'):source.index('OTA_FIXTURE_DIR=')]
        for selector, skip, simulator, expected in [
                ('alarm-smtp-journey.spec.ts', '0', 'true', 0),
                ('alarm-smtp-journey.spec.ts', '1', 'true', 1),
                ('alarm-smtp-journey.spec.ts', '0', 'false', 1),
                ('rule-smtp-journey.spec.ts', '0', 'true', 0),
                ('rule-smtp-journey.spec.ts', '1', 'true', 1),
                ('rule-smtp-journey.spec.ts', '0', 'false', 1),
                ('rule-smtp-journey-extra.spec.ts', '0', 'true', 0),
                ('property-automation-smtp.spec.ts', '0', 'true', 0),
                ('property-automation-smtp.spec.ts', '1', 'true', 1),
                ('property-automation-smtp.spec.ts', '0', 'false', 1),
                ('property-automation-smtp-extra.spec.ts', '0', 'true', 0),
                ('time-once-smtp.spec.ts', '0', 'true', 0),
                ('time-once-smtp.spec.ts', '1', 'true', 1),
                ('time-once-smtp.spec.ts', '0', 'false', 1),
                ('time-cron-smtp.spec.ts', '0', 'true', 0),
                ('time-cron-smtp.spec.ts', '1', 'true', 1),
                ('time-cron-smtp.spec.ts', '0', 'false', 1),
                ('time-cron-smtp-extra.spec.ts', '0', 'true', 0),
                ('invitation-registration-smtp.spec.ts', '0', 'true', 0),
                ('invitation-registration-smtp.spec.ts', '1', 'true', 1),
                ('invitation-registration-smtp.spec.ts', '0', 'false', 1),
                ('invitation-registration-smtp-extra.spec.ts', '0', 'true', 0),
                ('journey-1.spec.ts', '1', 'false', 0)]:
            with self.subTest(selector=selector, skip=skip, simulator=simulator):
                result = subprocess.run([BASH, '-c', 'set -eu\n' + branch + '\nprintf \"%s\n\" \"$CONTROLLED_SMTP\"'],
                    env={**os.environ, 'E2E_SPEC': selector, 'SKIP_BACKEND': skip,
                         'WITH_SIMULATOR': simulator}, capture_output=True, timeout=5)
                self.assertEqual(result.returncode, expected)
                if expected == 0:
                    controlled = selector in ('alarm-smtp-journey.spec.ts', 'rule-smtp-journey.spec.ts', 'property-automation-smtp.spec.ts', 'time-once-smtp.spec.ts', 'time-cron-smtp.spec.ts', 'invitation-registration-smtp.spec.ts')
                    self.assertEqual(result.stdout.strip(), b'true' if controlled else b'false')

    def test_private_identity_selection_is_exact_isolated_and_clears_inherited_values(self):
        source = RUNNER.read_text()
        start = source.index('# Identity messages are retained only')
        end = source.index('# End private identity selection.', start)
        branch = source[start:end]
        with tempfile.TemporaryDirectory(prefix='private identity selector ') as temporary:
            marker = Path(temporary) / 'isolated-marker'
            branch = branch.replace('/.thingscloud-local-ci', shlex.quote(str(marker)))
            for selector, isolated, expected in [
                    ('invitation-registration-smtp.spec.ts', False, 1),
                    ('invitation-registration-smtp.spec.ts', True, 0),
                    ('invitation-registration-smtp-extra.spec.ts', True, 0), ('', True, 0)]:
                with self.subTest(selector=selector, isolated=isolated):
                    if isolated: marker.touch()
                    elif marker.exists(): marker.unlink()
                    script = 'set -eu\nlog() { :; }\n' + branch + '\n' + \
                        'python3 -c \'import json,os;print(json.dumps([os.environ.get("E2E_SMTP_PRIVATE_IDENTITY"),os.environ.get("E2E_INVITATION_RECIPIENT")]))\''
                    result = subprocess.run([BASH, '-c', script],env={**os.environ,'E2E_SPEC':selector,
                        'E2E_SMTP_PRIVATE_IDENTITY':'inherited','E2E_INVITATION_RECIPIENT':'inherited'},capture_output=True,text=True,timeout=5)
                    self.assertEqual(result.returncode,expected,result.stderr)
                    if expected: continue
                    values=json.loads(result.stdout)
                    if selector=='invitation-registration-smtp.spec.ts':
                        self.assertEqual(values[0],'1')
                        self.assertRegex(values[1],r'^invited-[a-f0-9]{32}@example\.test$')
                    else: self.assertEqual(values,[None,None])

    def test_populated_association_selection_requires_exact_fresh_isolated_stack(self):
        source = RUNNER.read_text()
        start = source.index('# Populated association fixture:')
        end = source.index('# End populated association selection.', start)
        branch = source[start:end]
        with tempfile.TemporaryDirectory(prefix='association selector ') as temporary:
            marker = Path(temporary) / 'isolated-marker'
            branch = branch.replace('/.thingscloud-local-ci', shlex.quote(str(marker)))
            for selector, isolated, skip, simulator, expected in [
                    ('device-associations-populated.spec.ts', True, '0', 'true', 0),
                    ('device-associations-populated.spec.ts', False, '0', 'true', 1),
                    ('device-associations-populated.spec.ts', True, '1', 'true', 1),
                    ('device-associations-populated.spec.ts', True, '0', 'false', 1),
                    ('device-associations-populated-extra.spec.ts', False, '1', 'false', 0),
                    ('', False, '1', 'false', 0)]:
                with self.subTest(selector=selector, isolated=isolated, skip=skip, simulator=simulator):
                    if isolated: marker.touch()
                    elif marker.exists(): marker.unlink()
                    script = 'set -eu\nsmtp_env_args=()\n' + branch + '\n' + \
                        '[[ -z "${E2E_ASSOCIATION_FIXTURE:-}" ]]\nprintf "%s" "${smtp_env_args[*]-}"'
                    result = subprocess.run([BASH, '-c', script], env={**os.environ,
                        'E2E_SPEC': selector, 'SKIP_BACKEND': skip, 'WITH_SIMULATOR': simulator,
                        'E2E_ASSOCIATION_FIXTURE': 'inherited'}, capture_output=True, text=True, timeout=5)
                    self.assertEqual(result.returncode, expected, result.stderr)
                    if not expected:
                        self.assertEqual(result.stdout, 'THINGS_CLOUD_AUTOMATION_PROPERTY_ENABLED=true'
                            if selector == 'device-associations-populated.spec.ts' else '')

    def test_automation_fixture_authority_is_exactly_selected(self):
        source = RUNNER.read_text()
        start = source.index('  if [[ "${E2E_SPEC}" == "property-automation-smtp.spec.ts" ]]; then', source.index('export E2E_PG_USER='))
        end = source.index('  # 生命周期旅程', start)
        branch = source[start:end]
        keys = ('E2E_AUTOMATION_FIXTURE', 'E2E_AUTOMATION_ADMIN_USER', 'E2E_AUTOMATION_ADMIN_DB', 'E2E_ASSOCIATION_FIXTURE')
        for selector, expected in [('property-automation-smtp.spec.ts', 'property-smtp'),
                                   ('time-once-smtp.spec.ts', 'time-smtp'),
                                   ('time-cron-smtp.spec.ts', 'time-smtp'),
                                   ('time-cron-smtp-extra.spec.ts', None),
                                   ('device-associations-populated.spec.ts', 'association'),
                                   ('device-associations-populated-extra.spec.ts', None), ('', None)]:
            with self.subTest(selector=selector):
                code = 'import os,json;print(json.dumps({k:os.environ.get(k) for k in '+repr(keys)+'}))'
                script = 'set -eu\n' + branch + '\n"$Q7_PYTHON" -c '+json.dumps(code)
                result = subprocess.run([BASH, '-c', script],env={**os.environ,**{k:'inherited-untrusted' for k in keys},
                    'E2E_SPEC':selector,'PGUSER':'fixture_user','PGDB':'fixture_db','Q7_PYTHON':sys.executable},capture_output=True,text=True,timeout=5)
                self.assertEqual(result.returncode,0,result.stderr)
                value=json.loads(result.stdout)
                wanted = (None, 'fixture_user', 'fixture_db', '1') if expected == 'association' else \
                    (expected, 'fixture_user', 'fixture_db', None) if expected else (None, None, None, None)
                self.assertEqual(value, dict(zip(keys, wanted)))

    def test_normal_empty_with_simulator(self):
        self.assert_calls()

    def test_normal_empty_without_simulator(self):
        self.assert_calls(simulator=False)

    def test_normal_single_file(self):
        for simulator in (True, False):
            with self.subTest(simulator=simulator):
                self.assert_calls(simulator=simulator, selector="journey-6.spec.ts")

    def test_formal_single_file_preserves_space_in_report_path(self):
        for simulator in (True, False):
            with self.subTest(simulator=simulator):
                self.assert_calls(simulator=simulator, selector="journey-6.spec.ts", formal=True)

    def test_formal_matrix_preserves_six_separate_files_and_order(self):
        for simulator in (True, False):
            with self.subTest(simulator=simulator):
                self.assert_calls(simulator=simulator, formal=True, matrix=True)

    def test_contract_failure_stops_playwright_and_preserves_exit_code(self):
        for formal in (False, True):
            with self.subTest(formal=formal):
                result, calls, _ = self.execute_branch(formal=formal, contract_exit=23)
                self.assertEqual(result.returncode, 23, result.stderr)
                self.assertEqual(len(calls), 1)
                self.assertEqual(calls[0][0], "test:contract")

    def test_private_invitation_waits_original_registration_window_after_contract(self):
        result, calls, _ = self.execute_branch(selector="invitation-registration-smtp.spec.ts",
                                               private_identity=True, controlled_smtp=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls[0], ["test:contract"])
        self.assertEqual(calls[-1], ["exec", "playwright", "test", "invitation-registration-smtp.spec.ts"])
        self.assertEqual(calls[1:-1], [["wait", 30]] * 10 + [["wait", 1]])
        self.assertEqual(sum(item[1] for item in calls[1:-1]), 301)
        for private, controlled in [(False, True), (True, False), (False, False)]:
            result, calls, _ = self.execute_branch(selector="invitation-registration-smtp.spec.ts",
                                                   private_identity=private, controlled_smtp=controlled)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(calls, [["test:contract"]])

    def test_invitation_contract_failure_never_waits_or_starts_browser(self):
        result, calls, _ = self.execute_branch(selector="invitation-registration-smtp.spec.ts",
            private_identity=True, controlled_smtp=True, contract_exit=23)
        self.assertEqual(result.returncode, 23)
        self.assertEqual(calls, [["test:contract"]])

    def test_registration_wait_does_not_leak_into_other_selections(self):
        for selector in ["", "invitation-registration-smtp-extra.spec.ts", "project-invitation.spec.ts"]:
            result, calls, _ = self.execute_branch(selector=selector,
                private_identity=True, controlled_smtp=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(any(call[0] == "wait" for call in calls))

    def test_playwright_failure_preserves_exit_code(self):
        for simulator in (True, False):
            with self.subTest(simulator=simulator):
                result, calls, _ = self.execute_branch(simulator=simulator, playwright_exit=37)
                self.assertEqual(result.returncode, 37, result.stderr)
                self.assertEqual(len(calls), 2)

    def test_missing_required_variable_still_fails_nounset(self):
        result, calls, _ = self.execute_branch(missing_base=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("BASE_URL", result.stderr)
        self.assertEqual(calls, [])

    def test_publication_host_selection_includes_default_and_partial_paths(self):
        """执行Runner真实选择分支，旧旅程不构建宿主，全选/发布旅程必须构建。"""
        source = RUNNER.read_text()
        start = source.index('NEEDS_DASHBOARD_HOST=')
        end = source.index('if [[ "${NEEDS_DASHBOARD_HOST}"', start)
        branch = source[start:end] + '\nprintf "%s" "$NEEDS_DASHBOARD_HOST"'
        cases = [('', '', 'true'), ('dashboard', '', 'true'),
                 ('dashboard-publication.spec.ts', '', 'true'),
                 ('e2e/dashboard-publication.spec.ts', '', 'true'),
                 ('dashboard-share.spec.ts', '', 'true'),
                 ('dashboard-grants.spec.ts', '', 'true'),
                 ('dashboard-binding.spec.ts', '', 'false'),
                 ('', ':'.join(MATRIX), 'false')]
        for selector, matrix, expected in cases:
            with self.subTest(selector=selector, matrix=matrix):
                result = subprocess.run([BASH, '-c', 'set -eu\n' + branch],
                                        env={**os.environ, 'E2E_SPEC': selector, 'E2E_MATRIX_SPECS': matrix},
                                        capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout, expected)

    def test_share_host_selection_is_separate_from_publication(self):
        """执行实际分支，匿名运行只随匿名旅程启用，旧门禁矩阵保持关闭。"""
        source = RUNNER.read_text()
        start = source.index('NEEDS_SHARE_HOST=')
        end = source.index('SHARE_ENABLED=', start)
        branch = source[start:end] + '\nprintf "%s" "$NEEDS_SHARE_HOST"'
        for selector, matrix, expected in [('', '', 'true'), ('dashboard-share.spec.ts', '', 'true'),
                                          ('dashboard-publication.spec.ts', '', 'false'),
                                          ('dashboard-grants.spec.ts', '', 'false'),
                                          ('', ':'.join(MATRIX), 'false')]:
            with self.subTest(selector=selector):
                result = subprocess.run([BASH, '-c', 'set -eu\n' + branch],
                    env={**os.environ, 'E2E_SPEC': selector, 'E2E_MATRIX_SPECS': matrix},
                    capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout, expected)

    def test_backend_log_directory_does_not_depend_on_share_selection(self):
        """运行真实分支，普通授权旅程也有独立可写日志目录且保留显式配置。"""
        source = RUNNER.read_text()
        start = source.index('E2E_BACKEND_LOG_PATH=')
        end = source.index('if [[ "${NEEDS_SHARE_HOST}"', start)
        branch = source[start:end] + '\nprintf "%s" "$E2E_BACKEND_LOG_PATH"'
        for skip, supplied in [('0', ''), ('0', '/tmp/explicit-e2e-log'), ('1', '')]:
            with self.subTest(skip=skip, supplied=supplied):
                result = subprocess.run([BASH, '-c', 'set -eu\nlog() { :; }\n' + branch],
                    env={**os.environ, 'SKIP_BACKEND': skip, 'LOG_PATH': supplied},
                    capture_output=True, text=True, timeout=10)
                self.assertEqual(result.returncode, 0, result.stderr)
                if skip == '0' and not supplied:
                    generated = Path(result.stdout)
                    try:
                        self.assertTrue(generated.is_dir())
                        self.assertTrue(generated.name.startswith('console-backend-log-'))
                    finally:
                        generated.rmdir()
                else:
                    self.assertEqual(result.stdout, supplied)

    def test_backend_receives_storage_environment_from_managed_minio_stack(self):
        """普通 E2E 的胖 JAR 必须取得脚本所管理 MinIO 的四项配置。"""
        source = RUNNER.read_text()
        expected_assignments = (
            'THINGS_CLOUD_STORAGE_INTERNAL_ENDPOINT="${MINIO_STORAGE_ENDPOINT}"',
            'THINGS_CLOUD_STORAGE_EXTERNAL_ENDPOINT="${MINIO_STORAGE_ENDPOINT}"',
            'THINGS_CLOUD_STORAGE_ACCESS_KEY="${MINIO_ROOT_USER}"',
            'THINGS_CLOUD_STORAGE_SECRET_KEY="${MINIO_ROOT_PASSWORD}"',
        )
        for assignment in expected_assignments:
            with self.subTest(assignment=assignment):
                self.assertEqual(source.count(assignment), 1)
        self.assertIn('MINIO_STORAGE_ENDPOINT="http://127.0.0.1:${MINIO_PORT}"', source)
        self.assertIn("grep -m1 '^MINIO_ROOT_PASSWORD='", source)
        self.assertNotIn("source <(grep -E '^MINIO_", source)


if __name__ == "__main__":
    unittest.main()

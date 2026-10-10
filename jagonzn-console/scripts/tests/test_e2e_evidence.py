"""G2-A4a 证据门禁回归；先在旧 Runner 上证明两个直接缺口，不启动真实栈。"""

from pathlib import Path
import copy
import hashlib
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile


SCRIPTS = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("e2e_evidence", SCRIPTS / "e2e-evidence.py")
E = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(E)


def replace_json(path, value):
    """仅测试夹具故意篡改证据；生产工具没有覆盖命令。"""
    path.write_text(json.dumps(value), encoding="utf-8")


def passed_reports(scenario):
    playwright = {"suites": [{"specs": [{"file": scenario, "ok": True, "tests": [
        {"expectedStatus": "passed", "status": "expected", "results": [{"status": "passed", "retry": 0}]}]}]}]}
    contract = {"success": True, "numTotalTests": 9, "numPassedTests": 9,
                "testResults": [{"assertionResults": [{"status": "passed"} for _ in range(9)]}]}
    cleanup = {"schemaVersion": 1, "runnerExitCode": 0, "checks": {name: "PASS" for name in E.CHECKS},
               "started": {name: True for name in ("backend", "simulator", "vite")}, "fixtureNamespace": "unique"}
    return playwright, contract, cleanup


def passed_combination_reports(scenarios):
    """构造按冻结顺序一次执行的六场共享矩阵原始结果。"""
    specs = []
    for scenario in scenarios:
        specs.append({"file": scenario, "ok": True, "tests": [
            {"expectedStatus": "passed", "status": "expected",
             "results": [{"status": "passed", "retry": 0}]}]})
    playwright = {"suites": [{"specs": specs}]}
    _, contract, cleanup = passed_reports(scenarios[0])
    return playwright, contract, cleanup


def emqx_v2(**overrides):
    value = {
        "schemaVersion": 1,
        "identityProjectionVersion": 2,
        "image": "emqx/emqx:6.2.3",
        "imageDigest": "sha256:" + "1" * 64,
        "dataVolume": "thingscloud_emqx-data",
        "baseSource": "/workspace/deploy/emqx/base.hocon",
        "baseSha256": "2" * 64,
        "clusterSha256": "3" * 64,
        "clusterSemanticSha256": "4" * 64,
        "clusterIdentitySha256": "5" * 64,
        "illegalActionTimeouts": [],
        "health": "healthy",
        "durableIngress": {"status": "PASS", "failures": [],
                            "durableRule": {"id": "tc_durable_uplink", "enabled": True,
                                            "actionCount": 1, "function": "republish",
                                            "topic": "tc/internal/v1/ingress/uplink", "qos": 1,
                                            "retain": False, "directDispatch": False},
                            "legacyRawRuleHttpStatus": 404, "legacyCommandBridgeHttpStatus": 404},
        "runnerCallbackContract": {"status": "PASS", "callbackPort": 8080,
                                   "authentication": "password_based:http", "authorization": "http",
                                   "lifecycleConnector": "http:tc_device_lifecycle",
                                   "ownedResourceCount": 3, "contractSha256": "6" * 64},
    }
    value.update(overrides)
    return value


def emqx_q4():
    value = emqx_v2(lifecycleQualificationVersion=1, lifecycleRouteContract={
        "version": 1, "status": "PASS", "callbackPort": 8080, "eventCount": 2,
        "connector": "http:tc_device_lifecycle", "events": ["connected", "disconnected"],
        "contractSha256": "7" * 64})
    source = {key: value[key] for key in ("imageDigest", "dataVolume", "baseSource", "baseSha256",
        "clusterIdentitySha256", "runnerCallbackContract", "durableIngress", "lifecycleRouteContract")}
    run_id, probe_id, client_id = str(E.uuid.uuid4()), str(E.uuid.uuid4()), "q4-" + "a" * 32
    value["lifecycleDeliveryQualification"] = {"version": 1, "status": "PASS",
        "sourceIdentitySha256": hashlib.sha256(json.dumps(source, ensure_ascii=True, sort_keys=True,
                                                           separators=(",", ":")).encode()).hexdigest(),
        "imageDigest": value["imageDigest"], "runId": run_id, "callbackRestored": "PASS",
        "cleanup": {"containerRemoved": "PASS", "volumeRemoved": "PASS", "receiverClosed": "PASS",
                    "sharedRawUnchanged": "PASS", "sharedEffectiveUnchanged": "PASS", "apiKeysTopicsRedisApplications": "NOT_CREATED"},
        "probe": {"status": "PASS", "phase": "fixed-route", "runId": run_id, "probeId": probe_id,
                  "clientId": client_id, "mqttConnackAccepted": True, "mqttDisconnectSent": True, "startedAtNs": 100,
                  "negativeControl": {"unrelatedAuthDenied": True, "allAclDenied": True, "unrelatedEventsRejected": True},
                  "events": [{"runId": run_id, "probeId": probe_id, "clientId": client_id, "event": event,
                              "path": "/api/v1/emqx/events/" + event, "callbackTokenMatched": True,
                              "authenticatedClientMatched": True, "receivedAtNs": 101 + index}
                             for index, event in enumerate(("connected", "disconnected"))]}}
    return value


class EvidenceContractTests(unittest.TestCase):
    def test_q4_real_delivery_identity_and_receipts_are_required(self):
        baseline = emqx_q4()
        E.require_lifecycle_delivery(baseline)
        cases = []
        for key, value in (("sourceIdentitySha256", "0" * 64), ("callbackRestored", "FAIL"), ("status", "UNKNOWN")):
            changed = copy.deepcopy(baseline)
            changed["lifecycleDeliveryQualification"][key] = value
            cases.append(changed)
        for change in ("missing", "duplicate", "wrong-client", "wrong-path", "pre-run", "acl"):
            changed = copy.deepcopy(baseline)
            probe = changed["lifecycleDeliveryQualification"]["probe"]
            if change == "missing": probe["events"].pop()
            elif change == "duplicate": probe["events"].append(probe["events"][0])
            elif change == "wrong-client": probe["events"][0]["clientId"] = "other"
            elif change == "wrong-path": probe["events"][0]["path"] = "/wrong"
            elif change == "pre-run": probe["events"][0]["receivedAtNs"] = 1
            else: probe["negativeControl"]["allAclDenied"] = False
            cases.append(changed)
        for value in cases:
            with self.assertRaises(ValueError):
                E.require_lifecycle_delivery(value)
        with self.assertRaises(ValueError):
            E.require_lifecycle_delivery(emqx_v2())

    def test_q4_route_marker_and_contract_remain_bound_in_stable_identity(self):
        baseline = emqx_q4()
        frozen = E.stable_emqx_environment(baseline)
        changed = copy.deepcopy(baseline)
        changed["lifecycleRouteContract"]["contractSha256"] = "8" * 64
        self.assertNotEqual(frozen, E.stable_emqx_environment(changed))
        changed["lifecycleRouteContract"]["callbackPort"] = 8081
        with self.assertRaises(ValueError):
            E.stable_emqx_environment(changed)

    def setUp(self):
        silence = patch("sys.stdout", new=io.StringIO())
        silence.start()
        self.addCleanup(silence.stop)
        self.temp = tempfile.TemporaryDirectory(prefix="g2-evidence-test-")
        self.addCleanup(self.temp.cleanup)
        self.batch = Path(self.temp.name)
        self.plan = E.read(E.PLAN_FILE)
        (self.batch / "prerequisite.log").write_text("synthetic unit fixture only\nG2_SELECTOR_OK:HTTP_2\n", encoding="utf-8")
        E.write_new(self.batch / "prerequisites.json", {
            "selectorEvidence": {"exitCode": 0, "log": "prerequisite.log", "sha256": E.sha(self.batch / "prerequisite.log")},
            "selector": "PASS", "commands": [{"exitCode": 0, "log": "prerequisite.log",
                                                "sha256": E.sha(self.batch / "prerequisite.log")} for _ in range(7)]})
        self.candidate = {"schemaVersion": 1, "verdictVersion": 1, "plan": self.plan,
                          "prerequisitesSha256": E.sha(self.batch / "prerequisites.json")}
        E.write_new(self.batch / "candidate.json", self.candidate)
        (self.batch / "candidate.sha256").write_text(E.sha(self.batch / "candidate.json"), encoding="ascii")

    def passing_executor(self, batch, run_dir):
        request = E.read(run_dir / "request.json")
        for name, report in zip(("playwright.json", "contract.json", "cleanup.json"),
                                passed_reports(request["scenario"])):
            if name == "cleanup.json":
                report["fixtureNamespace"] = request["runId"]
            E.write_new(run_dir / name, report)
        for stage in ("before", "after"):
            E.write_new(run_dir / f"identity-{stage}.json", {
                "candidateSha256": E.sha(batch / "candidate.json"), "verified": True})
        return 0

    def passing_batch(self):
        E.run_sequence(self.batch, self.passing_executor)
        return E.read(self.batch / "qualification.json")

    def passing_combination_executor(self, batch, run_dir):
        request = E.read(run_dir / "request.json")
        for name, report in zip(("playwright.json", "contract.json", "cleanup.json"),
                                passed_combination_reports(request["scenarios"])):
            if name == "cleanup.json":
                report["fixtureNamespace"] = request["runId"]
            E.write_new(run_dir / name, report)
        for stage in ("before", "after"):
            E.write_new(run_dir / f"identity-{stage}.json", {
                "candidateSha256": E.sha(batch / "candidate.json"), "verified": True})
        return 0

    def passing_combination(self):
        self.passing_batch()
        return E.run_combination(self.batch, self.passing_combination_executor)

    def rewrite_receipt(self, name, mutation):
        """连摘要一起改写，让反例真正命中语义校验而不只是 checksum。"""
        aggregate = self.passing_batch()
        row = aggregate["scenarios"][0]
        receipt_path = self.batch / row["receipt"]
        path = receipt_path.parent / name
        value = E.read(path)
        mutation(value)
        replace_json(path, value)
        receipt = E.read(receipt_path)
        receipt["files"][name] = E.sha(path)
        replace_json(receipt_path, receipt)
        row["sha256"] = E.sha(receipt_path)
        replace_json(self.batch / "qualification.json", aggregate)

    def test_complete_batch_recomputes_pass(self):
        self.passing_batch()
        self.assertEqual("ALL_SINGLE_SCENARIOS_PASS", E.verify_batch(self.batch)["status"])

    def test_first_failure_prevents_remaining_executions(self):
        calls = []
        def fail(batch, run_dir):
            calls.append(run_dir)
            return 1
        result = E.run_sequence(self.batch, fail)
        self.assertEqual(1, len(calls))
        self.assertEqual(["FAIL"] + ["NOT_RUN"] * 5, [row["status"] for row in result["scenarios"]])
        self.assertEqual("QUALIFICATION_FAILED", E.verify_batch(self.batch)["status"])

    def test_executor_exception_still_preserves_failed_receipt(self):
        def fail(batch, run_dir):
            raise OSError("test precondition")
        E.run_sequence(self.batch, fail)
        self.assertEqual("QUALIFICATION_FAILED", E.verify_batch(self.batch)["status"])

    def test_batch_cannot_be_reused_after_pass(self):
        self.passing_batch()
        with self.assertRaises(FileExistsError):
            E.run_sequence(self.batch, self.passing_executor)

    def test_missing_scene_is_rejected(self):
        result = self.passing_batch()
        result["scenarios"].pop()
        replace_json(self.batch / "qualification.json", result)
        with self.assertRaisesRegex(ValueError, "scenario"):
            E.verify_batch(self.batch)

    def test_duplicate_scene_is_rejected(self):
        result = self.passing_batch()
        result["scenarios"][1] = result["scenarios"][0]
        replace_json(self.batch / "qualification.json", result)
        with self.assertRaisesRegex(ValueError, "scenario"):
            E.verify_batch(self.batch)

    def test_reordered_scene_is_rejected(self):
        result = self.passing_batch()
        result["scenarios"].reverse()
        replace_json(self.batch / "qualification.json", result)
        with self.assertRaisesRegex(ValueError, "scenario"):
            E.verify_batch(self.batch)

    def test_reused_run_id_is_rejected(self):
        result = self.passing_batch()
        result["scenarios"][1]["runId"] = result["scenarios"][0]["runId"]
        replace_json(self.batch / "qualification.json", result)
        with self.assertRaisesRegex(ValueError, "duplicate runId"):
            E.verify_batch(self.batch)

    def test_candidate_bytes_drift_is_rejected(self):
        self.passing_batch()
        with (self.batch / "candidate.json").open("a") as stream:
            stream.write(" ")
        with self.assertRaisesRegex(ValueError, "candidate checksum"):
            E.verify_batch(self.batch)

    def test_raw_result_tampering_is_rejected(self):
        result = self.passing_batch()
        path = (self.batch / result["scenarios"][0]["receipt"]).parent / "playwright.json"
        with path.open("a") as stream:
            stream.write(" ")
        with self.assertRaisesRegex(ValueError, "checksum"):
            E.verify_batch(self.batch)

    def test_cleanup_failure_cannot_be_hidden_by_green_test(self):
        self.rewrite_receipt("cleanup.json", lambda value: value["checks"].update(apiKey="FAIL"))
        with self.assertRaisesRegex(ValueError, "cleanup"):
            E.verify_batch(self.batch)

    def test_missing_cleanup_is_rejected(self):
        result = self.passing_batch()
        (self.batch / result["scenarios"][0]["receipt"]).with_name("cleanup.json").unlink()
        with self.assertRaises(FileNotFoundError):
            E.verify_batch(self.batch)

    def test_fixture_namespace_must_match_unique_run_id(self):
        self.rewrite_receipt("cleanup.json", lambda value: value.update(fixtureNamespace="old-fixture"))
        with self.assertRaisesRegex(ValueError, "fixture identity"):
            E.verify_batch(self.batch)

    def test_unverified_identity_is_rejected(self):
        self.rewrite_receipt("identity-after.json", lambda value: value.update(verified=False))
        with self.assertRaisesRegex(ValueError, "identity"):
            E.verify_batch(self.batch)

    def test_missing_identity_file_cannot_be_hidden_by_receipt(self):
        aggregate = self.passing_batch()
        row = aggregate["scenarios"][0]
        receipt_path = self.batch / row["receipt"]
        receipt = E.read(receipt_path)
        receipt["files"].pop("identity-after.json")
        replace_json(receipt_path, receipt)
        row["sha256"] = E.sha(receipt_path)
        replace_json(self.batch / "qualification.json", aggregate)
        with self.assertRaisesRegex(ValueError, "missing evidence"):
            E.verify_batch(self.batch)

    def test_artifact_drift_fails_before_runner(self):
        self.candidate.update(sourceCommit="commit", files={}, configurationSha256="config", deployEnvSha256="env",
                              runtime={}, browser={"path": "browser", "sha256": "browser"},
                              artifacts={"bootstrap": {"path": "artifacts/bootstrap.jar", "sha256": "original"}})
        with patch.object(E, "load_candidate", return_value=self.candidate), \
                patch.object(E, "clean_head", return_value="commit"), \
                patch.object(E, "tracked_files", return_value={}), \
                patch.object(E, "configuration_digest", return_value="config"), \
                patch.object(E, "runtime", return_value={}), \
                patch.object(E, "sha", side_effect=["env", "browser", "modified"]):
            with self.assertRaisesRegex(ValueError, "artifact drift"):
                E.check_candidate(self.batch)

    def test_source_drift_fails_before_artifact_or_runtime_checks(self):
        self.candidate["sourceCommit"] = "original"
        with patch.object(E, "load_candidate", return_value=self.candidate), \
                patch.object(E, "clean_head", return_value="changed"):
            with self.assertRaisesRegex(ValueError, "source commit drift"):
                E.check_candidate(self.batch)

    def test_emqx_drift_fails_candidate_check(self):
        frozen = {"schemaVersion": 1, "image": "emqx/emqx:6.2.3", "clusterSha256": "old"}
        self.candidate.update(sourceCommit="commit", files={}, configurationSha256="config", deployEnvSha256="env",
                              runtime={}, browser={"path": "browser", "sha256": "browser"}, artifacts={},
                              emqxEnvironment={"fingerprint": E.stable_emqx_environment(frozen)})
        with patch.object(E, "load_candidate", return_value=self.candidate), \
                patch.object(E, "clean_head", return_value="commit"), \
                patch.object(E, "tracked_files", return_value={}), \
                patch.object(E, "configuration_digest", return_value="config"), \
                patch.object(E, "runtime", return_value={}), \
                patch.object(E, "sha", side_effect=["env", "browser"]), \
                patch.object(E, "current_emqx_environment",
                             return_value=E.stable_emqx_environment({**frozen, "clusterSha256": "new"})):
            with self.assertRaisesRegex(ValueError, "EMQX environment drift"):
                E.check_candidate(self.batch)

    def test_emqx_v2_ignores_raw_rewrite_when_full_semantic_projection_is_equal(self):
        frozen = emqx_v2(clusterSha256="5" * 64)
        current = emqx_v2(clusterSha256="6" * 64)
        self.assertEqual(E.stable_emqx_environment(frozen), E.stable_emqx_environment(current))
        self.assertNotIn("clusterSha256", E.stable_emqx_environment(frozen))

    def test_emqx_v2_effective_configuration_drift_fails_candidate_check(self):
        frozen = emqx_v2()
        current = emqx_v2(clusterIdentitySha256="9" * 64)
        self.candidate.update(sourceCommit="commit", files={}, configurationSha256="config", deployEnvSha256="env",
                              runtime={}, browser={"path": "browser", "sha256": "browser"}, artifacts={},
                              emqxEnvironment={"fingerprint": E.stable_emqx_environment(frozen)})
        with patch.object(E, "load_candidate", return_value=self.candidate), \
                patch.object(E, "clean_head", return_value="commit"), \
                patch.object(E, "tracked_files", return_value={}), \
                patch.object(E, "configuration_digest", return_value="config"), \
                patch.object(E, "runtime", return_value={}), \
                patch.object(E, "sha", side_effect=["env", "browser"]), \
                patch.object(E, "current_emqx_environment",
                             return_value=E.stable_emqx_environment(current)):
            with self.assertRaisesRegex(ValueError, "EMQX environment drift"):
                E.check_candidate(self.batch)

    def test_emqx_v2_missing_unknown_or_unhealthy_identity_is_fail_closed(self):
        incomplete = emqx_v2()
        incomplete.pop("clusterIdentitySha256")
        with self.assertRaisesRegex(ValueError, "incomplete"):
            E.stable_emqx_environment(incomplete)
        with self.assertRaisesRegex(ValueError, "unsupported"):
            E.stable_emqx_environment(emqx_v2(identityProjectionVersion=3))
        with self.assertRaisesRegex(ValueError, "durable ingress"):
            E.stable_emqx_environment(emqx_v2(durableIngress={"status": "UNKNOWN"}))
        with self.assertRaisesRegex(ValueError, "Runner callback"):
            callbacks = emqx_v2()["runnerCallbackContract"]
            E.stable_emqx_environment(emqx_v2(
                runnerCallbackContract={**callbacks, "callbackPort": 8081}))

    def test_historical_emqx_projection_keeps_raw_cluster_digest(self):
        historical = {"schemaVersion": 1, "image": "emqx/emqx:6.2.3",
                      "clusterSha256": "historical-raw"}
        self.assertEqual("historical-raw",
                         E.stable_emqx_environment(historical)["clusterSha256"])

    def test_emqx_durable_ingress_contract_is_part_of_candidate_identity(self):
        frozen = {"schemaVersion": 1, "image": "emqx/emqx:6.2.3", "clusterSha256": "same",
                  "durableIngress": {"status": "PASS", "legacyRawRuleHttpStatus": 404}}
        current = {**frozen, "durableIngress": {"status": "FAIL", "legacyRawRuleHttpStatus": 200}}
        self.candidate.update(sourceCommit="commit", files={}, configurationSha256="config", deployEnvSha256="env",
                              runtime={}, browser={"path": "browser", "sha256": "browser"}, artifacts={},
                              emqxEnvironment={"fingerprint": E.stable_emqx_environment(frozen)})
        with patch.object(E, "load_candidate", return_value=self.candidate), \
                patch.object(E, "clean_head", return_value="commit"), \
                patch.object(E, "tracked_files", return_value={}), \
                patch.object(E, "configuration_digest", return_value="config"), \
                patch.object(E, "runtime", return_value={}), \
                patch.object(E, "sha", side_effect=["env", "browser"]), \
                patch.object(E, "current_emqx_environment",
                             return_value=E.stable_emqx_environment(current)):
            with self.assertRaisesRegex(ValueError, "EMQX environment drift"):
                E.check_candidate(self.batch)

    def test_emqx_failure_stops_before_candidate_and_qualification_started(self):
        batch = self.batch / "pre-l4"
        batch.mkdir()

        def failed_qualifier(*args, **kwargs):
            evidence = batch / "environment/environment-qualification.json"
            evidence.parent.mkdir()
            evidence.write_text(json.dumps({"schemaVersion": 1, "status": "FAIL",
                                            "diagnostic": "redacted"}), encoding="utf-8")
            return subprocess.CompletedProcess(args[0], 1, "", "")

        with patch.object(E.subprocess, "run", side_effect=failed_qualifier):
            with self.assertRaisesRegex(ValueError, "environment qualification failed"):
                E.qualify_emqx_environment(batch)
        self.assertEqual("emqx-environment", E.read(batch / "prepare-failed.json")["phase"])
        self.assertFalse((batch / "candidate.json").exists())
        self.assertFalse((batch / "qualification-started.json").exists())

    def test_jshell_zero_exit_with_exception_is_not_a_pass(self):
        fake = subprocess.CompletedProcess([], 0, "java.lang.NoClassDefFoundError: java/net/http/HttpClient", "")
        with patch.object(E.subprocess, "run", return_value=fake):
            with self.assertRaisesRegex(ValueError, "selector precondition"):
                E.probe_selector(self.batch)
        self.assertTrue((self.batch / "selector.log").is_file())
        self.assertEqual("selector", E.read(self.batch / "prepare-failed.json")["phase"])

    def test_selector_module_is_resolved_in_jshell_tool_vm(self):
        def fake(args, **kwargs):
            self.assertIn("-J--add-modules=java.net.http", args)
            return subprocess.CompletedProcess(args, 0, "G2_SELECTOR_OK:HTTP_2\n", "")
        with patch.object(E.subprocess, "run", side_effect=fake):
            result = E.probe_selector(self.batch)
        self.assertEqual(E.sha(self.batch / "selector.log"), result["sha256"])

    def test_runtime_lease_prevents_parallel_qualification(self):
        with patch.object(E, "ROOT", self.batch):
            with E.runtime_lease(self.batch):
                with self.assertRaises(FileExistsError):
                    with E.runtime_lease(self.batch):
                        self.fail("duplicate lease acquired")
            self.assertFalse((self.batch / "runtime.lock").exists())

    def test_skipped_result_is_rejected_even_with_recomputed_hash(self):
        self.rewrite_receipt("playwright.json", lambda value:
                            value["suites"][0]["specs"][0]["tests"][0]["results"][0].update(status="skipped"))
        with self.assertRaisesRegex(ValueError, "skipped"):
            E.verify_batch(self.batch)

    def test_retried_result_is_rejected(self):
        reports = passed_reports(E.SCENARIOS[0])
        reports[0]["suites"][0]["specs"][0]["tests"][0]["results"][0]["retry"] = 1
        with self.assertRaisesRegex(ValueError, "retried"):
            E.validate_results(*reports, E.SCENARIOS[0], self.plan)

    def test_empty_report_is_not_pass(self):
        reports = passed_reports(E.SCENARIOS[0])
        with self.assertRaisesRegex(ValueError, "test count"):
            E.validate_results({}, reports[1], reports[2], E.SCENARIOS[0], self.plan)

    def test_contract_missing_assertions_is_rejected(self):
        self.rewrite_receipt("contract.json", lambda value: value.update(testResults=[]))
        with self.assertRaisesRegex(ValueError, "assertions"):
            E.verify_batch(self.batch)

    def test_wrong_scenario_cannot_supply_pass(self):
        self.rewrite_receipt("playwright.json", lambda value:
                            value["suites"][0]["specs"][0].update(file="other.spec.ts"))
        with self.assertRaisesRegex(ValueError, "wrong scenario"):
            E.verify_batch(self.batch)

    def test_paths_cannot_escape_root(self):
        for path in ("../outside", "/absolute", "C:/outside", "runs\\outside"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                E.inside(self.batch, path)

    def test_symlink_escape_is_rejected(self):
        target = self.batch / "link"
        # Windows 不保证授予创建符号链接权限，模拟 resolve 的外部目标，同样覆盖边界判定。
        original_resolve = Path.resolve
        with patch.object(Path, "resolve", autospec=True,
                          side_effect=lambda path: self.batch.parent if path == target else original_resolve(path)):
            with self.assertRaises(ValueError):
                E.inside(self.batch, "link")
        self.assertFalse(target.exists())

    def test_zip_round_trip_is_independently_verified(self):
        self.passing_batch()
        export_root = self.batch / "repo"
        (export_root / "docs/delivery/verification").mkdir(parents=True)
        with patch.object(E, "REPO", export_root):
            path = E.export_batch(self.batch)
        self.assertEqual("ALL_SINGLE_SCENARIOS_PASS", E.verify_zip(path)["status"])

    def test_zip_duplicate_entry_is_rejected(self):
        self.passing_batch()
        path = self.batch / "duplicate.zip"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("checksums.json", "{}")
            archive.writestr("checksums.json", "{}")
        with self.assertRaisesRegex(ValueError, "duplicate ZIP"):
            E.verify_zip(path)

    def test_combination_requires_complete_l4(self):
        with self.assertRaises((FileNotFoundError, ValueError)):
            E.run_combination(self.batch, self.passing_combination_executor)

    def test_combination_recomputes_pass_and_binds_l4(self):
        result = self.passing_combination()
        self.assertEqual("COMBINATION_PASS", result["status"])
        verified = E.verify_combination(self.batch)
        self.assertEqual(E.sha(self.batch / "qualification.json"), verified["qualificationSha256"])

    def test_combination_cannot_run_twice_for_same_candidate(self):
        self.passing_combination()
        with self.assertRaises(FileExistsError):
            E.run_combination(self.batch, self.passing_combination_executor)

    def test_combination_reordered_scenarios_are_rejected(self):
        self.passing_combination()
        aggregate = E.read(self.batch / "combination.json")
        receipt_path = self.batch / aggregate["receipt"]
        receipt = E.read(receipt_path)
        report_path = receipt_path.parent / "playwright.json"
        report = E.read(report_path)
        report["suites"][0]["specs"].reverse()
        replace_json(report_path, report)
        receipt["files"]["playwright.json"] = E.sha(report_path)
        replace_json(receipt_path, receipt)
        aggregate["sha256"] = E.sha(receipt_path)
        replace_json(self.batch / "combination.json", aggregate)
        with self.assertRaisesRegex(ValueError, "scenario order"):
            E.verify_combination(self.batch)

    def test_combination_cleanup_failure_cannot_be_hidden(self):
        self.passing_combination()
        aggregate = E.read(self.batch / "combination.json")
        receipt_path = self.batch / aggregate["receipt"]
        receipt = E.read(receipt_path)
        cleanup_path = receipt_path.parent / "cleanup.json"
        cleanup = E.read(cleanup_path)
        cleanup["checks"]["ports"] = "FAIL"
        replace_json(cleanup_path, cleanup)
        receipt["files"]["cleanup.json"] = E.sha(cleanup_path)
        replace_json(receipt_path, receipt)
        aggregate["sha256"] = E.sha(receipt_path)
        replace_json(self.batch / "combination.json", aggregate)
        with self.assertRaisesRegex(ValueError, "cleanup"):
            E.verify_combination(self.batch)

    def test_combination_first_failure_marks_remaining_not_run(self):
        self.passing_batch()

        def failing_executor(batch, run_dir):
            request = E.read(run_dir / "request.json")
            playwright, contract, cleanup = passed_combination_reports(request["scenarios"])
            tests = playwright["suites"][0]["specs"]
            tests[1]["ok"] = False
            tests[1]["tests"][0]["status"] = "unexpected"
            tests[1]["tests"][0]["results"][0]["status"] = "failed"
            for spec in tests[2:]:
                spec["tests"][0]["results"] = []
            cleanup["runnerExitCode"] = 1
            cleanup["fixtureNamespace"] = request["runId"]
            for name, report in zip(("playwright.json", "contract.json", "cleanup.json"),
                                    (playwright, contract, cleanup)):
                E.write_new(run_dir / name, report)
            return 1

        result = E.run_combination(self.batch, failing_executor)
        self.assertEqual("COMBINATION_FAILED", result["status"])
        receipt = E.read(self.batch / result["receipt"])
        self.assertEqual(["PASS", "FAIL"] + ["NOT_RUN"] * 4,
                         [row["status"] for row in receipt["scenarioResults"]])
        self.assertEqual("COMBINATION_FAILED", E.verify_combination(self.batch)["status"])

    def test_combination_executor_exception_is_in_failure_closure(self):
        self.passing_batch()

        def failing_executor(batch, run_dir):
            raise OSError("combination precondition")

        result = E.run_combination(self.batch, failing_executor)
        receipt = E.read(self.batch / result["receipt"])
        self.assertIn("execution-error.json", receipt["files"])
        self.assertEqual("COMBINATION_FAILED", E.verify_combination(self.batch)["status"])

    def test_failed_combination_request_tampering_is_rejected(self):
        self.passing_batch()

        def failing_executor(batch, run_dir):
            raise OSError("combination precondition")

        result = E.run_combination(self.batch, failing_executor)
        receipt_path = self.batch / result["receipt"]
        receipt = E.read(receipt_path)
        request_path = receipt_path.parent / "request.json"
        request = E.read(request_path)
        request["scenarios"].reverse()
        replace_json(request_path, request)
        receipt["files"]["request.json"] = E.sha(request_path)
        replace_json(receipt_path, receipt)
        result["sha256"] = E.sha(receipt_path)
        replace_json(self.batch / "combination.json", result)
        with self.assertRaisesRegex(ValueError, "request mismatch"):
            E.verify_combination(self.batch)

    def test_combination_zip_round_trip_is_independently_verified(self):
        self.passing_combination()
        export_root = self.batch / "repo-combination"
        (export_root / "docs/delivery/verification").mkdir(parents=True)
        with patch.object(E, "REPO", export_root):
            path = E.export_combination(self.batch)
        self.assertEqual("COMBINATION_PASS", E.verify_combination_zip(path)["status"])


class RunnerEvidenceWiringTests(unittest.TestCase):
    """静态接线合同防止实现绕开已经校验的冻结构件和首败停止。"""

    def test_runner_supports_verified_frozen_artifacts(self):
        source = (SCRIPTS / "run-e2e-tests.sh").read_text(encoding="utf-8")
        self.assertTrue('JAR="${E2E_BACKEND_JAR}"' in source)
        self.assertTrue('SIM_JAR="${E2E_SIMULATOR_JAR}"' in source)
        self.assertTrue('e2e-evidence.py" check' in source)
        self.assertTrue('E2E_MATRIX_SPECS' in source)

    def test_playwright_stops_after_first_direct_failure(self):
        source = (SCRIPTS.parent / "playwright.config.ts").read_text(encoding="utf-8")
        self.assertTrue("maxFailures: 1" in source)

    def test_actual_playwright_fail_fast_without_browser_or_middleware(self):
        """用真实 Playwright 引擎制造局部失败，证明后例 NOT_RUN；不启动浏览器和服务。"""
        E.ROOT.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="failfast-", dir=E.ROOT) as temp:
            root = Path(temp)
            config = root / "probe.config.ts"
            config.write_text(
                f'import base from {json.dumps((SCRIPTS.parent / "playwright.config.ts").as_posix())}\n'
                'export default {...base, testDir: ".", testMatch: "probe.spec.ts", '
                f'outputDir: {json.dumps((root / "output").as_posix())}, '
                f'reporter: [["json", {{outputFile: {json.dumps((root / "result.json").as_posix())}}}]]}}\n',
                encoding="utf-8")
            (root / "probe.spec.ts").write_text(
                'import { test, expect } from "@playwright/test"\n'
                'test("first intentionally fails", () => expect(1).toBe(2))\n'
                'test("second must not run", () => expect(true).toBe(true))\n', encoding="utf-8")
            result = subprocess.run([E.bash(), "-lc",
                                     f'./node_modules/.bin/playwright test --config="{config.as_posix()}"'],
                                    cwd=SCRIPTS.parent, capture_output=True, timeout=60,
                                    env={**os.environ, "E2E_RUN_DIR": ""})
            self.assertNotEqual(0, result.returncode)
            report = E.read(root / "result.json")
            results = E.playwright_tests(report)
            self.assertEqual(2, len(results))
            self.assertEqual("failed", results[0][1]["results"][0]["status"])
            # Playwright 1.62 对 fail-fast 未领取的测试使用空 results，而不是执行后的 skipped attempt。
            self.assertEqual([], results[1][1]["results"])

    def test_git_bash_preserves_effective_configuration_fingerprint(self):
        script = (SCRIPTS / "e2e-evidence.py").as_posix()
        child = E.command([E.bash(), "-lc", f'''python3 -c 'import runpy; m=runpy.run_path("{script}"); print(m["configuration_digest"]())' '''])
        self.assertEqual(E.configuration_digest(), child)


if __name__ == "__main__":
    unittest.main()

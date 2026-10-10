"""EMQX durable ingress 运行时合同测试。"""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "verify-emqx-durable-ingress.py"
SPEC = importlib.util.spec_from_file_location("verify_emqx_durable_ingress", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def valid_rule() -> dict:
    """返回 EMQX API 的最小合格规则。"""
    return {
        "id": "tc_durable_uplink",
        "sql": MODULE.EXPECTED_SQL, "from": [MODULE.EXPECTED_FROM],
        "enable": True,
        "actions": [{
            "function": "republish",
            "args": {
                "topic": "tc/internal/v1/ingress/uplink",
                "qos": 1,
                "retain": False,
                "direct_dispatch": False, "payload": "${.}",
            },
        }],
    }


class DurableIngressContractTests(unittest.TestCase):
    """防止 E2E 再次把旧 Webhook 存在误当成当前资格。"""

    def test_accepts_exact_durable_contract(self) -> None:
        self.assertEqual([], MODULE.verify(valid_rule(), 404, 404))

    def test_rejects_legacy_message_entry(self) -> None:
        failures = MODULE.verify(valid_rule(), 200, 200)
        self.assertTrue(any("tc_raw_uplink" in failure for failure in failures))
        self.assertTrue(any("tc_command_reply" in failure for failure in failures))

    def test_rejects_early_ack_republish(self) -> None:
        rule = valid_rule()
        rule["actions"][0]["args"]["direct_dispatch"] = True
        self.assertTrue(any("direct_dispatch" in failure
                            for failure in MODULE.verify(rule, 404, 404)))

    def test_rejects_every_durable_rule_identity_field_drift(self) -> None:
        mutations = {
            "id": lambda rule: rule.update(id="other"),
            "missing-sql": lambda rule: rule.pop("sql"),
            "schema": lambda rule: rule.update(sql=rule["sql"].replace("SELECT 2","SELECT 1")),
            "wire-client": lambda rule: rule.update(sql=rule["sql"].replace("client_attrs.tc_auth_wire_client_id AS clientId","clientid AS clientId")),
            "wire-topic": lambda rule: rule.update(sql=rule["sql"].replace("substr(topic, strlen(client_attrs.tc_auth_mountpoint)) AS topic","topic")),
            "bare-source": lambda rule: rule.update(**{"from":["tc/v1/+/+/up/#"]}),
            "payload": lambda rule: rule["actions"][0]["args"].update(payload="${payload}"),
            "enable": lambda rule: rule.update(enable=False),
            "action-count": lambda rule: rule.update(actions=[]),
            "function": lambda rule: rule["actions"][0].update(function="webhook"),
            "topic": lambda rule: rule["actions"][0]["args"].update(topic="other"),
            "qos": lambda rule: rule["actions"][0]["args"].update(qos=0),
            "retain": lambda rule: rule["actions"][0]["args"].update(retain=True),
            "direct-dispatch": lambda rule: rule["actions"][0]["args"].update(direct_dispatch=True),
        }
        for name, mutate in mutations.items():
            with self.subTest(field=name):
                rule = valid_rule()
                mutate(rule)
                self.assertTrue(MODULE.verify(rule, 404, 404))

    def test_rejects_each_legacy_entrypoint_independently(self) -> None:
        for raw_status, command_status in ((200, 404), (404, 200), (500, 404), (404, 500)):
            with self.subTest(raw=raw_status, command=command_status):
                self.assertTrue(MODULE.verify(valid_rule(), raw_status, command_status))

    def test_e2e_runner_enables_and_qualifies_ingress_owner(self) -> None:
        """防止后端再次以默认 disabled 启动，却把空状态留给页面超时发现。"""
        runner = (SCRIPT.parent / "run-e2e-tests.sh").read_text(encoding="utf-8")
        self.assertIn("THINGS_CLOUD_INGRESS_HANDOFF_ENABLED=true", runner)
        self.assertIn('THINGS_CLOUD_INGRESS_HANDOFF_PASSWORD="${INGRESS_HANDOFF_PASSWORD}"', runner)
        self.assertIn("wait_for_durable_ingress_ready", runner)
        self.assertIn("thingscloud_ingress_handoff_connected", runner)
        self.assertIn("grep -Eq '^thingscloud_ingress_handoff_connected", runner)
        self.assertIn('<<< "${metrics}"', runner)
        self.assertNotIn("printf '%s\\n' \"${metrics}\"", runner)


if __name__ == "__main__":
    unittest.main()

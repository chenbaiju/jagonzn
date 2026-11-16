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


def valid_rule() -> list[dict]:
    """返回当前精确闭集的最小合格API规则，不能代替真实Broker匹配资格。"""
    return MODULE.expected_rules()


class DurableIngressContractTests(unittest.TestCase):
    """防止 E2E 再次把旧 Webhook 存在误当成当前资格。"""

    def test_accepts_exact_durable_contract(self) -> None:
        self.assertEqual([], MODULE.verify(valid_rule(), 404, 404))

    def test_data_qos_zero_never_downgrades_internal_handoff_or_other_rules(self) -> None:
        rules = valid_rule()
        self.assertIn("WHERE (qos = 0 OR qos = 1) AND", MODULE.EXPECTED_DATA_SQL)
        for rule in rules:
            self.assertEqual(1, rule["actions"][0]["args"]["qos"])
            if rule["id"] != MODULE.DATA_RULE_ID:
                self.assertIn("WHERE qos = 1 AND", rule["sql"])
        data = next(rule for rule in rules if rule["id"] == MODULE.DATA_RULE_ID)
        base = (SCRIPT.parents[2] / "deploy/emqx/base.hocon").read_text()
        self.assertIn(MODULE.EXPECTED_DATA_SQL, base)
        data["actions"][0]["args"]["qos"] = 0
        self.assertTrue(MODULE.verify(rules, 404, 404))

    def test_rejects_legacy_message_entry(self) -> None:
        failures = MODULE.verify(valid_rule(), 200, 200)
        self.assertTrue(any("tc_raw_uplink" in failure for failure in failures))
        self.assertTrue(any("tc_command_reply" in failure for failure in failures))

    def test_rejects_early_ack_republish(self) -> None:
        rule = valid_rule()
        rule[0]["actions"][0]["args"]["direct_dispatch"] = True
        self.assertTrue(any("direct_dispatch" in failure
                            for failure in MODULE.verify(rule, 404, 404)))

    def test_rejects_every_durable_rule_identity_field_drift(self) -> None:
        mutations = {
            "id": lambda rule: rule[0].update(id="other"),
            "missing-sql": lambda rule: rule[0].pop("sql"),
            "schema": lambda rule: rule[0].update(sql=rule[0]["sql"].replace("SELECT 2","SELECT 1")),
            "wire-client": lambda rule: rule[0].update(sql=rule[0]["sql"].replace("client_attrs.tc_auth_wire_client_id AS clientId","clientid AS clientId")),
            "wire-topic": lambda rule: rule[0].update(sql=rule[0]["sql"].replace("substr(topic, strlen(client_attrs.tc_auth_mountpoint)) AS topic","topic")),
            "bare-source": lambda rule: rule[0].update(**{"from":["tc/v1/+/+/up/#"]}),
            "payload": lambda rule: rule[0]["actions"][0]["args"].update(payload="${payload}"),
            "enable": lambda rule: rule[0].update(enable=False),
            "action-count": lambda rule: rule[0].update(actions=[]),
            "function": lambda rule: rule[0]["actions"][0].update(function="webhook"),
            "topic": lambda rule: rule[0]["actions"][0]["args"].update(topic="other"),
            "qos": lambda rule: rule[0]["actions"][0]["args"].update(qos=0),
            "retain": lambda rule: rule[0]["actions"][0]["args"].update(retain=True),
            "direct-dispatch": lambda rule: rule[0]["actions"][0]["args"].update(direct_dispatch=True),
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

    def test_rejects_missing_duplicate_extra_or_single_rule_input(self):
        import copy
        good = valid_rule()
        malformed = copy.deepcopy(good)
        malformed[0]["id"] = {"untrusted": "id"}
        for candidate in (good[0], good[:1], good * 2, [good[0], copy.deepcopy(good[0])], malformed, None):
            with self.subTest(candidate=candidate):
                self.assertTrue(MODULE.verify(candidate, 404, 404))

    def test_rejects_get_session_projection_and_broad_exclusion_drift(self):
        import copy
        for index, before, after in [(0, " AND regex_match(topic,", " AND regex_match('other',"),
                                      (1, "SELECT 3", "SELECT 2"),
                                      (1, "tc_auth_config_version", "payload.configVersion"),
                                      (1, "tc_auth_connection_id", "payload.connectionId"),
                                      (1, " AS mqttSession", " AS userSession")]:
            rules = copy.deepcopy(valid_rule())
            self.assertIn(before, rules[index]["sql"])
            rules[index]["sql"] = rules[index]["sql"].replace(before, after)
            self.assertTrue(MODULE.verify(rules, 404, 404))

    def test_rejects_action_args_extra_and_boolean_qos_for_either_rule(self):
        import copy
        for index in (0, 1):
            for key, value in [("unknown", True), ("qos", True), ("retain", 0), ("direct_dispatch", True)]:
                rules = copy.deepcopy(valid_rule())
                rules[index]["actions"][0]["args"][key] = value
                self.assertTrue(MODULE.verify(rules, 404, 404))

    def test_static_base_contains_exact_partition_but_does_not_claim_broker_parse(self):
        import re
        base = (SCRIPT.parents[2] / "deploy/emqx/base.hocon").read_text()
        sqls = dict(re.findall(r'rule_engine.rules.(tc_durable_[a-z_]+) = \{.*?sql = """(.*?)"""', base, re.S))
        self.assertEqual(MODULE.RULE_SQL, sqls)
        projection = MODULE.EXPECTED_GET_SQL.split(' FROM ', 1)[0]
        self.assertIn("map_get('tc_auth_config_version', client_attrs, '')", projection)
        self.assertIn("map_get('tc_auth_connection_id', client_attrs, '')", projection)
        self.assertNotIn("payload.configVersion", projection)

    def test_mixed_exact_rules_keep_v3_session_and_never_overlap_broad(self):
        import copy
        import re
        broad = MODULE.EXPECTED_SQL
        expression = broad.split("regex_match(topic, '", 1)[1].split("') = false", 1)[0]
        for suffix in ("property/get", "property/set/capability", "property/set/v2/reply"):
            self.assertRegex("tc/private/device/device/7/tc/v1/project/device/up/"+suffix, expression)
        self.assertIsNone(re.fullmatch(expression, "tc/private/device/device/7/tc/v1/project/device/up/property/set/reply"))
        for key in (MODULE.MIXED_CAPABILITY_RULE_ID, MODULE.MIXED_REPLY_RULE_ID):
            self.assertTrue(MODULE.RULE_SQL[key].startswith("SELECT 3 AS schemaVersion"))
            self.assertIn("AS mqttSession", MODULE.RULE_SQL[key])
            changed=copy.deepcopy(valid_rule())
            next(rule for rule in changed if rule["id"]==key)["sql"]=MODULE.RULE_SQL[key].replace("SELECT 3", "SELECT 2")
            self.assertTrue(MODULE.verify(changed,404,404))

    def test_data_exact_v3_keeps_original_bytes_session_and_broad_excludes_whole_subtree(self):
        import copy
        import re
        sql=MODULE.RULE_SQL[MODULE.DATA_RULE_ID]
        self.assertTrue(sql.startswith("SELECT 3 AS schemaVersion"))
        self.assertEqual('tc/private/device/+/+/tc/v1/+/+/up/data/+',MODULE.RULE_FROM[MODULE.DATA_RULE_ID])
        for text in ("base64_encode(payload) AS payloadBase64","AS mqttSession","qos = 1","flags.retain = false"):
            self.assertIn(text,sql)
        exclusion=MODULE.EXPECTED_SQL.rsplit("regex_match(topic, '",1)[1].split("') = false",1)[0]
        for suffix in ("data","data/raw","data/raw/extra","data/+","data/"):
            self.assertRegex('tc/private/device/device/7/tc/v1/project/device/up/'+suffix,exclusion)
        self.assertIsNone(re.fullmatch(exclusion,'tc/v1/project/device/up/property/report'))
        changed=copy.deepcopy(valid_rule());next(r for r in changed if r['id']==MODULE.DATA_RULE_ID)['sql']=sql.replace('SELECT 3','SELECT 2')
        self.assertTrue(MODULE.verify(changed,404,404))

    def test_actual_complete_default_shape_preserves_canonical_facts_and_input(self):
        import copy
        expected = valid_rule()
        runtime = copy.deepcopy(expected)
        for rule in runtime:
            rule["actions"][0]["args"].update(mqtt_properties={}, user_properties="${user_properties}")
        original = copy.deepcopy(runtime)
        self.assertEqual([], MODULE.verify(runtime, 404, 404))
        self.assertEqual(MODULE.contract_facts(expected), MODULE.contract_facts(runtime))
        self.assertEqual(original, runtime)
        for index in (0, 1):
            self.assertEqual(expected[index]["actions"], MODULE.canonical_actions(runtime[index]["actions"]))

    def test_partial_unknown_or_nondefault_runtime_fields_never_get_valid_facts(self):
        import copy
        expected_hash = MODULE.contract_facts(valid_rule())["ruleContractSha256"]
        for index in (0, 1):
            changes = [lambda a: a.update(mqtt_properties={}), lambda a: a.update(user_properties="${user_properties}"),
                       lambda a: a.update(mqtt_properties={}, user_properties="${user_properties}", unknown=False),
                       lambda a: a.update(mqtt_properties={"message_expiry_interval": 1}, user_properties="${user_properties}"),
                       lambda a: a.update(mqtt_properties=[], user_properties="${user_properties}"),
                       lambda a: a.update(mqtt_properties={}, user_properties="${pub_props.user_properties}"),
                       lambda a: a.update(mqtt_properties={}, user_properties=[]),
                       lambda a: a.update(mqtt_properties={}, user_properties="${user_properties}", qos=True),
                       lambda a: a.update(mqtt_properties={}, user_properties="${user_properties}", payload="${payload}")]
            for mutate in changes:
                runtime = copy.deepcopy(valid_rule())
                mutate(runtime[index]["actions"][0]["args"])
                with self.subTest(rule=index, args=runtime[index]["actions"][0]["args"]):
                    self.assertTrue(MODULE.verify(runtime, 404, 404))
                    self.assertIsNone(MODULE.contract_facts(runtime)["ruleContractSha256"])
                    self.assertNotEqual(expected_hash, MODULE.contract_facts(runtime)["ruleContractSha256"])

    def test_device_packet_bounds_keep_management_and_device_limits_separate(self):
        import copy
        config = {"mqtt": {"max_packet_size": "2MB"}, "zones": {"tc_device": {"mqtt": {"max_packet_size": "1MB"}}},
                  "listeners": {family: {"default": {"enable": True, "zone": "tc_device"}} for family in ("tcp", "ssl", "ws", "wss")}}
        facts = MODULE.verify_device_packet_bounds(config)
        self.assertEqual(2097152, facts["globalMaxPacketBytes"])
        self.assertEqual(1048576, facts["deviceMaxPacketBytes"])
        for mutate in (lambda c: c["mqtt"].update(max_packet_size="1MB"),
                       lambda c: c["mqtt"].update(max_packet_size=True),
                       lambda c: c["zones"]["tc_device"]["mqtt"].update(max_packet_size=1048576.0),
                       lambda c: c["zones"]["tc_device"]["mqtt"].update(max_packet_size="2MB"),
                       lambda c: c["listeners"]["tcp"]["default"].update(zone="default"),
                       lambda c: c.update(zones={})):
            bad = copy.deepcopy(config)
            mutate(bad)
            with self.assertRaises(ValueError):
                MODULE.verify_device_packet_bounds(bad)
        numeric = copy.deepcopy(config)
        numeric["mqtt"]["max_packet_size"] = 2097152
        numeric["zones"]["tc_device"]["mqtt"]["max_packet_size"] = 1048576
        self.assertEqual(facts, MODULE.verify_device_packet_bounds(numeric))

    def test_e2e_runner_enables_and_qualifies_ingress_owner(self) -> None:
        """防止后端再次以默认 disabled 启动，却把空状态留给页面超时发现。"""
        runner = (SCRIPT.parent / "run-e2e-tests.sh").read_text(encoding="utf-8")
        self.assertIn("THINGS_LINK_INGRESS_HANDOFF_ENABLED=true", runner)
        self.assertIn('THINGS_LINK_INGRESS_HANDOFF_PASSWORD="${INGRESS_HANDOFF_PASSWORD}"', runner)
        self.assertIn("wait_for_durable_ingress_ready", runner)
        self.assertIn("/api/v5/rules/tc_durable_property_get", runner)
        self.assertIn('"${rules}" | python3', runner)
        for key in (MODULE.MIXED_CAPABILITY_RULE_ID,MODULE.MIXED_REPLY_RULE_ID,MODULE.DATA_RULE_ID):
            self.assertIn('/api/v5/rules/'+key,runner)
        self.assertIn("thingslink_ingress_handoff_connected", runner)
        self.assertIn("grep -Eq '^thingslink_ingress_handoff_connected", runner)
        self.assertIn('<<< "${metrics}"', runner)
        self.assertNotIn("printf '%s\\n' \"${metrics}\"", runner)


if __name__ == "__main__":
    unittest.main()

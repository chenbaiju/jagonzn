#!/usr/bin/env python3
"""校验精确获取/混合声明与回复的互斥durable republish规则；不解析或执行Broker SQL。"""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from typing import Any

EXPECTED_TOPIC = "tc/internal/v1/ingress/uplink"
EXPECTED_FROM = "tc/private/device/+/+/tc/v1/+/+/up/#"
EXPECTED_GET_FROM = "tc/private/device/+/+/tc/v1/+/+/up/property/get"
BROAD_RULE_ID = "tc_durable_uplink"
GET_RULE_ID = "tc_durable_property_get"
TOKEN_USERNAME_PROJECTION = "CASE WHEN is_null(username) THEN username WHEN regex_match(username, '^[0-9a-f]{64}$') THEN '0000000000000000000000000000000000000000000000000000000000000000' ELSE username END AS username"
EXPECTED_SQL = 'SELECT 2 AS schemaVersion, id AS handoffId, CASE WHEN is_null(username) THEN username WHEN regex_match(username, \'^[0-9a-f]{64}$\') THEN \'0000000000000000000000000000000000000000000000000000000000000000\' ELSE username END AS username, substr(topic, strlen(client_attrs.tc_auth_mountpoint)) AS topic, base64_encode(payload) AS payloadBase64, qos, flags.retain AS retained, client_attrs.tc_auth_wire_client_id AS clientId, publish_received_at AS publishedAtMs, node AS brokerNode, CASE WHEN is_null(client_attrs.tc_auth_tenant_id) AND is_null(client_attrs.tc_auth_project_id) AND is_null(client_attrs.tc_auth_device_id) AND is_null(client_attrs.tc_auth_credential_version) THEN json_decode(\'null\') ELSE map_put(\'credentialVersion\', map_get(\'tc_auth_credential_version\', client_attrs, \'\'), map_put(\'deviceId\', map_get(\'tc_auth_device_id\', client_attrs, \'\'), map_put(\'projectId\', map_get(\'tc_auth_project_id\', client_attrs, \'\'), map_put(\'tenantId\', map_get(\'tc_auth_tenant_id\', client_attrs, \'\'), json_decode(\'{}\'))))) END AS authenticatedIdentity FROM "tc/private/device/+/+/tc/v1/+/+/up/#" WHERE qos = 1 AND flags.retain = false AND regex_match(topic, \'^(tc/private/device/[^/]*/[^/]*/)?tc/v1/[^/]*/[^/]*/up/property/(get|set/capability|set/v2/reply)$\') = false AND regex_match(topic, \'^(tc/private/device/[^/]*/[^/]*/)?tc/v1/[^/]*/[^/]*/up/data(/.*)?$\') = false'
EXPECTED_GET_SQL = 'SELECT 3 AS schemaVersion, id AS handoffId, CASE WHEN is_null(username) THEN username WHEN regex_match(username, \'^[0-9a-f]{64}$\') THEN \'0000000000000000000000000000000000000000000000000000000000000000\' ELSE username END AS username, substr(topic, strlen(client_attrs.tc_auth_mountpoint)) AS topic, base64_encode(payload) AS payloadBase64, qos, flags.retain AS retained, client_attrs.tc_auth_wire_client_id AS clientId, publish_received_at AS publishedAtMs, node AS brokerNode, CASE WHEN is_null(client_attrs.tc_auth_tenant_id) AND is_null(client_attrs.tc_auth_project_id) AND is_null(client_attrs.tc_auth_device_id) AND is_null(client_attrs.tc_auth_credential_version) THEN json_decode(\'null\') ELSE map_put(\'credentialVersion\', map_get(\'tc_auth_credential_version\', client_attrs, \'\'), map_put(\'deviceId\', map_get(\'tc_auth_device_id\', client_attrs, \'\'), map_put(\'projectId\', map_get(\'tc_auth_project_id\', client_attrs, \'\'), map_put(\'tenantId\', map_get(\'tc_auth_tenant_id\', client_attrs, \'\'), json_decode(\'{}\'))))) END AS authenticatedIdentity, map_put(\'connectionId\', map_get(\'tc_auth_connection_id\', client_attrs, \'\'), map_put(\'configVersion\', map_get(\'tc_auth_config_version\', client_attrs, \'\'), json_decode(\'{}\'))) AS mqttSession FROM "tc/private/device/+/+/tc/v1/+/+/up/property/get" WHERE qos = 1 AND flags.retain = false'
MIXED_CAPABILITY_RULE_ID = "tc_durable_property_mixed_capability"
MIXED_REPLY_RULE_ID = "tc_durable_property_mixed_reply"
EXPECTED_MIXED_CAPABILITY_FROM = EXPECTED_GET_FROM.replace("/property/get", "/property/set/capability")
EXPECTED_MIXED_REPLY_FROM = EXPECTED_GET_FROM.replace("/property/get", "/property/set/v2/reply")
EXPECTED_MIXED_CAPABILITY_SQL = EXPECTED_GET_SQL.replace(EXPECTED_GET_FROM, EXPECTED_MIXED_CAPABILITY_FROM)
EXPECTED_MIXED_REPLY_SQL = EXPECTED_GET_SQL.replace(EXPECTED_GET_FROM, EXPECTED_MIXED_REPLY_FROM)
DATA_RULE_ID = "tc_durable_data_uplink"
EXPECTED_DATA_FROM = EXPECTED_GET_FROM.replace("/property/get", "/data/#")
EXPECTED_DATA_SQL = EXPECTED_GET_SQL.replace(EXPECTED_GET_FROM, EXPECTED_DATA_FROM).replace("WHERE qos = 1 AND", "WHERE (qos = 0 OR qos = 1) AND") + " AND regex_match(topic, '^(tc/private/device/[^/]*/[^/]*/)?tc/v1/[^/]*/[^/]*/up/data(/[A-Za-z0-9_-]{1,64}){1,7}$')"
RULE_SQL = {BROAD_RULE_ID: EXPECTED_SQL, GET_RULE_ID: EXPECTED_GET_SQL,
            MIXED_CAPABILITY_RULE_ID: EXPECTED_MIXED_CAPABILITY_SQL, MIXED_REPLY_RULE_ID: EXPECTED_MIXED_REPLY_SQL, DATA_RULE_ID: EXPECTED_DATA_SQL}
RULE_FROM = {BROAD_RULE_ID: EXPECTED_FROM, GET_RULE_ID: EXPECTED_GET_FROM,
             MIXED_CAPABILITY_RULE_ID: EXPECTED_MIXED_CAPABILITY_FROM, MIXED_REPLY_RULE_ID: EXPECTED_MIXED_REPLY_FROM, DATA_RULE_ID: EXPECTED_DATA_FROM}
EXPECTED_ARGS = {"topic": EXPECTED_TOPIC, "qos": 1, "retain": False,
                 "payload": "${.}", "direct_dispatch": False}


DEVICE_PACKET_BOUNDS = {"version": 1, "globalMaxPacketBytes": 2097152,
                        "deviceZone": "tc_device", "deviceMaxPacketBytes": 1048576}


def verify_device_packet_bounds(effective: Any) -> dict[str, Any]:
    """管理API全局2MiB与每个启用设备监听器zone1MiB必须同时成立。"""
    def require_bound(value, why):
        if not value:
            raise ValueError("MQTT device packet boundary " + why)
    def same_size(value, expected):
        return type(value) is int and value == expected or type(value) is str and value == {1048576: "1MB", 2097152: "2MB"}[expected]
    require_bound(isinstance(effective, dict), "effective root is unknown")
    mqtt = effective.get("mqtt")
    zones = effective.get("zones")
    require_bound(isinstance(mqtt, dict) and same_size(mqtt.get("max_packet_size"), 2097152), "global must be 2MiB")
    require_bound(isinstance(zones, dict) and isinstance(zones.get("tc_device"), dict), "tc_device zone is missing")
    zone_mqtt = zones["tc_device"].get("mqtt")
    require_bound(isinstance(zone_mqtt, dict) and same_size(zone_mqtt.get("max_packet_size"), 1048576), "tc_device must be 1MiB")
    listeners = effective.get("listeners")
    require_bound(isinstance(listeners, dict) and listeners, "listeners are unknown")
    enabled = []
    for family, entries in listeners.items():
        require_bound(isinstance(entries, dict), "listener family is malformed")
        for name, listener in entries.items():
            require_bound(isinstance(listener, dict) and type(listener.get("enable", True)) is bool, "listener is malformed")
            if listener.get("enable", True) is False:
                continue
            require_bound(family in ("tcp", "ssl", "ws", "wss") and listener.get("zone") == "tc_device", "enabled listener must use tc_device")
            enabled.append(family + ":" + name)
    require_bound(enabled, "no enabled device listener")
    return {**DEVICE_PACKET_BOUNDS, "enabledListeners": sorted(enabled)}


def canonical_actions(actions: Any) -> list[dict[str, Any]]:
    """只接原五键或实测完整七键默认形状；不把未知或坏值剥成合格动作。"""
    if not isinstance(actions, list) or len(actions) != 1:
        raise ValueError("必须恰有一个action")
    action = actions[0]
    if not isinstance(action, dict) or set(action) != {"function", "args"} or action.get("function") != "republish":
        raise ValueError("唯一action必须是闭集republish")
    args = action.get("args")
    defaults = {"mqtt_properties", "user_properties"}
    if not isinstance(args, dict) or set(args) not in (set(EXPECTED_ARGS), set(EXPECTED_ARGS) | defaults):
        raise ValueError("republish args闭集不匹配")
    if set(args) == set(EXPECTED_ARGS) | defaults:
        if type(args["mqtt_properties"]) is not dict or args["mqtt_properties"] != {}:
            raise ValueError("republish mqtt_properties不是实测空对象默认值")
        if type(args["user_properties"]) is not str or args["user_properties"] != "${user_properties}":
            raise ValueError("republish user_properties不是实测完整默认模板")
    for name, expected in EXPECTED_ARGS.items():
        if type(args[name]) is not type(expected) or args[name] != expected:
            raise ValueError("republish " + name + "不匹配")
    return [{"function": action["function"], "args": {name: args[name] for name in EXPECTED_ARGS}}]


def expected_rules() -> list[dict[str, Any]]:
    """返回可复算闭集，不把此静态形状作为实际Broker资格。"""
    return [{"id": key, "sql": sql, "from": [RULE_FROM[key]], "enable": True,
             "actions": [{"function": "republish", "args": dict(EXPECTED_ARGS)}]}
            for key, sql in RULE_SQL.items()]


def verify(rules: Any, legacy_raw_status: int, legacy_command_status: int) -> list[str]:
    """实际API规则闭集必须完整且互斥；旧不完整规则输入失败关闭。"""
    failures = []
    if not isinstance(rules, list) or len(rules) != len(RULE_SQL) or not all(isinstance(r, dict) for r in rules):
        failures.append(f"durable rules必须是恰有{len(RULE_SQL)}个规则的数组")
        rules = []
    ids = [r.get("id") for r in rules]
    if len(ids) != len(RULE_SQL) or any(not isinstance(key, str) for key in ids) or set(ids) != set(RULE_SQL):
        failures.append("durable rule id闭集不匹配或重复")
    for rule in rules:
        key = rule.get("id")
        if not isinstance(key, str) or key not in RULE_SQL:
            continue
        sql = rule.get("sql")
        if not isinstance(sql, str) or " ".join(sql.split()) != " ".join(RULE_SQL[key].split()):
            failures.append(key + " SQL不满足原身份/会话/精确主题互斥合同")
        if rule.get("from") != [RULE_FROM[key]]:
            failures.append(key + " 来源不是唯一冻结设备主题范围")
        if rule.get("enable") is not True:
            failures.append(key + " rule未启用")
        try:
            canonical_actions(rule.get("actions"))
        except ValueError as error:
            failures.append(key + " " + str(error))
    if type(legacy_raw_status) is not int or legacy_raw_status != 404:
        failures.append(f"旧 tc_raw_uplink rule 仍可读（HTTP {legacy_raw_status}）")
    if type(legacy_command_status) is not int or legacy_command_status != 404:
        failures.append(f"旧 tc_command_reply bridge 仍可读（HTTP {legacy_command_status}）")
    return failures


def contract_facts(rules: Any) -> dict[str, Any]:
    """只摘要规则语义与非秘密动作，不复制API认证或运行元数据。"""
    selected = {r.get("id"): r for r in rules if isinstance(r, dict) and isinstance(r.get("id"), str)} if isinstance(rules, list) else {}
    def summary(key):
        rule = selected.get(key, {})
        actions = rule.get("actions")
        action = actions[0] if isinstance(actions, list) and len(actions) == 1 and isinstance(actions[0], dict) else {}
        args = action.get("args") if isinstance(action.get("args"), dict) else {}
        return {"id": rule.get("id"), "enabled": rule.get("enable"), "actionCount": len(actions) if isinstance(actions, list) else None,
                "function": action.get("function"), "topic": args.get("topic"), "qos": args.get("qos"),
                "retain": args.get("retain"), "directDispatch": args.get("direct_dispatch")}
    try:
        canonical = [{"id": key, "sql": " ".join(selected[key].get("sql", "").split()),
                      "from": selected[key].get("from"), "enable": selected[key].get("enable"),
                      "actions": canonical_actions(selected[key].get("actions"))}
                     for key in sorted(RULE_SQL) if key in selected and isinstance(selected[key].get("sql"), str)]
        digest = hashlib.sha256(json.dumps(canonical, sort_keys=True, ensure_ascii=True, separators=(",", ":")).encode("ascii")).hexdigest()
    except ValueError:
        # 坏动作没有合格合同摘要；不能无条件删字段后伪装成expected动作。
        digest = None
    return {"ruleContractVersion": 3, "ruleCount": len(rules) if isinstance(rules, list) else None,
            "ruleContractSha256": digest, "durableRule": summary(BROAD_RULE_ID), "propertyGetRule": summary(GET_RULE_ID),
            "mixedPropertyCapabilityRule": summary(MIXED_CAPABILITY_RULE_ID), "mixedPropertyReplyRule": summary(MIXED_REPLY_RULE_ID)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--legacy-raw-status", required=True, type=int)
    parser.add_argument("--legacy-command-status", required=True, type=int)
    args = parser.parse_args()
    try:
        rules = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError) as exception:
        print(f"EMQX durable rules响应不可读：{exception}", file=sys.stderr)
        return 1
    failures = verify(rules, args.legacy_raw_status, args.legacy_command_status)
    if failures:
        print("；".join(failures), file=sys.stderr)
        return 1
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

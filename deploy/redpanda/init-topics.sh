#!/bin/bash
# 与当前 ThingsCloud 运行时版本保持相同的主题、分区和保留期。
set -euo pipefail

create() {
  local output
  if output=$(rpk --brokers redpanda:9092 topic create "$1" -p "$2" -r 1 -c "retention.ms=$3" 2>&1); then
    printf '%s\n' "$output"
  elif [[ "$output" == *TOPIC_ALREADY_EXISTS* || "$output" == *"already exists"* ]]; then
    printf 'topic %s already exists\n' "$1"
  else
    printf '%s\n' "$output" >&2
    return 1
  fi
}

create tc.device.uplink.raw 12 604800000
create tc.device.uplink.normalized 12 604800000
create tc.device.uplink.processed 12 604800000
create tc.device.topo 12 604800000
create tc.device.batch 12 604800000
create tc.device.topo.reply 12 604800000
create tc.device.config 12 604800000
create tc.device.config.reply 12 604800000
create tc.device.modbus.request 12 604800000
create tc.device.modbus.response 12 604800000
create tc.device.downlink 12 604800000
create tc.device.command.terminal 12 604800000
create tc.device.realtime 12 86400000
create tc.device.lifecycle 6 2592000000
create tc.domain.event 6 2592000000
create tc.notification 6 604800000
create tc.retry 6 604800000
create tc.rule.retry.1m 6 604800000
create tc.rule.retry.5m 6 604800000
create tc.rule.automation.property.accepted 6 604800000
create tc.integration.webhook.source 6 604800000
create tc.rule.notification 6 604800000
create tc.rule.dlq 3 2592000000
create tc.dlq 3 2592000000

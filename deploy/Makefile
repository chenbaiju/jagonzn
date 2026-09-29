# Windows 本机一键入口；实际逻辑由 PowerShell 脚本维护，避免依赖 grep/awk/bash。
.DEFAULT_GOAL := help
.PHONY: help up ide access smoke integration-smoke fault backup-check object-check fingerprint down ps

help:
	@echo jagonzn independent local stack
	@echo make up    - start dependencies and jagonzn-service container
	@echo make ide   - start app in Docker with IDE remote debug on localhost:15005
	@echo make access - start local MQTT, HTTPS, TCP/TLS and CoAP/DTLS device access
	@echo make smoke - create isolated local test devices and verify standard protocol data
	@echo make integration-smoke - verify public API Key, realtime WS/MQTT transport and Webhook management
	@echo make fault - run protocol smoke plus a reversible local Redpanda outage
	@echo make backup-check - restore a database backup to a disposable local database
	@echo make object-check - restore a synthetic MinIO object to a disposable bucket
	@echo make fingerprint - record local candidate artifact checksums
	@echo make down  - stop this stack and keep volumes
	@echo make ps    - show this stack

up:
	pwsh.exe -NoProfile -File start.ps1 -Mode docker

ide:
	pwsh.exe -NoProfile -File start.ps1 -Mode ide

access:
	pwsh.exe -NoProfile -File start.ps1 -EnableAccess

smoke:
	pwsh.exe -NoProfile -File tests/smoke-device-access.ps1

integration-smoke:
	pwsh.exe -NoProfile -File tests/smoke-public-integration.ps1

fault:
	pwsh.exe -NoProfile -File tests/smoke-device-access.ps1 -FaultHandoff

backup-check:
	pwsh.exe -NoProfile -File tests/backup-restore-check.ps1

object-check:
	pwsh.exe -NoProfile -File tests/object-restore-check.ps1

fingerprint:
	pwsh.exe -NoProfile -File tests/fingerprint-candidate.ps1

down:
	pwsh.exe -NoProfile -File stop.ps1

ps:
	pwsh.exe -NoProfile -File status.ps1

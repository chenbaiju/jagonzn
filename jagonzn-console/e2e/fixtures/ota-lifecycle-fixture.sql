-- TEST-ONLY E2E fixture for the OTA campaign lifecycle journey (S13-4d-2b-2b-13).
--
-- The controlled type baseline for `things-cloud.ota.type-baselines-json` is a
-- startup snapshot indexed by an exact (tenantId, projectId, deviceTypeId)
-- triple with no wildcard. The console E2E stack therefore pre-provisions this
-- FIXED triple (and an OWNER account bound to the fixed project) before the
-- backend starts, so the injected baseline config and the committed root-signed
-- trust bundle fixture stay consistent. Nothing here changes production
-- semantics: no default/wildcard baseline, no test-only backend endpoint.
--
-- Fixed identities (mirrored verbatim in e2e/fixtures/ota-lifecycle-fixture.json,
-- e2e/fixtures/ota-type-baseline.json, e2e/fixtures/ota-trust-anchors.json and
-- e2e/fixtures/ota-trust-bundle.json):
--   tenant        0192e2e1-0000-7000-8000-000000000001
--   project       0192e2e1-0000-7000-8000-000000000002
--   device type   0192e2e1-0000-7000-8000-000000000003  (PUBLISHED, product_key e2eotafixed01)
--   thing model   0192e2e1-0000-7000-8000-000000000004  (1.0.0)
--   owner account 0192e2e1-0000-7000-8000-000000000005  (e2e-ota-owner@example.com)
--
-- The script passes the run password with `-v password=...`; it is hashed with
-- pgcrypto bcrypt exactly like deploy/scripts/add-console-account.sh.
-- Re-running is idempotent: prior lifecycle facts for the fixed project are
-- removed in FK-safe order and the identity skeleton is upserted.

BEGIN;

-- 1. Remove prior OTA facts for the fixed project (children before parents).
DO $fixture$
DECLARE
    target text;
    ordered text[] := ARRAY[
        'ota_install_stop_cancellation', 'ota_install_stop_outbox', 'ota_install_stop_report',
        'ota_install_stop_transport', 'ota_install_stop_delivery', 'ota_install_stop_status_query',
        'ota_install_stop_candidate_control', 'ota_install_stop_control', 'ota_install_stop_operation',
        'ota_rollback_cancellation', 'ota_rollback_outbox', 'ota_rollback_report',
        'ota_rollback_transport', 'ota_rollback_delivery', 'ota_rollback_status_query',
        'ota_rollback_candidate_control', 'ota_rollback_control', 'ota_rollback_operation',
        'ota_rollback_preflight_report', 'ota_rollback_preflight_transport',
        'ota_rollback_preflight_delivery', 'ota_rollback_preflight_query', 'ota_rollback_preflight_control',
        'ota_reconciliation_cancellation', 'ota_reconciliation_outbox', 'ota_reconciliation_report',
        'ota_reconciliation_transport', 'ota_reconciliation_delivery', 'ota_reconciliation_query',
        'ota_reconciliation_control',
        'ota_confirmation_cancellation', 'ota_confirmation_outbox', 'ota_commit_receipt',
        'ota_commit_transport', 'ota_commit_delivery', 'ota_commit_permit',
        'ota_health_receipt', 'ota_job_progress_outbox', 'ota_job_progress',
        'ota_job_expiry', 'ota_job_expiry_snapshot', 'ota_job_retry_due_snapshot',
        'ota_job_execution_origin', 'ota_download_authorization_snapshot',
        'ota_download_authorization_outbox', 'ota_download_authorization', 'ota_download_transport',
        'ota_download_bandwidth', 'ota_download_request_outbox', 'ota_download_request',
        'ota_notification_transport', 'ota_notification_delivery', 'ota_job_dispatch_outbox',
        'ota_job_transition', 'ota_batch_transition', 'ota_campaign_advancement',
        'ota_campaign_completion', 'ota_campaign_outbox', 'ota_campaign_transition',
        'ota_campaign_runtime_cancellation', 'ota_safety_cancellation_completion', 'ota_device_job',
        'ota_campaign_batch', 'ota_campaign_creation_request', 'ota_campaign',
        'ota_type_baseline_version', 'ota_type_baseline',
        'ota_firmware_release', 'ota_firmware_publication', 'ota_trust_bundle', 'ota_trust_domain',
        'ota_firmware_upload_session', 'ota_firmware_creation_request', 'ota_firmware', 'ota_device_report'
    ];
BEGIN
    FOREACH target IN ARRAY ordered LOOP
        -- Read-only snapshot projections are views; only ordinary tables are deletable.
        IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.' || target)) = 'r' THEN
            EXECUTE format('DELETE FROM %I WHERE project_id = %L', target,
                '0192e2e1-0000-7000-8000-000000000002');
        END IF;
    END LOOP;
END
$fixture$;

-- 2. Device-side facts for the fixed project (device before model/type).
DO $fixture$
DECLARE
    target text;
    ordered text[] := ARRAY['dev_credential', 'dev_device'];
BEGIN
    FOREACH target IN ARRAY ordered LOOP
        IF (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.' || target)) = 'r' THEN
            EXECUTE format('DELETE FROM %I WHERE project_id = %L', target,
                '0192e2e1-0000-7000-8000-000000000002');
        END IF;
    END LOOP;
END
$fixture$;
DELETE FROM dev_thing_model_version WHERE project_id = '0192e2e1-0000-7000-8000-000000000002';
DELETE FROM sys_project_member WHERE project_id = '0192e2e1-0000-7000-8000-000000000002';

-- 3. Identity skeleton.
INSERT INTO sys_tenant (id, name, status, plan_code, deleted_at)
VALUES ('0192e2e1-0000-7000-8000-000000000001', 'E2E-OTA生命周期租户', 'ACTIVE', 'FREE', NULL)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, status = 'ACTIVE', deleted_at = NULL;

UPDATE sys_project
SET name = 'E2E-OTA生命周期项目', project_key = 'e2eotalifecycle', status = 'ACTIVE', deleted_at = NULL
WHERE id = '0192e2e1-0000-7000-8000-000000000002';
INSERT INTO sys_project (id, tenant_id, name, region, status, project_key)
SELECT '0192e2e1-0000-7000-8000-000000000002', '0192e2e1-0000-7000-8000-000000000001',
       'E2E-OTA生命周期项目', 'sh-1', 'ACTIVE', 'e2eotalifecycle'
WHERE NOT EXISTS (SELECT 1 FROM sys_project WHERE id = '0192e2e1-0000-7000-8000-000000000002');

INSERT INTO sys_account (id, email, password_hash, display_name, status, email_verified_at,
                         failed_login_attempts, locked_until, deleted_at)
VALUES ('0192e2e1-0000-7000-8000-000000000005', 'e2e-ota-owner@example.com',
        '{bcrypt}' || crypt(:'password', gen_salt('bf', 10)), 'E2E-OTA-Owner', 'ACTIVE', now(), 0, NULL, NULL)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, display_name = EXCLUDED.display_name,
    status = 'ACTIVE', email_verified_at = now(), failed_login_attempts = 0, locked_until = NULL, deleted_at = NULL;

DELETE FROM sys_tenant_member WHERE tenant_id = '0192e2e1-0000-7000-8000-000000000001';
INSERT INTO sys_tenant_member (id, tenant_id, account_id, status)
VALUES (gen_random_uuid(), '0192e2e1-0000-7000-8000-000000000001',
        '0192e2e1-0000-7000-8000-000000000005', 'ACTIVE');

INSERT INTO sys_project_member (id, project_id, account_id, role, status)
VALUES (gen_random_uuid(), '0192e2e1-0000-7000-8000-000000000002',
        '0192e2e1-0000-7000-8000-000000000005', 'OWNER', 'ACTIVE');

-- 4. Published device type with the fixed product key and one published model version.
INSERT INTO dev_type (id, tenant_id, project_id, type_key, name, access_protocol, device_kind,
                      network_type, status, product_key, product_secret_hash, version, deleted_at)
VALUES ('0192e2e1-0000-7000-8000-000000000003', '0192e2e1-0000-7000-8000-000000000001',
        '0192e2e1-0000-7000-8000-000000000002', 'e2e_ota_lifecycle', 'E2E-OTA生命周期类型',
        'STANDARD', 'DIRECT', 'WIFI', 'PUBLISHED', 'e2eotafixed01', repeat('a', 64), 1, NULL)
ON CONFLICT (id) DO UPDATE
SET status = 'PUBLISHED', product_key = EXCLUDED.product_key,
    product_secret_hash = EXCLUDED.product_secret_hash, deleted_at = NULL, name = EXCLUDED.name,
    access_protocol = EXCLUDED.access_protocol, device_kind = EXCLUDED.device_kind,
    network_type = EXCLUDED.network_type;

INSERT INTO dev_thing_model_version (id, tenant_id, project_id, device_type_id, version_number,
    version_major, version_minor, version_patch, change_level, schema_profile, model_snapshot,
    schema_digest, digest_algorithm)
VALUES ('0192e2e1-0000-7000-8000-000000000004', '0192e2e1-0000-7000-8000-000000000001',
        '0192e2e1-0000-7000-8000-000000000002', '0192e2e1-0000-7000-8000-000000000003', '1.0.0',
        1, 0, 0, 'MAJOR', 'TC_PROPERTY_COMPOSITE_V1',
        '{"properties":{},"events":{},"commands":{}}'::jsonb,
        repeat('a', 64), 'PG_JSONB_TEXT_V1_SHA256');

COMMIT;

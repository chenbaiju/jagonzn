param(
    [string]$BackupDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'backups.local')
)

# 只在本机 jagonzn PostgreSQL 容器内创建一次性恢复库；原库只执行 pg_dump。
$ErrorActionPreference = 'Stop'
$deployDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $deployDir '.env.local'
if (-not (Test-Path -LiteralPath $envFile)) { throw '请先运行 start.ps1 初始化本机 jagonzn 栈。' }
$compose = @('--env-file', $envFile, '-f', (Join-Path $deployDir 'compose.yml'))
$container = (& docker compose @compose ps -q postgres).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($container)) {
    throw '未找到运行中的 jagonzn PostgreSQL 容器。'
}

function Invoke-Database([string[]]$arguments) {
    & docker exec $container @arguments
    if ($LASTEXITCODE -ne 0) { throw "数据库命令失败：$($arguments[0])" }
}

$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$restoreDatabase = "jagonzn_restore_$suffix"
$containerBackup = "/tmp/jagonzn-$suffix.dump"
[void][IO.Directory]::CreateDirectory($BackupDirectory)
$backupFile = Join-Path $BackupDirectory "jagonzn-$suffix.dump"
$created = $false
try {
    Invoke-Database @('pg_dump', '-U', 'jagonzn', '-d', 'jagonzn', '-Fc', '-f', $containerBackup)
    & docker cp "${container}:$containerBackup" $backupFile
    if ($LASTEXITCODE -ne 0) { throw '复制本机备份文件失败。' }
    $fingerprint = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupFile).Hash.ToLowerInvariant()

    Invoke-Database @('createdb', '-U', 'jagonzn', $restoreDatabase)
    $created = $true
    Invoke-Database @('psql', '-U', 'jagonzn', '-d', $restoreDatabase, '-v', 'ON_ERROR_STOP=1',
        '-c', 'SELECT timescaledb_pre_restore()')
    Invoke-Database @('pg_restore', '-U', 'jagonzn', '-d', $restoreDatabase,
        '--no-owner', '--exit-on-error', $containerBackup)
    Invoke-Database @('psql', '-U', 'jagonzn', '-d', $restoreDatabase, '-v', 'ON_ERROR_STOP=1',
        '-c', 'SELECT timescaledb_post_restore()')

    $sql = @'
SELECT
  (SELECT count(*) FROM flyway_schema_history WHERE success),
  (SELECT count(*) FROM pg_class WHERE relkind IN ('r','p') AND relnamespace='public'::regnamespace),
  (SELECT count(*) FROM pg_class WHERE relrowsecurity AND relnamespace='public'::regnamespace),
  (SELECT count(*) FROM pg_policies WHERE schemaname='public'),
  (SELECT count(*) FROM sys_tenant),
  (SELECT count(*) FROM sys_project),
  (SELECT count(*) FROM dev_device),
  (SELECT count(*) FROM sys_inbox_message),
  (SELECT count(*) FROM ts_property_point_internal),
  (SELECT count(*) FROM ota_firmware),
  (SELECT count(*) FROM ota_firmware_upload_session),
  (SELECT md5(coalesce(string_agg(message_id::text || ':' || coalesce(value_double::text, ''), ',' ORDER BY message_id), '')) FROM ts_property_point_internal),
  (SELECT md5(coalesce(string_agg(device_id::text || ':' || coalesce(reported::text, ''), ',' ORDER BY device_id), '')) FROM dev_shadow),
  (SELECT md5(coalesce(string_agg(id::text || ':' || status || ':' || expected_sha256 || ':' || coalesce(version_id, ''), ',' ORDER BY id), '')) FROM ota_firmware_upload_session);
'@
    $original = (& docker exec $container psql -U jagonzn -d jagonzn -v ON_ERROR_STOP=1 -Atqc $sql).Trim()
    if ($LASTEXITCODE -ne 0) { throw '读取原库核对指标失败。' }
    $restored = (& docker exec $container psql -U jagonzn -d $restoreDatabase -v ON_ERROR_STOP=1 -Atqc $sql).Trim()
    if ($LASTEXITCODE -ne 0) { throw '读取恢复库核对指标失败。' }
    if ($original -ne $restored) {
        throw "恢复库指标不一致：原库=$original，恢复库=$restored"
    }
    # 只对非扩展拥有的业务关系比较六个 jagonzn 角色的实际权限。
    # 单看表/RLS 数量会漏掉 --no-acl 导致的运行时权限丢失。
    $privilegeSql = @'
WITH roles AS (
  SELECT rolname FROM pg_roles WHERE rolname LIKE 'jagonzn_%'
), objects AS (
  SELECT c.oid, c.relname, c.relkind
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind IN ('r','p','v','m','S')
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_class'::regclass
                      AND d.objid = c.oid AND d.deptype = 'e')
), permissions AS (
  SELECT r.rolname, o.relname, o.relkind,
    CASE WHEN o.relkind = 'S' THEN
      has_sequence_privilege(r.rolname, o.oid, 'USAGE')::text ||
      has_sequence_privilege(r.rolname, o.oid, 'SELECT')::text ||
      has_sequence_privilege(r.rolname, o.oid, 'UPDATE')::text
    ELSE
      has_table_privilege(r.rolname, o.oid, 'SELECT')::text ||
      has_table_privilege(r.rolname, o.oid, 'INSERT')::text ||
      has_table_privilege(r.rolname, o.oid, 'UPDATE')::text ||
      has_table_privilege(r.rolname, o.oid, 'DELETE')::text ||
      has_table_privilege(r.rolname, o.oid, 'TRUNCATE')::text ||
      has_table_privilege(r.rolname, o.oid, 'REFERENCES')::text ||
      has_table_privilege(r.rolname, o.oid, 'TRIGGER')::text
    END AS flags
  FROM roles r CROSS JOIN objects o
)
SELECT md5(coalesce(string_agg(rolname || ':' || relname || ':' || relkind::text || ':' || flags,
                               ',' ORDER BY rolname, relname, relkind), ''))
FROM permissions;
'@
    $originalPrivileges = (& docker exec $container psql -U jagonzn -d jagonzn -v ON_ERROR_STOP=1 -Atqc $privilegeSql).Trim()
    if ($LASTEXITCODE -ne 0) { throw '读取原库角色权限失败。' }
    $restoredPrivileges = (& docker exec $container psql -U jagonzn -d $restoreDatabase -v ON_ERROR_STOP=1 -Atqc $privilegeSql).Trim()
    if ($LASTEXITCODE -ne 0) { throw '读取恢复库角色权限失败。' }
    if ($originalPrivileges -ne $restoredPrivileges) {
        throw "恢复库角色权限不一致：原库=$originalPrivileges，恢复库=$restoredPrivileges"
    }
    Write-Host "备份恢复核对通过；SHA-256=$fingerprint；指标=$original"
    Write-Host "业务关系有效角色权限摘要=$originalPrivileges"
    Write-Host "备份文件：$backupFile"
    Write-Host '指标依次为成功迁移、业务表、RLS 表/策略、租户/项目/设备/inbox/时序/固件/上传会话数量、时序/影子/上传会话内容摘要。'
} finally {
    if ($created) {
        & docker exec $container dropdb -U jagonzn --if-exists $restoreDatabase
        if ($LASTEXITCODE -ne 0) { Write-Warning "一次性恢复库 $restoreDatabase 清理失败，请人工检查。" }
    }
    & docker exec $container rm -f $containerBackup *> $null
}

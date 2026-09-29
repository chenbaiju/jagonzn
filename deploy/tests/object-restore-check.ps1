param(
    [string]$BackupDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'backups.local')
)

# 仅对本机独立 MinIO 的一次性对象做备份/恢复演练，不修改已有业务对象。
$ErrorActionPreference = 'Stop'
$deployDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $deployDir '.env.local'
if (-not (Test-Path -LiteralPath $envFile)) { throw '请先运行 start.ps1 初始化本机 jagonzn 栈。' }
[void][IO.Directory]::CreateDirectory($BackupDirectory)
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$backupFile = Join-Path $BackupDirectory "jagonzn-object-$suffix.txt"
$script = @'
set -eu
mc alias set root http://minio:9000 jagonzn "$MINIO_ROOT_PASSWORD" >/dev/null
mc alias set app http://minio:9000 jagonzn_app "$MINIO_APP_PASSWORD" >/dev/null
object=export/reuse-restore-__SUFFIX__.txt
bucket=reuse-restore-__SUFFIX__
cleanup() {
  mc rm "app/$object" >/dev/null 2>&1 || true
  mc rb --force "root/$bucket" >/dev/null 2>&1 || true
}
trap cleanup EXIT
printf 'jagonzn-object-restore-%s\n' '__SUFFIX__' > /tmp/reuse-object.txt
mc cp /tmp/reuse-object.txt "app/$object" >/dev/null
mc cp "root/$object" /backup/jagonzn-object-__SUFFIX__.txt >/dev/null
mc mb "root/$bucket" >/dev/null
mc version info app/jagonzn-ota >/dev/null
if mc ls "app/$bucket" >/dev/null 2>&1; then
  echo 'MinIO 应用身份意外读到一次性外部桶' >&2
  exit 1
fi
if mc admin info app >/dev/null 2>&1; then
  echo 'MinIO 应用身份意外获得管理 API' >&2
  exit 1
fi
mc cp /backup/jagonzn-object-__SUFFIX__.txt "root/$bucket/restored.txt" >/dev/null
source_hash=$(mc cat "root/$object" | sha256sum | cut -d ' ' -f 1)
restored_hash=$(mc cat "root/$bucket/restored.txt" | sha256sum | cut -d ' ' -f 1)
backup_hash=$(sha256sum /backup/jagonzn-object-__SUFFIX__.txt | cut -d ' ' -f 1)
test "$source_hash" = "$restored_hash"
test "$source_hash" = "$backup_hash"
printf '本机 MinIO 对象备份恢复通过；SHA-256=%s\n' "$backup_hash"
'@.Replace('__SUFFIX__', $suffix)

$compose = @('--env-file', $envFile, '-f', (Join-Path $deployDir 'compose.yml'),
    '--profile', 'init', 'run', '--rm', '--no-deps', '-T', '-v', "${BackupDirectory}:/backup",
    '--entrypoint', '/bin/sh', 'minio-init', '-ec', $script)
& docker compose @compose
if ($LASTEXITCODE -ne 0) { throw '本机 MinIO 对象备份恢复失败。' }
if (-not (Test-Path -LiteralPath $backupFile)) { throw '对象备份未写入本机目录。' }
Write-Host "备份文件：$backupFile（仅一次性测试对象）"

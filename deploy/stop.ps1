# 仅停止 jagonzn-service Compose 项目，保留所有数据卷和本机凭据。
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '.env.local'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'jagonzn 本机栈尚未初始化。' }
& docker compose --env-file $envFile -f (Join-Path $PSScriptRoot 'compose.yml') -f (Join-Path $PSScriptRoot 'overlays/compose.access.yml') --profile app --profile init down
if ($LASTEXITCODE -ne 0) { throw '停止 jagonzn-service Compose 栈失败。' }

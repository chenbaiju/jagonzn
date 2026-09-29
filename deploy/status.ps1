# 查看 jagonzn-service 独立 Compose 项目，不读取 ThingsCloud 容器状态。
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '.env.local'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'jagonzn 本机栈尚未初始化。' }
& docker compose --env-file $envFile -f (Join-Path $PSScriptRoot 'compose.yml') -f (Join-Path $PSScriptRoot 'overlays/compose.access.yml') --profile app --profile init ps
if ($LASTEXITCODE -ne 0) { throw '读取 jagonzn-service Compose 状态失败。' }

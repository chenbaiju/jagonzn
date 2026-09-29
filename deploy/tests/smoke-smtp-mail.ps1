# Verify that the independent jagonzn app can submit a registration message to an internal SMTP sink.
# The captured message may contain a verification token; keep it in ignored logs/smtp-test.local.
$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Utility
$deployDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $deployDir '.env.local'
if (-not (Test-Path -LiteralPath $envFile)) { throw '请先运行 start.ps1 初始化本机隔离栈。' }
$capture = Join-Path $deployDir 'logs/smtp-test.local'
[void][IO.Directory]::CreateDirectory($capture)
$baseCompose = @('--env-file', $envFile, '-f', (Join-Path $deployDir 'compose.yml'),
    '-f', (Join-Path $deployDir 'overlays/compose.access.yml'))
$testCompose = $baseCompose + @('-f', (Join-Path $deployDir 'overlays/compose.smtp-test.yml'))
$modified = $false
try {
    $modified = $true
    & docker compose @testCompose --profile app --profile smtp-test up -d --no-deps smtp-sink app
    if ($LASTEXITCODE -ne 0) { throw '启动独立 SMTP 接收器或重建应用失败。' }
    $ready = $false
    for ($attempt=0; $attempt -lt 90; $attempt++) {
        try {
            $health = Invoke-WebRequest -Uri 'http://127.0.0.1:18080/actuator/health' -TimeoutSec 3
            if ($health.StatusCode -eq 200) { $ready = $true; break }
        } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { throw '启用本机 SMTP 后 jagonzn-service 未恢复健康。' }
    $email = 'reuse-smtp-' + [Guid]::NewGuid().ToString('N').Substring(0, 12) + '@example.test'
    $password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(36))
    $started = Get-Date
    $body = @{email=$email; password=$password} | ConvertTo-Json -Compress
    $registered = Invoke-WebRequest -Method POST -Uri 'http://127.0.0.1:18080/api/v1/auth/register' `
        -ContentType 'application/json' -Body $body -TimeoutSec 15
    if ($registered.StatusCode -ne 204) { throw "注册请求状态异常：$($registered.StatusCode)" }
    $received = $false
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        foreach ($file in @(Get-ChildItem -LiteralPath $capture -Filter '*.eml' -File | Where-Object {
            $_.LastWriteTime -ge $started.AddSeconds(-1)
        })) {
            if ([IO.File]::ReadAllText($file.FullName) -match [regex]::Escape($email)) {
                $received = $true
                break
            }
        }
        if ($received) { break }
        Start-Sleep -Seconds 1
    }
    if (-not $received) { throw 'SMTP 接收器未捕获此测试邮箱的注册邮件。' }
    Write-Host 'jagonzn 注册邮件经真实 SMTP 提交并由独立网络内接收器捕获；未输出验证令牌。'
    & (Join-Path $PSScriptRoot 'smoke-device-access.ps1') -VerifyEmailNotification
    if ($LASTEXITCODE -ne 0) { throw '告警邮件端到端验证失败。' }
} finally {
    if ($modified) {
        & docker compose @baseCompose --profile app up -d --no-deps --force-recreate app
        if ($LASTEXITCODE -ne 0) {
            Write-Warning '恢复原 jagonzn 应用配置失败，请检查容器状态。'
        } else {
            $restored = $false
            for ($attempt=0; $attempt -lt 90; $attempt++) {
                try {
                    if ((Invoke-WebRequest -Uri 'http://127.0.0.1:18080/actuator/health' -TimeoutSec 3).StatusCode -eq 200) {
                        $restored = $true
                        break
                    }
                } catch { Start-Sleep -Seconds 1 }
            }
            if (-not $restored) { Write-Warning '原 jagonzn 应用已启动但健康端点未恢复。' }
        }
        & docker compose @testCompose --profile smtp-test stop smtp-sink *> $null
        & docker compose @testCompose --profile smtp-test rm -f smtp-sink *> $null
    }
}

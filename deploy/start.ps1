param(
    [ValidateSet('docker', 'ide')]
    [string]$Mode = 'docker',
    [switch]$EnableAccess
)

# 独立本机候选：生成本机秘密并装配中间件；不修改 ThingsCloud 部署或数据库。
$ErrorActionPreference = 'Stop'
$deployDir = $PSScriptRoot
$serviceDir = [IO.Path]::GetFullPath((Join-Path $deployDir '..\jagonzn-service'))
$rootDir = [IO.Path]::GetFullPath((Join-Path $deployDir '..\..'))
$envFile = Join-Path $deployDir '.env.local'
$appFile = Join-Path $deployDir 'application-local.properties'
$composeFile = Join-Path $deployDir 'compose.yml'
$composeArguments = @('-f', $composeFile)
if ($EnableAccess) { $composeArguments += @('-f', (Join-Path $deployDir 'overlays/compose.access.yml')) }
$modeFile = Join-Path $deployDir '.mode.local'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function New-Secret {
    $bytes = New-Object byte[] 48
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-Base64Key {
    $bytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

function Read-LocalEnv([string]$path) {
    $values = @{}
    foreach ($line in [IO.File]::ReadAllLines($path)) {
        if ($line.StartsWith('#') -or [string]::IsNullOrWhiteSpace($line)) { continue }
        $separator = $line.IndexOf('=')
        if ($separator -le 0) { throw "无效的本机配置行：$line" }
        $values[$line.Substring(0, $separator)] = $line.Substring($separator + 1)
    }
    return $values
}

function Invoke-Compose([string[]]$arguments) {
    & docker compose --env-file $envFile @composeArguments @arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose 执行失败：$($arguments -join ' ')" }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw '找不到 docker 命令，请先启动 Docker Desktop。' }
& docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker Engine 未运行，请先启动 Docker Desktop。' }

if (-not (Test-Path -LiteralPath $envFile)) {
    # 首次生成独立强密钥；若本机 IDE 已生成 JWT，沿用该值以免开发令牌意外失效。
    $jwt = $null
    $workspaceFile = Join-Path $rootDir '.idea\workspace.xml'
    if (Test-Path -LiteralPath $workspaceFile) {
        [xml]$workspace = [IO.File]::ReadAllText($workspaceFile)
        $existing = $workspace.SelectSingleNode('//configuration[@name="JagonznServiceApplication"]/envs/env[@name="JAGONZN_SECURITY_JWT_SECRET"]')
        if ($null -ne $existing -and $existing.GetAttribute('value').Length -ge 32) {
            $jwt = $existing.GetAttribute('value')
        }
    }
    if (-not $jwt) { $jwt = New-Secret }
    $newValues = [ordered]@{
        JAGONZN_DATABASE_OWNER_PASSWORD = (New-Secret)
        JAGONZN_DATABASE_APP_PASSWORD = (New-Secret)
        JAGONZN_REDIS_PASSWORD = (New-Secret)
        JAGONZN_MINIO_SECRET_KEY = (New-Secret)
        JAGONZN_MINIO_APP_SECRET_KEY = (New-Secret)
        JAGONZN_SECURITY_JWT_SECRET = $jwt
        JAGONZN_SECURITY_APP_JWT_SECRET = (New-Secret)
        JAGONZN_SECURITY_BROKER_CALLBACK_SECRET = (New-Secret)
        JAGONZN_NOTIFICATION_WEBHOOK_SIGNING_SECRET = (New-Secret)
        JAGONZN_PUBLIC_WEBHOOK_SIGNING_KEY = (New-Base64Key)
        JAGONZN_EMQX_COOKIE = (New-Secret)
        JAGONZN_EMQX_DASHBOARD_PASSWORD = (New-Secret)
        JAGONZN_EMQX_APP_COOKIE = (New-Secret)
        JAGONZN_EMQX_APP_DASHBOARD_PASSWORD = (New-Secret)
        JAGONZN_INGRESS_HANDOFF_PASSWORD = (New-Secret)
        JAGONZN_EMQX_API_KEY = (New-Secret)
        JAGONZN_EMQX_API_SECRET = (New-Secret)
        JAGONZN_EMQX_SESSION_API_KEY = (New-Secret)
        JAGONZN_EMQX_SESSION_API_SECRET = (New-Secret)
        JAGONZN_REALTIME_MQTT_API_KEY = (New-Secret)
        JAGONZN_REALTIME_MQTT_API_SECRET = (New-Secret)
        JAGONZN_REALTIME_MQTT_SESSION_API_KEY = (New-Secret)
        JAGONZN_REALTIME_MQTT_SESSION_API_SECRET = (New-Secret)
    }
    $lines = @('# 本机独立开发凭据；不入库、不用于生产。')
    foreach ($item in $newValues.GetEnumerator()) { $lines += "$($item.Key)=$($item.Value)" }
    $lines += @(
        'JAGONZN_DATABASE_URL=jdbc:postgresql://postgres:5432/jagonzn',
        'JAGONZN_REDIS_HOST=redis',
        'JAGONZN_REDIS_PORT=6379',
        'JAGONZN_KAFKA_BOOTSTRAP_SERVERS=redpanda:9092',
        'JAGONZN_MINIO_INTERNAL_ENDPOINT=http://minio:9000',
        'JAGONZN_MINIO_EXTERNAL_ENDPOINT=http://localhost:19000',
        'JAGONZN_MINIO_APP_ACCESS_KEY=jagonzn_app',
        'JAGONZN_EMQX_API_BASE_URL=http://emqx:18083',
        'JAGONZN_EMQX_SESSION_API_BASE_URL=http://emqx:18083',
        'JAGONZN_INGRESS_HANDOFF_BROKER_URI=tcp://emqx:1883',
        'JAGONZN_INGRESS_HANDOFF_ENABLED=true'
    )
    [IO.File]::WriteAllText($envFile, ($lines -join "`n") + "`n", $utf8)
    Write-Host '已生成 jagonzn/deploy/.env.local（独立随机凭据，未输出密钥）。'
}

$values = Read-LocalEnv $envFile
# 从旧版本机候选平滑补齐新身份；不覆盖任何既有秘密或数据卷。
$newNames = @('JAGONZN_INGRESS_HANDOFF_PASSWORD', 'JAGONZN_EMQX_API_KEY',
    'JAGONZN_EMQX_API_SECRET', 'JAGONZN_EMQX_SESSION_API_KEY', 'JAGONZN_EMQX_SESSION_API_SECRET',
    'JAGONZN_MINIO_APP_SECRET_KEY', 'JAGONZN_REALTIME_MQTT_API_KEY',
    'JAGONZN_REALTIME_MQTT_API_SECRET', 'JAGONZN_REALTIME_MQTT_SESSION_API_KEY',
    'JAGONZN_REALTIME_MQTT_SESSION_API_SECRET', 'JAGONZN_EMQX_APP_COOKIE',
    'JAGONZN_EMQX_APP_DASHBOARD_PASSWORD')
$additions = @()
foreach ($name in $newNames) {
    if (-not $values.ContainsKey($name)) {
        $values[$name] = New-Secret
        $additions += "$name=$($values[$name])"
    }
}
$appBrokerCredentialsAdded = @($additions | Where-Object {
    $_ -match '^JAGONZN_REALTIME_MQTT_' -or $_ -match '^JAGONZN_EMQX_APP_'
}).Count -gt 0
if (-not $values.ContainsKey('JAGONZN_PUBLIC_WEBHOOK_SIGNING_KEY')) {
    $values['JAGONZN_PUBLIC_WEBHOOK_SIGNING_KEY'] = New-Base64Key
    $additions += "JAGONZN_PUBLIC_WEBHOOK_SIGNING_KEY=$($values['JAGONZN_PUBLIC_WEBHOOK_SIGNING_KEY'])"
}
if (-not $values.ContainsKey('JAGONZN_PUBLIC_WEBHOOK_ENABLED')) {
    $values['JAGONZN_PUBLIC_WEBHOOK_ENABLED'] = 'true'
    $additions += 'JAGONZN_PUBLIC_WEBHOOK_ENABLED=true'
}
if (-not $values.ContainsKey('JAGONZN_PUBLIC_API_KEY_ENABLED')) {
    $values['JAGONZN_PUBLIC_API_KEY_ENABLED'] = 'true'
    $additions += 'JAGONZN_PUBLIC_API_KEY_ENABLED=true'
}
if (-not $values.ContainsKey('JAGONZN_PUBLIC_REALTIME_ENABLED')) {
    $values['JAGONZN_PUBLIC_REALTIME_ENABLED'] = 'true'
    $additions += 'JAGONZN_PUBLIC_REALTIME_ENABLED=true'
}
if (-not $values.ContainsKey('JAGONZN_REALTIME_WS_ALLOWED_ORIGINS')) {
    $values['JAGONZN_REALTIME_WS_ALLOWED_ORIGINS'] = 'http://localhost:3006,http://127.0.0.1:3006'
    $additions += "JAGONZN_REALTIME_WS_ALLOWED_ORIGINS=$($values['JAGONZN_REALTIME_WS_ALLOWED_ORIGINS'])"
}
if (-not $values.ContainsKey('JAGONZN_INGRESS_HANDOFF_ENABLED')) {
    $values['JAGONZN_INGRESS_HANDOFF_ENABLED'] = 'true'
    $additions += 'JAGONZN_INGRESS_HANDOFF_ENABLED=true'
}
if (-not $values.ContainsKey('JAGONZN_MINIO_APP_ACCESS_KEY')) {
    $values['JAGONZN_MINIO_APP_ACCESS_KEY'] = 'jagonzn_app'
    $additions += 'JAGONZN_MINIO_APP_ACCESS_KEY=jagonzn_app'
}
$localCapacity = [ordered]@{
    JAGONZN_ENTITLEMENT_MODE = 'NONCOMMERCIAL'
    JAGONZN_TECHNICAL_PROJECTS = '20'
    JAGONZN_TECHNICAL_DEVICES = '1000'
    JAGONZN_TECHNICAL_END_USERS = '1000'
    JAGONZN_TECHNICAL_DASHBOARDS = '100'
    JAGONZN_TECHNICAL_EXTERNAL_SEATS = '50'
    JAGONZN_TECHNICAL_HISTORY_DAYS = '30'
    JAGONZN_TECHNICAL_DAILY_UPLINK_MESSAGE = '100000'
    JAGONZN_TECHNICAL_DAILY_DOWNLINK_MESSAGE = '100000'
    JAGONZN_TECHNICAL_DAILY_UPLINK_BYTES = '100000000'
    JAGONZN_TECHNICAL_DAILY_TIME_SERIES_POINT = '1000000'
    JAGONZN_TECHNICAL_DAILY_REST_API_CALL = '100000'
    JAGONZN_TECHNICAL_DAILY_NOTIFICATION_DELIVERY = '10000'
    JAGONZN_TECHNICAL_DAILY_SCRIPT_EXECUTION = '10000'
    JAGONZN_TECHNICAL_DAILY_AUTOMATION_EXECUTION = '10000'
    JAGONZN_TECHNICAL_DAILY_SCRIPT_CPU_MILLIS = '1000000'
}
foreach ($item in $localCapacity.GetEnumerator()) {
    if (-not $values.ContainsKey($item.Key)) {
        $values[$item.Key] = $item.Value
        $additions += "$($item.Key)=$($item.Value)"
    }
}
if ($additions.Count -gt 0) {
    [IO.File]::AppendAllText($envFile, ($additions -join "`n") + "`n", $utf8)
    Write-Host '已补齐本机独立身份和有限技术容量（未输出密钥）。'
}
$required = @(
    'JAGONZN_DATABASE_OWNER_PASSWORD', 'JAGONZN_DATABASE_APP_PASSWORD',
    'JAGONZN_REDIS_PASSWORD', 'JAGONZN_MINIO_SECRET_KEY', 'JAGONZN_MINIO_APP_SECRET_KEY',
    'JAGONZN_SECURITY_JWT_SECRET', 'JAGONZN_SECURITY_APP_JWT_SECRET',
    'JAGONZN_SECURITY_BROKER_CALLBACK_SECRET', 'JAGONZN_NOTIFICATION_WEBHOOK_SIGNING_SECRET',
    'JAGONZN_PUBLIC_WEBHOOK_SIGNING_KEY',
    'JAGONZN_EMQX_COOKIE', 'JAGONZN_EMQX_DASHBOARD_PASSWORD',
    'JAGONZN_EMQX_APP_COOKIE', 'JAGONZN_EMQX_APP_DASHBOARD_PASSWORD',
    'JAGONZN_INGRESS_HANDOFF_PASSWORD', 'JAGONZN_EMQX_API_KEY',
    'JAGONZN_EMQX_API_SECRET', 'JAGONZN_EMQX_SESSION_API_KEY',
    'JAGONZN_EMQX_SESSION_API_SECRET', 'JAGONZN_REALTIME_MQTT_API_KEY',
    'JAGONZN_REALTIME_MQTT_API_SECRET', 'JAGONZN_REALTIME_MQTT_SESSION_API_KEY',
    'JAGONZN_REALTIME_MQTT_SESSION_API_SECRET'
)
foreach ($name in $required) {
    if (-not $values.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($values[$name])) {
        throw "本机配置缺少 $name；请补齐现有 .env.local，脚本不会覆盖已有凭据。"
    }
}

# 外置 Spring 配置只供本机 IDE 使用，不放在 src/main/resources，避免打进可执行 JAR。
$appProperties = @(
    '# jagonzn 本机独立栈；由 deploy/start.ps1 生成，不入库也不打进 JAR。',
    'spring.datasource.url=jdbc:postgresql://127.0.0.1:15432/jagonzn',
    "spring.datasource.password=$($values['JAGONZN_DATABASE_APP_PASSWORD'])",
    'spring.flyway.url=jdbc:postgresql://127.0.0.1:15432/jagonzn',
    "spring.flyway.password=$($values['JAGONZN_DATABASE_OWNER_PASSWORD'])",
    "spring.flyway.placeholders.app_role_password=$($values['JAGONZN_DATABASE_APP_PASSWORD'])",
    'spring.data.redis.host=127.0.0.1',
    'spring.data.redis.port=16379',
    "spring.data.redis.password=$($values['JAGONZN_REDIS_PASSWORD'])",
    'spring.kafka.bootstrap-servers=127.0.0.1:29092',
    'things-cloud.storage.internal-endpoint=http://127.0.0.1:19000',
    'things-cloud.storage.external-endpoint=http://127.0.0.1:19000',
    'things-cloud.storage.access-key=jagonzn_app',
    "things-cloud.storage.secret-key=$($values['JAGONZN_MINIO_APP_SECRET_KEY'])",
    "things-cloud.security.jwt.secret=$($values['JAGONZN_SECURITY_JWT_SECRET'])",
    "things-cloud.security.app-jwt.secret=$($values['JAGONZN_SECURITY_APP_JWT_SECRET'])",
    "things-cloud.security.broker-callback.secret=$($values['JAGONZN_SECURITY_BROKER_CALLBACK_SECRET'])",
    "things-cloud.notification.webhook.signing-secret=$($values['JAGONZN_NOTIFICATION_WEBHOOK_SIGNING_SECRET'])",
    "things-cloud.integration.api-key.enabled=$($values['JAGONZN_PUBLIC_API_KEY_ENABLED'])",
    "things-cloud.integration.webhook.enabled=$($values['JAGONZN_PUBLIC_WEBHOOK_ENABLED'])",
    "things-cloud.integration.webhook.signing-keys-json={`"local-v1`":`"$($values['JAGONZN_PUBLIC_WEBHOOK_SIGNING_KEY'])`"}",
    'things-cloud.integration.webhook.current-signing-key-id=local-v1',
    "things-cloud.integration.realtime.enabled=$($values['JAGONZN_PUBLIC_REALTIME_ENABLED'])",
    "things-cloud.integration.realtime.ws.allowed-origins=$($values['JAGONZN_REALTIME_WS_ALLOWED_ORIGINS'])",
    'things-cloud.integration.realtime.mqtt-api.base-url=http://127.0.0.1:38083',
    "things-cloud.integration.realtime.mqtt-api.api-key=$($values['JAGONZN_REALTIME_MQTT_API_KEY'])",
    "things-cloud.integration.realtime.mqtt-api.api-secret=$($values['JAGONZN_REALTIME_MQTT_API_SECRET'])",
    "things-cloud.integration.realtime.mqtt-api.session-api-key=$($values['JAGONZN_REALTIME_MQTT_SESSION_API_KEY'])",
    "things-cloud.integration.realtime.mqtt-api.session-api-secret=$($values['JAGONZN_REALTIME_MQTT_SESSION_API_SECRET'])",
    'things-cloud.ingestion.emqx-api.base-url=http://127.0.0.1:28083',
    'things-cloud.device.emqx-session-api.base-url=http://127.0.0.1:28083',
    'things-cloud.ingress.handoff.broker-uri=tcp://127.0.0.1:21883'
)
$appProperties += @(
    'things-cloud.ingress.handoff.enabled=true',
    "things-cloud.ingress.handoff.password=$($values['JAGONZN_INGRESS_HANDOFF_PASSWORD'])",
    "things-cloud.ingestion.emqx-api.api-key=$($values['JAGONZN_EMQX_API_KEY'])",
    "things-cloud.ingestion.emqx-api.api-secret=$($values['JAGONZN_EMQX_API_SECRET'])",
    "things-cloud.device.emqx-session-api.api-key=$($values['JAGONZN_EMQX_SESSION_API_KEY'])",
    "things-cloud.device.emqx-session-api.api-secret=$($values['JAGONZN_EMQX_SESSION_API_SECRET'])"
)
$appProperties += "things-cloud.deployment.entitlement-mode=$($values['JAGONZN_ENTITLEMENT_MODE'])"
$capacityProperties = [ordered]@{
    'projects' = 'JAGONZN_TECHNICAL_PROJECTS'
    'devices' = 'JAGONZN_TECHNICAL_DEVICES'
    'end-users' = 'JAGONZN_TECHNICAL_END_USERS'
    'dashboards' = 'JAGONZN_TECHNICAL_DASHBOARDS'
    'external-seats' = 'JAGONZN_TECHNICAL_EXTERNAL_SEATS'
    'history-days' = 'JAGONZN_TECHNICAL_HISTORY_DAYS'
    'daily.uplink-message' = 'JAGONZN_TECHNICAL_DAILY_UPLINK_MESSAGE'
    'daily.downlink-message' = 'JAGONZN_TECHNICAL_DAILY_DOWNLINK_MESSAGE'
    'daily.uplink-bytes' = 'JAGONZN_TECHNICAL_DAILY_UPLINK_BYTES'
    'daily.time-series-point' = 'JAGONZN_TECHNICAL_DAILY_TIME_SERIES_POINT'
    'daily.rest-api-call' = 'JAGONZN_TECHNICAL_DAILY_REST_API_CALL'
    'daily.notification-delivery' = 'JAGONZN_TECHNICAL_DAILY_NOTIFICATION_DELIVERY'
    'daily.script-execution' = 'JAGONZN_TECHNICAL_DAILY_SCRIPT_EXECUTION'
    'daily.automation-execution' = 'JAGONZN_TECHNICAL_DAILY_AUTOMATION_EXECUTION'
    'daily.script-cpu-millis' = 'JAGONZN_TECHNICAL_DAILY_SCRIPT_CPU_MILLIS'
}
foreach ($item in $capacityProperties.GetEnumerator()) {
    $appProperties += "things-cloud.deployment.noncommercial-capacity.$($item.Key)=$($values[$item.Value])"
}
[IO.File]::WriteAllText($appFile, ($appProperties -join "`n") + "`n", $utf8)

# 回调配置沿用同版本平台 MQTT 合同，但令牌和目标仅指向本 jagonzn 实例。
$callbackBase = 'http://app:18080'
$template = [IO.File]::ReadAllText((Join-Path $deployDir 'emqx\base.hocon.template'))
$rendered = $template.Replace('__JAGONZN_CALLBACK_BASE_URL__', $callbackBase).
    Replace('__JAGONZN_BROKER_CALLBACK_SECRET__', $values['JAGONZN_SECURITY_BROKER_CALLBACK_SECRET'])
if ($rendered.Contains('__JAGONZN_')) { throw 'EMQX 模板中仍有未替换的占位符。' }
[IO.File]::WriteAllText((Join-Path $deployDir 'emqx\base.local.hocon'), $rendered, $utf8)
$apiKeys = @(
    "$($values['JAGONZN_EMQX_API_KEY']):$($values['JAGONZN_EMQX_API_SECRET']):publisher:publish",
    "$($values['JAGONZN_EMQX_SESSION_API_KEY']):$($values['JAGONZN_EMQX_SESSION_API_SECRET']):administrator:connections"
)
[IO.File]::WriteAllText((Join-Path $deployDir 'emqx\api-keys.local.conf'), ($apiKeys -join "`n") + "`n", $utf8)
$appBrokerDir = Join-Path $deployDir 'emqx-app'
$appTemplate = [IO.File]::ReadAllText((Join-Path $appBrokerDir 'base.hocon.template'))
$appRendered = $appTemplate.Replace('__JAGONZN_CALLBACK_BASE_URL__', $callbackBase).
    Replace('__JAGONZN_BROKER_CALLBACK_SECRET__', $values['JAGONZN_SECURITY_BROKER_CALLBACK_SECRET'])
if ($appRendered.Contains('__JAGONZN_')) { throw '应用 EMQX 模板中仍有未替换的占位符。' }
[IO.File]::WriteAllText((Join-Path $appBrokerDir 'base.local.hocon'), $appRendered, $utf8)
$appKeys = @(
    "$($values['JAGONZN_REALTIME_MQTT_API_KEY']):$($values['JAGONZN_REALTIME_MQTT_API_SECRET']):publisher:publish",
    "$($values['JAGONZN_REALTIME_MQTT_SESSION_API_KEY']):$($values['JAGONZN_REALTIME_MQTT_SESSION_API_SECRET']):administrator:connections"
)
[IO.File]::WriteAllText((Join-Path $appBrokerDir 'api-keys.local.conf'), ($appKeys -join "`n") + "`n", $utf8)

if ($EnableAccess) {
    $certDir = Join-Path $deployDir 'certs.local'
    [void][IO.Directory]::CreateDirectory($certDir)
    $certFile = Join-Path $certDir 'device.crt'
    $keyFile = Join-Path $certDir 'device.key'
    if ((Test-Path -LiteralPath $certFile) -ne (Test-Path -LiteralPath $keyFile)) {
        throw '本机设备证书与私钥必须同时存在；请核查 certs.local。'
    }
    if (-not (Test-Path -LiteralPath $certFile)) {
        $key = [Security.Cryptography.ECDsa]::Create([Security.Cryptography.ECCurve+NamedCurves]::nistP256)
        try {
            $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
                'CN=localhost', $key, [Security.Cryptography.HashAlgorithmName]::SHA256)
            $san = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
            $san.AddDnsName('localhost')
            $san.AddIpAddress([Net.IPAddress]::Parse('127.0.0.1'))
            $request.CertificateExtensions.Add($san.Build())
            $now = [DateTimeOffset]::UtcNow
            $certificate = $request.CreateSelfSigned($now.AddDays(-1), $now.AddDays(30))
            try {
                [IO.File]::WriteAllText($certFile, $certificate.ExportCertificatePem(), $utf8)
                [IO.File]::WriteAllText($keyFile, $key.ExportPkcs8PrivateKeyPem(), $utf8)
            } finally { $certificate.Dispose() }
        } finally { $key.Dispose() }
        Write-Host '已生成仅供本机验证的 ECDSA P-256 设备面证书（未输出私钥）。'
    }
}

# 本机 IntelliJ 运行配置只引用外置配置，不再单独保存第二份 JWT。
$workspaceFile = Join-Path $rootDir '.idea\workspace.xml'
if (Test-Path -LiteralPath $workspaceFile) {
    $xml = New-Object System.Xml.XmlDocument
    $xml.PreserveWhitespace = $true
    $xml.Load($workspaceFile)
    $config = $xml.SelectSingleNode('//configuration[@name="JagonznServiceApplication" and @type="SpringBootApplicationConfigurationType"]')
    if ($null -ne $config) {
        $workDir = $config.SelectSingleNode('./option[@name="WORKING_DIRECTORY"]')
        if ($null -eq $workDir) {
            $workDir = $xml.CreateElement('option')
            $workDir.SetAttribute('name', 'WORKING_DIRECTORY')
            [void]$config.InsertBefore($workDir, $config.SelectSingleNode('./method'))
        }
        $workDir.SetAttribute('value', 'file://$PROJECT_DIR$/jagonzn/jagonzn-service')
        $envs = $config.SelectSingleNode('./envs')
        if ($null -eq $envs) {
            $envs = $xml.CreateElement('envs')
            [void]$config.InsertBefore($envs, $config.SelectSingleNode('./method'))
        }
        $oldSecret = $envs.SelectSingleNode('./env[@name="JAGONZN_SECURITY_JWT_SECRET"]')
        if ($null -ne $oldSecret) { [void]$envs.RemoveChild($oldSecret) }
        $ideValues = @{
            'SPRING_CONFIG_ADDITIONAL_LOCATION' = ([Uri]$appFile).AbsoluteUri
            'JAGONZN_SERVICE_LOG_PATH' = (Join-Path $serviceDir 'logs')
        }
        foreach ($name in $ideValues.Keys) {
            $env = $envs.SelectSingleNode("./env[@name='$name']")
            if ($null -eq $env) {
                $env = $xml.CreateElement('env')
                $env.SetAttribute('name', $name)
                [void]$envs.AppendChild($env)
            }
            $env.SetAttribute('value', $ideValues[$name])
        }
        $xml.Save($workspaceFile)
        Write-Host '已配置本机 IntelliJ JagonznServiceApplication：外置配置和独立日志路径。'
    }
}
[void][IO.Directory]::CreateDirectory((Join-Path $serviceDir 'logs'))

$previousMode = if (Test-Path -LiteralPath $modeFile) { [IO.File]::ReadAllText($modeFile).Trim() } else { '' }
Invoke-Compose -arguments @('up', '-d', '--wait', 'postgres', 'redis', 'redpanda', 'minio', 'emqx', 'emqx-app')
if ($previousMode -eq '') {
    Invoke-Compose -arguments @('up', '-d', '--force-recreate', '--wait', 'emqx')
}
if ($previousMode -eq '' -or $appBrokerCredentialsAdded) {
    Invoke-Compose -arguments @('up', '-d', '--force-recreate', '--wait', 'emqx-app')
}
# 旧本机候选曾把应用 API 身份引导进设备 Broker；从设备 Broker 移除该两项历史身份。
# 只按完整 API key 精确匹配，避免误删其他管理员或设备管理身份。
$deviceKeyList = & docker compose --env-file $envFile @composeArguments exec -T emqx /opt/emqx/bin/emqx ctl api_keys list
if ($LASTEXITCODE -ne 0) { throw '无法核对设备 Broker 的历史 API 身份。' }
$deviceKeys = @(($deviceKeyList -join "`n") | ConvertFrom-Json)
foreach ($retiredKey in @($values['JAGONZN_REALTIME_MQTT_API_KEY'],
        $values['JAGONZN_REALTIME_MQTT_SESSION_API_KEY'])) {
    foreach ($entry in $deviceKeys) {
        if ($entry.api_key -eq $retiredKey) {
            & docker compose --env-file $envFile @composeArguments exec -T emqx `
                /opt/emqx/bin/emqx ctl api_keys del --name $entry.name | Out-Null
            if ($LASTEXITCODE -ne 0) { throw '移除设备 Broker 历史应用 API 身份失败。' }
        }
    }
}
Invoke-Compose -arguments @('run', '--rm', 'redpanda-init')
Invoke-Compose -arguments @('run', '--rm', 'minio-init')
[IO.File]::WriteAllText($modeFile, $Mode + "`n", $utf8)

# 两种模式都在 Linux 容器启动应用；IDE 模式额外开放回环 JDWP，避开本机 JDK Selector 故障。
$maven = Join-Path $serviceDir 'mvnw.cmd'
Push-Location $serviceDir
try {
    & $maven '-DskipTests' 'package'
    if ($LASTEXITCODE -ne 0) { throw 'jagonzn-service 打包失败。' }
} finally { Pop-Location }
if ($Mode -eq 'ide') {
    Invoke-Compose -arguments @('-f', (Join-Path $deployDir 'overlays/compose.debug.yml'), '--profile', 'app', 'up', '-d', '--force-recreate', '--remove-orphans', 'app')
} else {
    Invoke-Compose -arguments @('--profile', 'app', 'up', '-d', '--remove-orphans', 'app')
}
if ($EnableAccess) { Invoke-Compose -arguments @('up', '-d', 'device-https') }
$ready = $false
for ($attempt = 0; $attempt -lt 90; $attempt++) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:18080/actuator/health' -TimeoutSec 2
        if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}
if (-not $ready) {
    & docker compose --env-file $envFile @composeArguments --profile app logs --tail 80 app
    throw 'jagonzn-service 未在 180 秒内返回 HTTP 200。'
}
Write-Host 'jagonzn-service 已启动：http://127.0.0.1:18080/actuator/health'
if ($EnableAccess) { Write-Host '本机设备入口：HTTPS 127.0.0.1:18443、TCP/TLS 127.0.0.1:18883、CoAP/DTLS 127.0.0.1:15684/udp（自签证书仅供测试）。' }
if ($Mode -eq 'ide') { Write-Host 'IntelliJ 选择 Remote JVM Debug，连接 127.0.0.1:15005；无需手填环境变量。' }
Write-Host '进程健康不等于 MQTT、HTTP/TCP/CoAP 设备业务链路已验收。'

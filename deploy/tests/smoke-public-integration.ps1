# 在 jagonzn 本机隔离栈中验证公开 API Key 与 Webhook 管理；不触发任何外部投递。
param(
    [switch]$VerifyWebhookRetry,
    [switch]$VerifyMqttReconnect,
    [string]$CandidateJar,
    [string]$CandidateSha256
)
$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Utility
$python = Get-Command python3, python -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $python) { throw '公开集成探针需要 Python 3。' }
$deployDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $deployDir '.env.local'
if (-not (Test-Path -LiteralPath $envFile)) { throw '请先运行 start.ps1。' }
$values = @{}
foreach ($line in [IO.File]::ReadAllLines($envFile)) {
    if ($line -match '^([^#=]+)=(.*)$') { $values[$matches[1]] = $matches[2] }
}
foreach ($name in @('JAGONZN_REALTIME_MQTT_API_KEY', 'JAGONZN_REALTIME_MQTT_API_SECRET')) {
    if (-not $values.ContainsKey($name)) { throw "本机配置缺少 $name。" }
}
$container = (& docker compose --env-file $envFile -f (Join-Path $deployDir 'compose.yml') ps -q postgres).Trim()
if ($LASTEXITCODE -ne 0 -or -not $container) { throw '未找到 jagonzn PostgreSQL 容器。' }
$base = 'http://127.0.0.1:18080'
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 10)
$email = "reuse-webhook-$suffix@example.test"
$password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(36))

function Invoke-Api([string]$method, [string]$path, $body, [string]$token = '',
        [hashtable]$extraHeaders = @{}) {
    $headers = @{}
    if ($token) { $headers['Authorization'] = "Bearer $token" }
    foreach ($key in $extraHeaders.Keys) { $headers[$key] = $extraHeaders[$key] }
    $parameters = @{ Method = $method; Uri = "$base$path"; Headers = $headers }
    if (-not $extraHeaders.ContainsKey('X-Api-Key')) { $parameters['WebSession'] = $session }
    if ($null -ne $body) {
        $parameters['ContentType'] = 'application/json'
        $parameters['Body'] = ($body | ConvertTo-Json -Compress -Depth 6)
    }
    try { $response = Invoke-WebRequest @parameters }
    catch {
        $status = if ($null -ne $_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        throw "公开集成请求失败：$method $path，HTTP $status"
    }
    return @{ status = [int]$response.StatusCode;
        data = if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null } }
}

$registered = Invoke-Api POST '/api/v1/auth/register' @{email=$email; password=$password}
if ($registered.status -ne 204) { throw '测试账号注册失败。' }
# 本机候选没有 SMTP；只将当前脚本刚创建的账号置为已验证。
& docker exec $container psql -U jagonzn -d jagonzn -v ON_ERROR_STOP=1 -q -c `
    "UPDATE sys_account SET email_verified_at=now() WHERE email='$email'" | Out-Null
if ($LASTEXITCODE -ne 0) { throw '测试账号验证准备失败。' }
$login = Invoke-Api POST '/api/v1/auth/login' @{email=$email; password=$password}
if ($login.status -ne 200 -or -not $login.data.accessToken) { throw '测试账号登录失败。' }
$token = [string]$login.data.accessToken
$project = Invoke-Api POST '/api/v1/projects' @{name="reuse-webhook-$suffix"; region='sh-1'} $token
if ($project.status -ne 200 -or -not $project.data.id) { throw '测试项目创建失败。' }
$projectId = [string]$project.data.id
$switched = Invoke-Api POST '/api/v1/auth/switch-project' @{projectId=$projectId} $token
if ($switched.status -ne 200 -or -not $switched.data.accessToken) { throw '项目会话切换失败。' }
$token = [string]$switched.data.accessToken
$type = Invoke-Api POST "/api/v1/projects/$projectId/device-types" @{
    typeKey="reuse_$suffix"; name='Integration candidate'; deviceKind='DIRECT';
    payloadProtocol='STANDARD'; networkType='WIFI'
} $token
if ($type.status -ne 201) { throw '测试设备类型创建失败。' }
$typeId = [string]$type.data.id
$property = Invoke-Api POST "/api/v1/projects/$projectId/device-types/$typeId/properties" @{
    propertyKey='temperature'; name='Temperature'; accessType='REPORT'; dataType='NUMBER';
    unit='C'; decimalPlaces=1; minimumValue=0; maximumValue=100; sortOrder=0
} $token
if ($property.status -ne 201) { throw '测试属性定义创建失败。' }
$published = Invoke-Api POST "/api/v1/projects/$projectId/device-types/$typeId/publish" $null $token
if ($published.status -ne 200) { throw '测试设备类型发布失败。' }
$model = Invoke-Api GET "/api/v1/projects/$projectId/device-types/$typeId/thing-model-versions/latest" $null $token
if ($model.status -ne 200 -or -not $model.data.id) { throw '测试物模型版本不可用。' }
$device = Invoke-Api POST "/api/v1/projects/$projectId/devices" @{
    deviceTypeId=$typeId; deviceKey="reuse-$suffix"; name='Integration candidate'
} $token
if ($device.status -ne 201 -or -not $device.data.id) { throw '测试设备创建失败。' }
$deviceId = [string]$device.data.id
$deviceCredential = Invoke-Api POST "/api/v1/projects/$projectId/devices/$deviceId/credentials" $null $token
if ($deviceCredential.status -ne 201 -or -not $deviceCredential.data.plainSecret) {
    throw '实时来源设备凭据生成失败。'
}
$accessPath = "/api/v1/projects/$projectId/devices/$deviceId/access-config"
$access = Invoke-Api GET $accessPath $null $token
$configured = Invoke-Api PUT $accessPath @{
    protocol='HTTP'; enabled=$true; expectedConfigVersion=[string]$access.data.configVersion
} $token
if ($configured.status -ne 200 -or -not $configured.data.enabled) {
    throw '实时来源设备 HTTP 接入配置失败。'
}
$keyPath = "/api/v1/projects/$projectId/api-keys"
$keyOperation = [Guid]::NewGuid().ToString()
# Docker Desktop 的端口转发与 Caddy 代理会给本机请求呈现不同私网源地址。
# 测试 Key 仅允许回环/私网、十分钟内有效，结束即撤销；生产按真实代理边界收窄。
$cidrs = @('127.0.0.1/32', '172.16.0.0/12', '192.168.0.0/16', '10.0.0.0/8', '::1/128', 'fc00::/7')
$keyIssued = Invoke-Api POST $keyPath @{
    operationId=$keyOperation; name='Local qualification'; scopes=@('device:read');
    ipCidrs=$cidrs; expiresAt=[DateTimeOffset]::UtcNow.AddMinutes(10).ToString('o')
} $token
if ($keyIssued.status -ne 201 -or -not $keyIssued.data.secret -or -not $keyIssued.data.key.id) {
    throw '公开 API Key 首次签发失败。'
}
$keyId = [string]$keyIssued.data.key.id
$secret = [string]$keyIssued.data.secret
$openDevices = $null
$openFailure = $null
try { $openDevices = Invoke-Api GET '/api/open/v1/devices' $null '' @{'X-Api-Key'=$secret} }
catch { $openFailure = $_.Exception.Message }
finally {
    $keyRevoke = Invoke-Api POST "$keyPath/$keyId/revoke" @{
        operationId=[Guid]::NewGuid().ToString()
    } $token
    if ($keyRevoke.status -ne 200 -or $keyRevoke.data.status -ne 'REVOKED') {
        throw '公开 API Key 撤销失败。'
    }
}
if ($openFailure) { throw $openFailure }
if ($openDevices.status -ne 200) { throw '公开设备只读 API 未能以本部署 API Key 访问。' }
$keyDenied = 0
try {
    $unexpected = Invoke-WebRequest -Uri "$base/api/open/v1/devices" `
        -Headers @{'X-Api-Key'=$secret}
    $keyDenied = [int]$unexpected.StatusCode
} catch {
    if ($null -eq $_.Exception.Response) { throw }
    $keyDenied = [int]$_.Exception.Response.StatusCode
}
if ($keyDenied -ne 401) { throw "已撤销 API Key 应返回 401，实际 $keyDenied" }
$ticketOperation = [Guid]::NewGuid().ToString()
$ticket = Invoke-Api POST "/api/v1/projects/$projectId/realtime-tickets" @{
    protocol='WS'; eventTypes=@('device.property.report'); devices=@(@{
        deviceId=$deviceId; expectedModelVersionId=[string]$model.data.id;
        propertyKeys=@('temperature')
    })
} $token @{'Idempotency-Key'=$ticketOperation}
if ($ticket.status -ne 201 -or -not $ticket.data.credential) {
    throw '公开实时 WS 票据签发失败。'
}
$socket = [Net.WebSockets.ClientWebSocket]::new()
try {
    $socket.Options.AddSubProtocol('tc-realtime-v1')
    $socket.Options.AddSubProtocol([string]$ticket.data.credential)
    [void]$socket.ConnectAsync([Uri]'ws://127.0.0.1:18080/api/open/v1/realtime/ws',
        [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    if ($socket.State -ne [Net.WebSockets.WebSocketState]::Open) {
        throw '公开实时 WS 未建立连接。'
    }
    $buffer = New-Object byte[] 32768
    $receive = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer),
        [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $ready = [Text.Encoding]::UTF8.GetString($buffer, 0, $receive.Count) | ConvertFrom-Json
    if ($ready.type -ne 'READY') { throw '公开实时 WS 未返回 READY。' }
    $wsMessageId = [Guid]::CreateVersion7().ToString()
    $deviceBody = @{
        messageId=$wsMessageId; occurredAt=[DateTimeOffset]::UtcNow.ToString('o');
        payload=@{temperature=27.5}
    } | ConvertTo-Json -Compress
    $reported = Invoke-WebRequest -Method POST `
        -Uri 'https://127.0.0.1:18443/device-access/v1/property/report' `
        -SkipCertificateCheck -ContentType 'application/json' -Headers @{
            'X-TC-Device-Key'="$($project.data.projectKey)/reuse-$suffix"
            'X-TC-Device-Secret'=[string]$deviceCredential.data.plainSecret
        } -Body $deviceBody
    if ($reported.StatusCode -ne 202) { throw '实时来源设备 HTTPS 上报未受理。' }
    $timeout = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(30))
    try {
        $receive = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer),
            $timeout.Token).GetAwaiter().GetResult()
    } finally { $timeout.Dispose() }
    $wsEvent = [Text.Encoding]::UTF8.GetString($buffer, 0, $receive.Count) | ConvertFrom-Json
    if ($wsEvent.eventId -ne $wsMessageId -or $wsEvent.deviceId -ne $deviceId -or
            -not $wsEvent.properties.temperature) {
        throw '设备属性未通过公开实时 WS 正确交付。'
    }
} finally {
    $socket.Abort()
    $socket.Dispose()
}
# WS 票据只允许一次绑定。断开后申请新票据并重新订阅，确认后续设备事件仍能交付。
$reconnectTicket = Invoke-Api POST "/api/v1/projects/$projectId/realtime-tickets" @{
    protocol='WS'; eventTypes=@('device.property.report'); devices=@(@{
        deviceId=$deviceId; expectedModelVersionId=[string]$model.data.id;
        propertyKeys=@('temperature')
    })
} $token @{'Idempotency-Key'=[Guid]::NewGuid().ToString()}
if ($reconnectTicket.status -ne 201 -or -not $reconnectTicket.data.credential) {
    throw '公开实时 WS 重新签发票据失败。'
}
$reconnectedSocket = [Net.WebSockets.ClientWebSocket]::new()
try {
    $reconnectedSocket.Options.AddSubProtocol('tc-realtime-v1')
    $reconnectedSocket.Options.AddSubProtocol([string]$reconnectTicket.data.credential)
    $connectDeadline = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(10))
    try {
        [void]$reconnectedSocket.ConnectAsync([Uri]'ws://127.0.0.1:18080/api/open/v1/realtime/ws',
            $connectDeadline.Token).GetAwaiter().GetResult()
    } finally { $connectDeadline.Dispose() }
    $buffer = New-Object byte[] 32768
    $readyDeadline = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(10))
    try {
        $received = $reconnectedSocket.ReceiveAsync([ArraySegment[byte]]::new($buffer),
            $readyDeadline.Token).GetAwaiter().GetResult()
    } finally { $readyDeadline.Dispose() }
    $ready = [Text.Encoding]::UTF8.GetString($buffer, 0, $received.Count) | ConvertFrom-Json
    if ($ready.type -ne 'READY') { throw '重新连接的公开实时 WS 未返回 READY。' }
    $reconnectMessageId = [Guid]::CreateVersion7().ToString()
    $reconnectBody = @{
        messageId=$reconnectMessageId; occurredAt=[DateTimeOffset]::UtcNow.ToString('o');
        payload=@{temperature=27.6}
    } | ConvertTo-Json -Compress
    $reconnectReport = Invoke-WebRequest -Method POST `
        -Uri 'https://127.0.0.1:18443/device-access/v1/property/report' `
        -SkipCertificateCheck -ContentType 'application/json' -Headers @{
            'X-TC-Device-Key'="$($project.data.projectKey)/reuse-$suffix"
            'X-TC-Device-Secret'=[string]$deviceCredential.data.plainSecret
        } -Body $reconnectBody
    if ($reconnectReport.StatusCode -ne 202) { throw '重新订阅后的设备上报未受理。' }
    $eventDeadline = [Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(30))
    try {
        $received = $reconnectedSocket.ReceiveAsync([ArraySegment[byte]]::new($buffer),
            $eventDeadline.Token).GetAwaiter().GetResult()
    } finally { $eventDeadline.Dispose() }
    $reconnectEvent = [Text.Encoding]::UTF8.GetString($buffer, 0, $received.Count) | ConvertFrom-Json
    if ($reconnectEvent.eventId -ne $reconnectMessageId -or
            $reconnectEvent.deviceId -ne $deviceId -or
            $reconnectEvent.properties.temperature.dataType -ne 'NUMBER' -or
            $reconnectEvent.properties.temperature.valueJson -ne '27.6') {
        throw '重新连接后设备属性事件未按协议正确交付。'
    }
} finally {
    $reconnectedSocket.Abort()
    $reconnectedSocket.Dispose()
}
Write-Host '公开实时 WS 断开后以新票据重连并收到后续设备事件。'
$mqttTicket = Invoke-Api POST "/api/v1/projects/$projectId/realtime-tickets" @{
    protocol='MQTT'; eventTypes=@('device.property.report'); devices=@(@{
        deviceId=$deviceId; expectedModelVersionId=[string]$model.data.id;
        propertyKeys=@('temperature')
    })
} $token @{'Idempotency-Key'=[Guid]::NewGuid().ToString()}
if ($mqttTicket.status -ne 201 -or -not $mqttTicket.data.credential -or
        -not $mqttTicket.data.clientId -or -not $mqttTicket.data.topic) {
    throw '公开实时 MQTT 票据签发失败。'
}
$mqttInput = @{
    clientId=[string]$mqttTicket.data.clientId;
    username=[string]$mqttTicket.data.username;
    credential=[string]$mqttTicket.data.credential;
    topic=[string]$mqttTicket.data.topic;
    apiKey=$values['JAGONZN_REALTIME_MQTT_API_KEY'];
    apiSecret=$values['JAGONZN_REALTIME_MQTT_API_SECRET'];
    deviceId=$deviceId;
    deviceKey="$($project.data.projectKey)/reuse-$suffix";
    deviceSecret=[string]$deviceCredential.data.plainSecret;
    messageId=[Guid]::CreateVersion7().ToString()
} | ConvertTo-Json -Compress
$mqttInput | & $python.Source (Join-Path $PSScriptRoot 'smoke_realtime_mqtt.py')
if ($LASTEXITCODE -ne 0) { throw '公开实时应用 Broker 连接/订阅失败。' }
if ($VerifyMqttReconnect) {
    if (-not $CandidateJar -or -not $CandidateSha256) {
        throw 'MQTT 重连验收必须提供固定候选 JAR 路径和 SHA-256。'
    }
    $reconnectInput = @{
        token=$token;
        projectId=$projectId;
        modelVersionId=[string]$model.data.id;
        deviceId=$deviceId;
        deviceKey="$($project.data.projectKey)/reuse-$suffix";
        deviceSecret=[string]$deviceCredential.data.plainSecret;
        propertyKey='temperature'
    } | ConvertTo-Json -Compress
    $reconnectInput | & $python.Source (Join-Path $PSScriptRoot 'smoke-realtime-reconnect-v4b.py') `
        --deploy-dir $deployDir --candidate-jar $CandidateJar `
        --candidate-sha256 $CandidateSha256
    if ($LASTEXITCODE -ne 0) { throw '公开实时 MQTT 重连与 REST 恢复验收失败。' }
}
$path = "/api/v1/projects/$projectId/webhooks"
$empty = Invoke-Api GET $path $null $token
if ($empty.status -ne 200) { throw 'Webhook 管理入口未启用。' }
$operation = [Guid]::NewGuid().ToString()
$issued = Invoke-Api POST $path @{
    operationId=$operation; name='Local qualification';
    targetUrl='https://receiver.example.invalid/events';
    eventTypes=@('device.property.report'); deviceIds=@($deviceId)
} $token @{'Idempotency-Key'=$operation}
if ($issued.status -ne 201 -or -not $issued.data.signingSecret -or
        -not $issued.data.subscription.id) { throw 'Webhook 首次签发失败。' }
$subscriptionId = [string]$issued.data.subscription.id
$detail = Invoke-Api GET "$path/$subscriptionId" $null $token
if ($detail.status -ne 200 -or $detail.data.id -ne $subscriptionId -or
        $detail.data.PSObject.Properties.Name -contains 'signingSecret') {
    throw 'Webhook 详情或秘密隐藏不符合合同。'
}
# .invalid 是保留的不可投递域名；只验证来源接入、持久投递与失败尝试，不发送给外部接收方。
$webhookMessageId = [Guid]::CreateVersion7().ToString()
$webhookBody = @{
    messageId=$webhookMessageId; occurredAt=[DateTimeOffset]::UtcNow.ToString('o');
    payload=@{temperature=26.5}
} | ConvertTo-Json -Compress
$webhookReport = Invoke-WebRequest -Method POST `
    -Uri 'https://127.0.0.1:18443/device-access/v1/property/report' `
    -SkipCertificateCheck -ContentType 'application/json' -Headers @{
        'X-TC-Device-Key'="$($project.data.projectKey)/reuse-$suffix"
        'X-TC-Device-Secret'=[string]$deviceCredential.data.plainSecret
    } -Body $webhookBody
if ($webhookReport.StatusCode -ne 202) { throw 'Webhook 来源设备 HTTPS 上报未受理。' }
$deliveryId = ''
$deliveryDetail = $null
for ($attempt=0; $attempt -lt 30; $attempt++) {
    $deliveries = Invoke-Api GET "$path/deliveries?subscriptionId=$subscriptionId" $null $token
    $candidate = @($deliveries.data.items | Where-Object {
        $_.eventType -eq 'device.property.report' -and $_.subscriptionId -eq $subscriptionId
    }) | Select-Object -First 1
    if ($candidate) {
        $deliveryId = [string]$candidate.id
        $deliveryDetail = Invoke-Api GET "$path/deliveries/$deliveryId" $null $token
        if (@($deliveryDetail.data.attempts).Count -gt 0) { break }
    }
    Start-Sleep -Seconds 1
}
if (-not $deliveryId -or $null -eq $deliveryDetail -or
        @($deliveryDetail.data.attempts).Count -eq 0) {
    throw 'Webhook 未形成持久投递及受控失败尝试。'
}
if (@($deliveryDetail.data.attempts | Where-Object { $_.result -eq 'SUCCEEDED' }).Count -gt 0) {
    throw '.invalid 目标不应出现成功外部投递。'
}
$attemptCountBeforeRevoke = @($deliveryDetail.data.attempts).Count
if ($VerifyWebhookRetry) {
    for ($attempt=0; $attempt -lt 45; $attempt++) {
        $deliveryDetail = Invoke-Api GET "$path/deliveries/$deliveryId" $null $token
        $attemptCountBeforeRevoke = @($deliveryDetail.data.attempts).Count
        if ($attemptCountBeforeRevoke -ge 2) { break }
        Start-Sleep -Seconds 1
    }
    if ($attemptCountBeforeRevoke -lt 2) {
        throw "Webhook .invalid 失败后未形成第二次受控尝试：$attemptCountBeforeRevoke"
    }
    if (@($deliveryDetail.data.attempts | Where-Object { $_.result -eq 'SUCCEEDED' }).Count -gt 0) {
        throw 'Webhook .invalid 重试意外成功。'
    }
    Write-Host "Webhook 失败后受控重试通过：尝试数=$attemptCountBeforeRevoke。"
}
$revokeOperation = [Guid]::NewGuid().ToString()
$revoked = Invoke-Api POST "$path/$subscriptionId/revoke" @{
    operationId=$revokeOperation; expectedRevision='1'
} $token @{'Idempotency-Key'=$revokeOperation}
if ($revoked.status -ne 200 -or $revoked.data.subscription.status -ne 'REVOKED') {
    throw 'Webhook 永久撤销失败。'
}
if ($VerifyWebhookRetry) {
    Start-Sleep -Seconds 5
    $afterRevoke = Invoke-Api GET "$path/deliveries/$deliveryId" $null $token
    if (@($afterRevoke.data.attempts).Count -ne $attemptCountBeforeRevoke) {
        throw 'Webhook 撤销后仍出现新的投递尝试。'
    }
    Write-Host 'Webhook 撤销后未继续尝试投递。'
}
Write-Host "jagonzn 公开集成通过：API Key 签发/只读访问/撤销拒绝；设备 HTTP 上报向实时 WS 与独立 MQTT Broker 交付；Webhook 来源入队、.invalid 失败尝试与撤销；项目=$projectId（未向外部接收方投递）。"

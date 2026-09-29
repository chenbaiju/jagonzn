# 使用当前本机隔离栈的公开 API 建一次性租户/设备，验证四协议属性上报。
# 此脚本会在 jagonzn 本机库留下清晰命名的候选数据；绝不连接原 ThingsCloud 库。
param([switch]$FaultHandoff, [switch]$VerifyEmailNotification, [switch]$HostCoap)
$ErrorActionPreference = 'Stop'
$deployDir = Split-Path -Parent $PSScriptRoot
Import-Module Microsoft.PowerShell.Utility
$envFile = Join-Path $deployDir '.env.local'
if (-not (Test-Path -LiteralPath $envFile)) { throw '请先运行 start.ps1 -EnableAccess。' }
$container = (& docker compose --env-file $envFile -f (Join-Path $deployDir 'compose.yml') ps -q postgres).Trim()
if ($LASTEXITCODE -ne 0 -or -not $container) { throw '未找到 jagonzn PostgreSQL 容器。' }
$base = 'http://127.0.0.1:18080'
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$suffix = [Guid]::NewGuid().ToString('N').Substring(0, 10)
$email = "reuse-http-$suffix@example.test"
$password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(36))

function Invoke-Api([string]$method, [string]$path, $body, [string]$token = '',
        [hashtable]$extraHeaders = @{}) {
    $headers = @{}
    if ($token) { $headers['Authorization'] = "Bearer $token" }
    foreach ($key in $extraHeaders.Keys) { $headers[$key] = $extraHeaders[$key] }
    $parameters = @{ Method = $method; Uri = "$base$path"; Headers = $headers;
        SkipCertificateCheck = $true; WebSession = $session }
    if ($null -ne $body) {
        $parameters['ContentType'] = 'application/json'
        $parameters['Body'] = ($body | ConvertTo-Json -Compress -Depth 8)
    }
    $response = Invoke-WebRequest @parameters
    return @{ status = [int]$response.StatusCode;
        data = if ($response.Content) { $response.Content | ConvertFrom-Json } else { $null } }
}

$registration = Invoke-Api POST '/api/v1/auth/register' @{email=$email; password=$password}
if ($registration.status -ne 204) { throw "注册状态异常：$($registration.status)" }
# 本机候选无 SMTP：只将脚本刚创建的账号置为已验证。
& docker exec $container psql -U jagonzn -d jagonzn -v ON_ERROR_STOP=1 -q -c `
    "UPDATE sys_account SET email_verified_at=now() WHERE email='$email'" | Out-Null
if ($LASTEXITCODE -ne 0) { throw '本机账号验证准备失败。' }
$login = Invoke-Api POST '/api/v1/auth/login' @{email=$email; password=$password}
if ($login.status -ne 200 -or -not $login.data.accessToken) { throw '登录失败。' }
$token = [string]$login.data.accessToken
$project = Invoke-Api POST '/api/v1/projects' @{name="reuse-http-$suffix"; region='sh-1'} $token
if ($project.status -ne 200 -or -not $project.data.projectKey) { throw '项目创建失败。' }
$projectId = [string]$project.data.id
$switched = Invoke-Api POST '/api/v1/auth/switch-project' @{projectId=$projectId} $token
if ($switched.status -ne 200 -or -not $switched.data.accessToken) { throw '项目会话切换失败。' }
$token = [string]$switched.data.accessToken
$type = Invoke-Api POST "/api/v1/projects/$projectId/device-types" @{
    typeKey="reuse_$suffix"; name='HTTP candidate'; deviceKind='DIRECT';
    payloadProtocol='STANDARD'; networkType='WIFI'
} $token
if ($type.status -ne 201) { throw '设备类型创建失败。' }
$typeId = [string]$type.data.id
$property = Invoke-Api POST "/api/v1/projects/$projectId/device-types/$typeId/properties" @{
    propertyKey='temperature'; name='Temperature'; accessType='REPORT'; dataType='NUMBER';
    unit='C'; decimalPlaces=1; minimumValue=0; maximumValue=100; sortOrder=0
} $token
if ($property.status -ne 201) { throw '属性定义创建失败。' }
$published = Invoke-Api POST "/api/v1/projects/$projectId/device-types/$typeId/publish" $null $token
if ($published.status -ne 200) { throw '设备类型发布失败。' }
$deviceKey = "reuse-$suffix"
$device = Invoke-Api POST "/api/v1/projects/$projectId/devices" @{
    deviceTypeId=$typeId; deviceKey=$deviceKey; name='HTTP candidate'
} $token
if ($device.status -ne 201) { throw '设备创建失败。' }
$deviceId = [string]$device.data.id
$credential = Invoke-Api POST "/api/v1/projects/$projectId/devices/$deviceId/credentials" $null $token
if ($credential.status -ne 201 -or -not $credential.data.plainSecret) { throw '设备凭据生成失败。' }
$configPath = "/api/v1/projects/$projectId/devices/$deviceId/access-config"
$config = Invoke-Api GET $configPath $null $token
$configured = Invoke-Api PUT $configPath @{
    protocol='HTTP'; enabled=$true; expectedConfigVersion=[string]$config.data.configVersion
} $token
if ($configured.status -ne 200 -or -not $configured.data.enabled) { throw 'HTTP 接入配置失败。' }

if ($VerifyEmailNotification) {
    $subject = "reuse-alert-$suffix"
    $group = Invoke-Api POST "/api/v1/projects/$projectId/alarm-notification-groups" @{
        name="reuse-mail-$suffix"; enabled=$true
    } $token
    if ($group.status -ne 201 -or -not $group.data.id) { throw '告警邮件通知组创建失败。' }
    $recipient = Invoke-Api POST "/api/v1/projects/$projectId/alarm-notification-groups/$($group.data.id)/recipients" @{
        channel='EMAIL'; target=$email; enabled=$true
    } $token
    if ($recipient.status -ne 201 -or -not $recipient.data.id) { throw '告警邮件收件人创建失败。' }
    $template = Invoke-Api POST "/api/v1/projects/$projectId/alarm-notification-templates" @{
        name="reuse-mail-$suffix"; channel='EMAIL'; subjectTemplate=$subject;
        bodyTemplate="Reuse alarm $suffix"; enabled=$true
    } $token
    if ($template.status -ne 201 -or -not $template.data.id) { throw '告警邮件模板创建失败。' }
    $rule = Invoke-Api POST "/api/v1/projects/$projectId/alarm-rules" @{
        name="reuse-mail-$suffix"; alarmType='REUSE_MAIL'; deviceId=$deviceId;
        propertyKey='temperature'; triggerOperator='GT'; triggerThreshold=20;
        triggerDurationSeconds=0; clearOperator='LT'; clearThreshold=10;
        clearDurationSeconds=0; severity='WARNING'; enabled=$true
    } $token
    if ($rule.status -ne 201 -or -not $rule.data.id) { throw '告警规则创建失败。' }
    $binding = Invoke-Api POST "/api/v1/projects/$projectId/alarm-rules/$($rule.data.id)/notification-bindings" @{
        groupId=[string]$group.data.id; templateId=[string]$template.data.id;
        channel='EMAIL'; enabled=$true
    } $token
    if ($binding.status -ne 201 -or -not $binding.data.id) { throw '告警邮件绑定创建失败。' }
}

$messageId = [Guid]::CreateVersion7().ToString()
$deviceBody = @{
    messageId=$messageId; occurredAt=[DateTimeOffset]::UtcNow.ToString('o');
    payload=@{temperature=28.5}
} | ConvertTo-Json -Compress -Depth 5
$response = Invoke-WebRequest -Method POST -Uri 'https://127.0.0.1:18443/device-access/v1/property/report' `
    -SkipCertificateCheck -ContentType 'application/json' -Headers @{
        'X-TC-Device-Key'="$($project.data.projectKey)/$deviceKey"
        'X-TC-Device-Secret'=[string]$credential.data.plainSecret
    } -Body $deviceBody
if ($response.StatusCode -ne 202) { throw "设备上报状态异常：$($response.StatusCode)" }

$counts = ''
for ($attempt=0; $attempt -lt 30; $attempt++) {
    $counts = (& docker exec $container psql -U jagonzn -d jagonzn -v ON_ERROR_STOP=1 -Atqc `
        "SET app.project_id='$projectId'; SELECT (SELECT count(*) FROM sys_inbox_message WHERE message_id='$messageId'), (SELECT count(*) FROM ts_property_point WHERE message_id='$messageId'), (SELECT count(*) FROM dev_shadow WHERE device_id='$deviceId' AND reported->>'temperature'='28.5')").Trim()
    if ($LASTEXITCODE -ne 0) { throw '读取设备入库证据失败。' }
    if ($counts -eq '1|1|1') { break }
    Start-Sleep -Seconds 1
}
if ($counts -ne '1|1|1') { throw "HTTPS 属性链路未完整落库：$counts" }
Write-Host "jagonzn HTTPS 设备属性上报通过：202，inbox|history|shadow=$counts"
Write-Host "本机候选项目=$projectId；设备=$deviceId；消息=$messageId（凭据未输出）"

if ($VerifyEmailNotification) {
    $capture = Join-Path $deployDir 'logs/smtp-test.local'
    $sent = $false
    $delivered = $false
    for ($attempt=0; $attempt -lt 45; $attempt++) {
        $page = Invoke-Api GET "/api/v1/projects/$projectId/alarm-notification-deliveries" $null $token
        $delivered = @($page.data.items | Where-Object {
            $_.channel -eq 'EMAIL' -and $_.status -eq 'SUCCEEDED' -and $_.attemptCount -ge 1
        }).Count -ge 1
        $sent = @(Get-ChildItem -LiteralPath $capture -Filter '*.eml' -File | Where-Object {
            [IO.File]::ReadAllText($_.FullName).Contains($subject)
        }).Count -ge 1
        if ($sent -and $delivered) { break }
        Start-Sleep -Seconds 1
    }
    if (-not $sent -or -not $delivered) {
        throw "告警邮件链路未完整通过：投递成功=$delivered；SMTP 捕获=$sent"
    }
    Write-Host 'jagonzn 告警邮件通过：设备 HTTPS 上报触发规则、投递 SUCCEEDED，独立 SMTP 接收器捕获唯一主题。'
}

# 同一租户下新建第二项目：第二项目会话不可读首项目设备，首项目设备密钥也不可冒充第二项目设备。
$neighbor = Invoke-Api POST '/api/v1/projects' @{name="reuse-neighbor-$suffix"; region='sh-1'} $token
if ($neighbor.status -ne 200 -or -not $neighbor.data.projectKey) { throw '隔离候选项目创建失败。' }
$neighborProjectId = [string]$neighbor.data.id
$neighborSession = Invoke-Api POST '/api/v1/auth/switch-project' @{
    projectId=$neighborProjectId
} $token
if ($neighborSession.status -ne 200 -or -not $neighborSession.data.accessToken) {
    throw '隔离候选项目会话切换失败。'
}
$crossList = Invoke-Api GET "/api/v1/projects/$projectId/devices" $null `
    ([string]$neighborSession.data.accessToken)
if ($crossList.status -ne 200 -or @($crossList.data).Count -ne 0) {
    throw "跨项目设备列表应被 RLS 裁剪为空，实际 $($crossList.status)/$(@($crossList.data).Count)"
}
$deniedDetail = 0
try {
    $unexpectedRead = Invoke-WebRequest -Method GET `
        -Uri "$base/api/v1/projects/$projectId/devices/$deviceId" `
        -Headers @{Authorization="Bearer $($neighborSession.data.accessToken)"} -WebSession $session
    $deniedDetail = [int]$unexpectedRead.StatusCode
} catch {
    if ($null -eq $_.Exception.Response) { throw }
    $deniedDetail = [int]$_.Exception.Response.StatusCode
}
if ($deniedDetail -ne 404) { throw "跨项目设备详情应被隐藏为 404，实际 $deniedDetail" }
$spoofMessageId = [Guid]::CreateVersion7().ToString()
$spoofBody = @{
    messageId=$spoofMessageId; occurredAt=[DateTimeOffset]::UtcNow.ToString('o');
    payload=@{temperature=28.5}
} | ConvertTo-Json -Compress -Depth 5
$deniedIngress = 0
try {
    $unexpectedIngress = Invoke-WebRequest -Method POST `
        -Uri 'https://127.0.0.1:18443/device-access/v1/property/report' `
        -SkipCertificateCheck -ContentType 'application/json' -Headers @{
            'X-TC-Device-Key'="$($neighbor.data.projectKey)/$deviceKey"
            'X-TC-Device-Secret'=[string]$credential.data.plainSecret
        } -Body $spoofBody
    $deniedIngress = [int]$unexpectedIngress.StatusCode
} catch {
    if ($null -eq $_.Exception.Response) { throw }
    $deniedIngress = [int]$_.Exception.Response.StatusCode
}
if ($deniedIngress -ne 401) { throw "跨项目设备凭据应返回 401，实际 $deniedIngress" }
$spoofCount = (& docker exec $container psql -U jagonzn -d jagonzn -v ON_ERROR_STOP=1 -Atqc `
    "SELECT count(*) FROM sys_inbox_message WHERE message_id='$spoofMessageId'").Trim()
if ($LASTEXITCODE -ne 0 -or $spoofCount -ne '0') { throw '跨项目冒用请求留下了 inbox 事实。' }
Write-Host 'jagonzn 同租户跨项目设备列表/详情/凭据冒用隔离通过：空列表/404/401，inbox=0'

# 第二台设备使用同一已发布物模型走原 MQTT 数据面，验证 Broker 认证和 Kafka 消费。
$mqttDeviceKey = "reuse-mqtt-$suffix"
$mqttDevice = Invoke-Api POST "/api/v1/projects/$projectId/devices" @{
    deviceTypeId=$typeId; deviceKey=$mqttDeviceKey; name='MQTT candidate'
} $token
if ($mqttDevice.status -ne 201) { throw 'MQTT 候选设备创建失败。' }
$mqttDeviceId = [string]$mqttDevice.data.id
$mqttCredential = Invoke-Api POST "/api/v1/projects/$projectId/devices/$mqttDeviceId/credentials" $null $token
if ($mqttCredential.status -ne 201 -or -not $mqttCredential.data.plainSecret) {
    throw 'MQTT 候选凭据生成失败。'
}
$mqttConfigPath = "/api/v1/projects/$projectId/devices/$mqttDeviceId/access-config"
$mqttConfig = Invoke-Api GET $mqttConfigPath $null $token
if ($mqttConfig.data.protocol -ne 'MQTT' -or -not $mqttConfig.data.enabled) {
    $mqttConfigured = Invoke-Api PUT $mqttConfigPath @{
        protocol='MQTT'; enabled=$true; expectedConfigVersion=[string]$mqttConfig.data.configVersion
    } $token
    if ($mqttConfigured.status -ne 200 -or -not $mqttConfigured.data.enabled) {
        throw 'MQTT 接入配置失败。'
    }
}
$mqttMessageId = [Guid]::CreateVersion7().ToString()
$mqttPayload = @{
    messageId=$mqttMessageId; occurredAt=[DateTimeOffset]::UtcNow.ToString('o');
    payload=@{temperature=29.5}
} | ConvertTo-Json -Compress -Depth 5
$mqttRequest = @{
    host='127.0.0.1'; port=21883; clientId="reuse-$suffix";
    username="$($project.data.projectKey)/$mqttDeviceKey";
    password=[string]$mqttCredential.data.plainSecret;
    topic="tc/v1/$($project.data.projectKey)/$mqttDeviceKey/up/property/report";
    payload=$mqttPayload
} | ConvertTo-Json -Compress
$mqttRequest | python (Join-Path $PSScriptRoot 'smoke_mqtt.py')
if ($LASTEXITCODE -ne 0) { throw 'MQTT 设备认证或 QoS1 发布失败。' }
$mqttCounts = ''
for ($attempt=0; $attempt -lt 30; $attempt++) {
    $mqttCounts = (& docker exec $container psql -U jagonzn -d jagonzn -v ON_ERROR_STOP=1 -Atqc `
        "SET app.project_id='$projectId'; SELECT (SELECT count(*) FROM sys_inbox_message WHERE message_id='$mqttMessageId'), (SELECT count(*) FROM ts_property_point WHERE message_id='$mqttMessageId'), (SELECT count(*) FROM dev_shadow WHERE device_id='$mqttDeviceId' AND reported->>'temperature'='29.5')").Trim()
    if ($LASTEXITCODE -ne 0) { throw '读取 MQTT 入库证据失败。' }
    if ($mqttCounts -eq '1|1|1') { break }
    Start-Sleep -Seconds 1
}
if ($mqttCounts -ne '1|1|1') { throw "MQTT 属性链路未完整落库：$mqttCounts" }
Write-Host "jagonzn MQTT 设备属性上报通过：inbox|history|shadow=$mqttCounts"
Write-Host "本机候选设备=$mqttDeviceId；消息=$mqttMessageId（凭据未输出）"

# 第三台设备走标准 TC v1/TLS，必须先收到 AUTH_RESPONSE，再以 ACCEPTED 确认上行。
$tcpDeviceKey = "reuse-tcp-$suffix"
$tcpDevice = Invoke-Api POST "/api/v1/projects/$projectId/devices" @{
    deviceTypeId=$typeId; deviceKey=$tcpDeviceKey; name='TCP candidate'
} $token
if ($tcpDevice.status -ne 201) { throw 'TCP 候选设备创建失败。' }
$tcpDeviceId = [string]$tcpDevice.data.id
$tcpCredential = Invoke-Api POST "/api/v1/projects/$projectId/devices/$tcpDeviceId/credentials" $null $token
if ($tcpCredential.status -ne 201 -or -not $tcpCredential.data.plainSecret) {
    throw 'TCP 候选凭据生成失败。'
}
$tcpConfigPath = "/api/v1/projects/$projectId/devices/$tcpDeviceId/access-config"
$tcpConfig = Invoke-Api GET $tcpConfigPath $null $token
$tcpConfigured = Invoke-Api PUT $tcpConfigPath @{
    protocol='TCP'; enabled=$true; expectedConfigVersion=[string]$tcpConfig.data.configVersion
} $token
if ($tcpConfigured.status -ne 200 -or -not $tcpConfigured.data.enabled) {
    throw 'TCP 接入配置失败。'
}
$tcpMessageId = [Guid]::CreateVersion7().ToString()
$tcpRequest = @{
    host='127.0.0.1'; port=18883;
    projectKey=[string]$project.data.projectKey; deviceKey=$tcpDeviceKey;
    password=[string]$tcpCredential.data.plainSecret;
    payload=@{messageId=$tcpMessageId; occurredAt=[DateTimeOffset]::UtcNow.ToString('o');
        payload=@{temperature=30.5}}
} | ConvertTo-Json -Compress -Depth 5
$tcpRequest | python (Join-Path $PSScriptRoot 'smoke_tcp.py')
if ($LASTEXITCODE -ne 0) { throw 'TCP 设备认证或属性受理失败。' }
$tcpCounts = ''
for ($attempt=0; $attempt -lt 30; $attempt++) {
    $tcpCounts = (& docker exec $container psql -U jagonzn -d jagonzn -v ON_ERROR_STOP=1 -Atqc `
        "SET app.project_id='$projectId'; SELECT (SELECT count(*) FROM sys_inbox_message WHERE message_id='$tcpMessageId'), (SELECT count(*) FROM ts_property_point WHERE message_id='$tcpMessageId'), (SELECT count(*) FROM dev_shadow WHERE device_id='$tcpDeviceId' AND reported->>'temperature'='30.5')").Trim()
    if ($LASTEXITCODE -ne 0) { throw '读取 TCP 入库证据失败。' }
    if ($tcpCounts -eq '1|1|1') { break }
    Start-Sleep -Seconds 1
}
if ($tcpCounts -ne '1|1|1') { throw "TCP 属性链路未完整落库：$tcpCounts" }
Write-Host "jagonzn TCP/TLS 设备属性上报通过：inbox|history|shadow=$tcpCounts"
Write-Host "本机候选设备=$tcpDeviceId；消息=$tcpMessageId（凭据未输出）"

# 默认沿用容器网络探针；-HostCoap 则从 Windows 宿主机走 Docker Desktop 发布的 UDP 端口。
$coapDeviceKey = "reuse-coap-$suffix"
$coapDevice = Invoke-Api POST "/api/v1/projects/$projectId/devices" @{
    deviceTypeId=$typeId; deviceKey=$coapDeviceKey; name='CoAP candidate'
} $token
if ($coapDevice.status -ne 201) { throw 'CoAP 候选设备创建失败。' }
$coapDeviceId = [string]$coapDevice.data.id
$coapCredential = Invoke-Api POST "/api/v1/projects/$projectId/devices/$coapDeviceId/credentials" $null $token
if ($coapCredential.status -ne 201 -or -not $coapCredential.data.plainSecret) {
    throw 'CoAP 候选凭据生成失败。'
}
$coapConfigPath = "/api/v1/projects/$projectId/devices/$coapDeviceId/access-config"
$coapConfig = Invoke-Api GET $coapConfigPath $null $token
$coapConfigured = Invoke-Api PUT $coapConfigPath @{
    protocol='COAP'; enabled=$true; expectedConfigVersion=[string]$coapConfig.data.configVersion
} $token
if ($coapConfigured.status -ne 200 -or -not $coapConfigured.data.enabled) {
    throw 'CoAP 接入配置失败。'
}
$coapProbeDir = Join-Path $deployDir 'artifacts.local\coap'
$coapLibDir = Join-Path $coapProbeDir 'lib'
[void][IO.Directory]::CreateDirectory($coapLibDir)
$mavenCache = Join-Path $env:USERPROFILE '.m2\repository'
@(
    'org\eclipse\californium\californium-core\3.14.0\californium-core-3.14.0.jar',
    'org\eclipse\californium\element-connector\3.14.0\element-connector-3.14.0.jar',
    'org\eclipse\californium\scandium\3.14.0\scandium-3.14.0.jar',
    'org\slf4j\slf4j-api\2.0.18\slf4j-api-2.0.18.jar'
) | ForEach-Object { Copy-Item -LiteralPath (Join-Path $mavenCache $_) -Destination $coapLibDir -Force }
& javac -cp "$coapLibDir\*" -d $coapProbeDir (Join-Path $PSScriptRoot 'SmokeCoap.java')
if ($LASTEXITCODE -ne 0) { throw '编译本机 CoAP 探针失败。' }
$coapMessageId = [Guid]::CreateVersion7().ToString()
$coapInput = @([string]$project.data.projectKey, $coapDeviceKey,
    [string]$coapCredential.data.plainSecret, $coapMessageId,
    [DateTimeOffset]::UtcNow.ToString('o')) -join "`n"
$certDir = Join-Path $deployDir 'certs.local'
if ($HostCoap) {
    $coapInput | & java -cp "$coapProbeDir;$coapLibDir\*" SmokeCoap $certDir
} else {
    $coapInput | docker run --rm -i --network container:jagonzn-service `
        -v "${coapProbeDir}:/work:ro" -v "${certDir}:/certs:ro" `
        eclipse-temurin:21-jre java -cp '/work:/work/lib/*' SmokeCoap
}
if ($LASTEXITCODE -ne 0) { throw 'CoAP/DTLS 设备属性受理失败。' }
$coapCounts = ''
for ($attempt=0; $attempt -lt 30; $attempt++) {
    $coapCounts = (& docker exec $container psql -U jagonzn -d jagonzn -v ON_ERROR_STOP=1 -Atqc `
        "SET app.project_id='$projectId'; SELECT (SELECT count(*) FROM sys_inbox_message WHERE message_id='$coapMessageId'), (SELECT count(*) FROM ts_property_point WHERE message_id='$coapMessageId'), (SELECT count(*) FROM dev_shadow WHERE device_id='$coapDeviceId' AND reported->>'temperature'='31.5')").Trim()
    if ($LASTEXITCODE -ne 0) { throw '读取 CoAP 入库证据失败。' }
    if ($coapCounts -eq '1|1|1') { break }
    Start-Sleep -Seconds 1
}
if ($coapCounts -ne '1|1|1') { throw "CoAP 属性链路未完整落库：$coapCounts" }
Write-Host "jagonzn CoAP/DTLS 设备属性上报通过：inbox|history|shadow=$coapCounts"
Write-Host "本机候选设备=$coapDeviceId；消息=$coapMessageId（凭据未输出）"

# 通过正式 OTA API 将一次性字节流写入独立 MinIO；这里只验证草稿上传，不宣称固件发布或设备升级。
$productCredential = Invoke-Api POST "/api/v1/projects/$projectId/device-types/$typeId/product-credential" `
    $null $token
if ($productCredential.status -ne 201) { throw 'OTA 候选产品身份初始化失败。' }
$modelVersion = Invoke-Api GET `
    "/api/v1/projects/$projectId/device-types/$typeId/thing-model-versions/latest" $null $token
if ($modelVersion.status -ne 200 -or -not $modelVersion.data.id) {
    throw 'OTA 候选物模型版本读取失败。'
}
$firmware = Invoke-Api POST "/api/v1/projects/$projectId/ota/firmwares" @{
    deviceTypeId=$typeId; thingModelVersionId=[string]$modelVersion.data.id;
    firmwareVersion="reuse-$suffix"
} $token @{'Idempotency-Key'=[Guid]::NewGuid().ToString()}
if ($firmware.status -ne 201 -or -not $firmware.data.id) { throw 'OTA 固件草稿创建失败。' }
$firmwareId = [string]$firmware.data.id
$binary = [Text.Encoding]::UTF8.GetBytes("jagonzn-ota-reuse-$suffix")
$binarySha = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($binary)).ToLowerInvariant()
$uploadPath = "/api/v1/projects/$projectId/ota/firmwares/$firmwareId/uploads"
$upload = Invoke-Api POST $uploadPath @{
    expectedLength=$binary.Length; expectedSha256=$binarySha
} $token @{'Idempotency-Key'=[Guid]::NewGuid().ToString()}
if ($upload.status -ne 201 -or -not $upload.data.id) { throw 'OTA 上传会话创建失败。' }
$uploadId = [string]$upload.data.id
$contentResponse = Invoke-WebRequest -Method PUT -Uri "$base$uploadPath/$uploadId/content" `
    -WebSession $session -ContentType 'application/octet-stream' -Headers @{
        Authorization="Bearer $token"; 'Idempotency-Key'=[Guid]::NewGuid().ToString()
    } -Body $binary -TimeoutSec 45
if ($contentResponse.StatusCode -ne 200) { throw "OTA 内容上传状态异常：$($contentResponse.StatusCode)" }
$uploaded = $contentResponse.Content | ConvertFrom-Json
if ($uploaded.status -ne 'VERIFIED' -or $uploaded.expectedSha256 -ne $binarySha) {
    throw "OTA 内容未校验通过：$($uploaded.status)"
}
$uploadFact = (& docker exec $container psql -U jagonzn -d jagonzn -v ON_ERROR_STOP=1 -Atqc `
    "SELECT count(*) FROM ota_firmware_upload_session WHERE id='$uploadId' AND status='VERIFIED' AND version_id IS NOT NULL").Trim()
if ($LASTEXITCODE -ne 0 -or $uploadFact -ne '1') { throw 'OTA/MinIO 上传持久事实不完整。' }
Write-Host "jagonzn OTA 固件草稿上传通过：HTTP 201/200，VERIFIED，MinIO 版本事实=$uploadFact"
Write-Host "本机候选固件=$firmwareId；上传会话=$uploadId（对象键与凭据未输出）"

if ($FaultHandoff) {
    # 仅短暂停止本机独立 Redpanda，验证未受理时不留下事实、恢复后原 ID 可重试。
    $faultMessageId = [Guid]::CreateVersion7().ToString()
    $faultBody = @{
        messageId=$faultMessageId; occurredAt=[DateTimeOffset]::UtcNow.ToString('o');
        payload=@{temperature=32.5}
    } | ConvertTo-Json -Compress -Depth 5
    $faultHeaders = @{
        'X-TC-Device-Key'="$($project.data.projectKey)/$deviceKey"
        'X-TC-Device-Secret'=[string]$credential.data.plainSecret
    }
    $composeArgs = @('--env-file', $envFile, '-f', (Join-Path $deployDir 'compose.yml'))
    & docker compose @composeArgs stop redpanda *> $null
    if ($LASTEXITCODE -ne 0) { throw '停止独立 Redpanda 失败，未执行故障注入。' }
    $failureStatus = 0
    try {
        try {
            $unexpected = Invoke-WebRequest -Method POST `
                -Uri 'https://127.0.0.1:18443/device-access/v1/property/report' `
                -SkipCertificateCheck -ContentType 'application/json' -Headers $faultHeaders `
                -Body $faultBody -TimeoutSec 20
            $failureStatus = [int]$unexpected.StatusCode
        } catch {
            if ($null -ne $_.Exception.Response) {
                $failureStatus = [int]$_.Exception.Response.StatusCode
            } else { throw }
        }
        if ($failureStatus -ne 503) { throw "交接故障预期 503，实际 $failureStatus" }
        $prior = (& docker exec $container psql -U jagonzn -d jagonzn -v ON_ERROR_STOP=1 -Atqc `
            "SELECT count(*) FROM sys_inbox_message WHERE message_id='$faultMessageId'").Trim()
        if ($LASTEXITCODE -ne 0 -or $prior -ne '0') { throw '故障请求已留下 inbox 事实。' }
    } finally {
        & docker compose @composeArgs up -d --wait redpanda *> $null
        if ($LASTEXITCODE -ne 0) { Write-Warning '独立 Redpanda 恢复失败，请立即检查本机栈。' }
    }
    $recovered = $false
    for ($attempt=0; $attempt -lt 12; $attempt++) {
        try {
            $retry = Invoke-WebRequest -Method POST `
                -Uri 'https://127.0.0.1:18443/device-access/v1/property/report' `
                -SkipCertificateCheck -ContentType 'application/json' -Headers $faultHeaders `
                -Body $faultBody -TimeoutSec 12
            if ($retry.StatusCode -eq 202) { $recovered = $true; break }
        } catch { Start-Sleep -Seconds 2 }
    }
    if (-not $recovered) { throw '恢复后使用原 ID 重试未获得 202。' }
    $recoveryCounts = ''
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        $recoveryCounts = (& docker exec $container psql -U jagonzn -d jagonzn -v ON_ERROR_STOP=1 -Atqc `
            "SET app.project_id='$projectId'; SELECT (SELECT count(*) FROM sys_inbox_message WHERE message_id='$faultMessageId'), (SELECT count(*) FROM ts_property_point WHERE message_id='$faultMessageId'), (SELECT count(*) FROM dev_shadow WHERE device_id='$deviceId' AND reported->>'temperature'='32.5')").Trim()
        if ($LASTEXITCODE -ne 0) { throw '读取交接恢复证据失败。' }
        if ($recoveryCounts -eq '1|1|1') { break }
        Start-Sleep -Seconds 1
    }
    if ($recoveryCounts -ne '1|1|1') { throw "交接恢复后落库不完整：$recoveryCounts" }
    Write-Host "jagonzn 交接故障恢复通过：故障 503/无 inbox，原 ID 重试 202，事实=$recoveryCounts"
}

param(
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'artifacts.local')
)

# 本机候选清单；SNAPSHOT 和脏工作区绝不可冒充不可变发布。
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$platform = Join-Path $root 'things-cloud'
$serviceJar = Join-Path $root 'jagonzn\jagonzn-service\target\jagonzn-service-0.0.1-SNAPSHOT.jar'
if (-not (Test-Path -LiteralPath $serviceJar)) { throw '请先打包 jagonzn-service。' }

$moduleJars = @(Get-ChildItem -LiteralPath $platform -Directory -Filter 'things-cloud-*' |
    Where-Object { $_.Name -ne 'things-cloud-bootstrap' } |
    ForEach-Object { Join-Path $_.FullName "target\$($_.Name)-0.0.1-SNAPSHOT.jar" })
foreach ($jar in $moduleJars) {
    if (-not (Test-Path -LiteralPath $jar)) { throw "缺少平台模块 JAR：$jar" }
}
$files = @($moduleJars | Sort-Object) + @($serviceJar)
$fingerprints = @($files | ForEach-Object {
    [ordered]@{
        path = [IO.Path]::GetRelativePath($root, $_).Replace('\', '/')
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_).Hash.ToLowerInvariant()
        bytes = (Get-Item -LiteralPath $_).Length
    }
})

Add-Type -AssemblyName System.IO.Compression
$archive = [IO.Compression.ZipFile]::OpenRead($serviceJar)
try {
    $migrations = @($archive.Entries | Where-Object {
        $_.FullName -match '^BOOT-INF/classes/jagonzn/db/migration/.+\.sql$'
    })
    if ($migrations.Count -ne 313) { throw "候选迁移数不是 313：$($migrations.Count)" }
    $originalRoles = 'thingscloud_(app|quota_operator|commercial_admin|topology_guard|constraint|automation_cleanup)'
    foreach ($entry in $migrations) {
        $reader = [IO.StreamReader]::new($entry.Open())
        try {
            if ($reader.ReadToEnd() -match $originalRoles) {
                throw "候选迁移含原数据库角色：$($entry.FullName)"
            }
        } finally { $reader.Dispose() }
    }
} finally { $archive.Dispose() }

$commit = (& git -C $root rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw '读取 Git commit 失败。' }
$dirty = @(& git -C $root status --porcelain).Count -gt 0
if ($LASTEXITCODE -ne 0) { throw '读取 Git 工作区状态失败。' }
$manifest = [ordered]@{
    kind = 'LOCAL_CANDIDATE_ONLY'
    createdUtc = [DateTime]::UtcNow.ToString('o')
    sourceCommit = $commit
    sourceDirty = $dirty
    version = '0.0.1-SNAPSHOT'
    javaMajor = 21
    springBoot = '4.1.0'
    jagonznMigrationCount = $migrations.Count
    artifacts = $fingerprints
}
[void][IO.Directory]::CreateDirectory($OutputDirectory)
$manifestFile = Join-Path $OutputDirectory 'candidate-manifest.json'
[IO.File]::WriteAllText($manifestFile, ($manifest | ConvertTo-Json -Depth 5) + "`n",
    [Text.UTF8Encoding]::new($false))
Write-Host "本机候选指纹已写入：$manifestFile"
Write-Host "平台模块 JAR 数=$($moduleJars.Count)；jagonzn 迁移数=$($migrations.Count)；工作区有修改=$dirty"
Write-Host 'SNAPSHOT/本机清单不构成正式不可变发布。'

param(
    [switch]$SkipMigrations,
    [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonExe = Join-Path $root '.venv\Scripts\python.exe'
$backendDir = Join-Path $root 'backend'
$frontendDir = Join-Path $root 'frontend'
$redisDir = Join-Path $root '.runtime\redis'
$redisExe = Join-Path $redisDir 'redis-server.exe'
$redisConfig = Join-Path $redisDir 'redis.windows.conf'
$runtimeDir = Join-Path $root '.runtime'
$pidDir = Join-Path $runtimeDir 'pids'
$uploadsDir = Join-Path $runtimeDir 'uploads'
$frontendUrl = 'http://127.0.0.1:5173'
$apiUrl = 'http://127.0.0.1:8000'
$apiBaseUrl = "$apiUrl/api/v1"
$powershellExe = Join-Path $PSHOME 'powershell.exe'

$backendDatabaseUrl = 'postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/finance_tracker'
$backendSyncDatabaseUrl = 'postgresql+psycopg://postgres:postgres@127.0.0.1:5432/finance_tracker'
$backendRedisUrl = 'redis://127.0.0.1:6379/0'

function Assert-Path {
    param(
        [string]$Path,
        [string]$Label
    )

    if (-not (Test-Path $Path)) {
        throw "Не найден ${Label}: $Path"
    }
}

function Get-PortOwner {
    param([int]$Port)

    $match = netstat -ano | Select-String ":$Port\s+.*LISTENING\s+(\d+)$" | Select-Object -First 1
    if ($null -eq $match) {
        return $null
    }

    return [int]$match.Matches[0].Groups[1].Value
}

function Assert-PortFree {
    param(
        [int]$Port,
        [string]$Label
    )

    $owner = Get-PortOwner -Port $Port
    if ($null -ne $owner) {
        throw "$Label не может стартовать: порт $Port уже занят процессом PID $owner. Останови его или выполни .\stop-local.ps1"
    }
}

function Start-Window {
    param(
        [string]$Name,
        [string]$Command,
        [string]$WorkingDirectory
    )

    $process = Start-Process -FilePath $powershellExe -ArgumentList '-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $Command -WorkingDirectory $WorkingDirectory -PassThru
    Set-Content -Path (Join-Path $pidDir "$Name.pid") -Value $process.Id -Encoding ascii
    return $process
}

function Wait-ForHttp {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 45
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            return Invoke-WebRequest -UseBasicParsing $Url
        }
        catch {
            Start-Sleep -Seconds 1
        }
    }

    throw "Сервис не ответил вовремя: $Url"
}

Assert-Path -Path $pythonExe -Label 'Python virtualenv'
Assert-Path -Path $backendDir -Label 'backend директория'
Assert-Path -Path $frontendDir -Label 'frontend директория'
Assert-Path -Path $redisExe -Label 'Redis server'
Assert-Path -Path $redisConfig -Label 'Redis config'
Assert-Path -Path (Join-Path $frontendDir 'node_modules') -Label 'frontend/node_modules'

New-Item -ItemType Directory -Force $runtimeDir | Out-Null
New-Item -ItemType Directory -Force $pidDir | Out-Null
New-Item -ItemType Directory -Force $uploadsDir | Out-Null

$postgresService = Get-Service | Where-Object { $_.Name -like 'postgresql*' } | Sort-Object Name | Select-Object -First 1
if ($null -ne $postgresService -and $postgresService.Status -ne 'Running') {
    try {
        Start-Service -Name $postgresService.Name
        Start-Sleep -Seconds 2
    }
    catch {
        Write-Warning "Не удалось автоматически запустить службу PostgreSQL ($($postgresService.Name)). Продолжаю, если БД уже доступна."
    }
}

Assert-PortFree -Port 6379 -Label 'Redis'
Assert-PortFree -Port 8000 -Label 'Backend API'
Assert-PortFree -Port 5173 -Label 'Frontend'

$env:BACKEND_DATABASE_URL = $backendDatabaseUrl
$env:BACKEND_SYNC_DATABASE_URL = $backendSyncDatabaseUrl
$env:BACKEND_REDIS_URL = $backendRedisUrl
$env:BACKEND_DEBUG = 'true'
$env:BACKEND_DEV_AUTH_ENABLED = 'true'
$env:BACKEND_UPLOAD_DIR = $uploadsDir

if (-not $SkipMigrations) {
    Push-Location $backendDir
    try {
        & $pythonExe -m alembic upgrade head
    }
    finally {
        Pop-Location
    }
}

$redisCommand = @"
Set-Location '$redisDir'
& '$redisExe' '$redisConfig' --port 6379
"@

$backendCommand = @"
`$env:BACKEND_DATABASE_URL = '$backendDatabaseUrl'
`$env:BACKEND_SYNC_DATABASE_URL = '$backendSyncDatabaseUrl'
`$env:BACKEND_REDIS_URL = '$backendRedisUrl'
`$env:BACKEND_DEBUG = 'true'
`$env:BACKEND_DEV_AUTH_ENABLED = 'true'
`$env:BACKEND_UPLOAD_DIR = '$uploadsDir'
Set-Location '$backendDir'
& '$pythonExe' -m uvicorn app.main:app --host 127.0.0.1 --port 8000
"@

$workerCommand = @"
`$env:BACKEND_DATABASE_URL = '$backendDatabaseUrl'
`$env:BACKEND_SYNC_DATABASE_URL = '$backendSyncDatabaseUrl'
`$env:BACKEND_REDIS_URL = '$backendRedisUrl'
`$env:BACKEND_DEBUG = 'true'
`$env:BACKEND_DEV_AUTH_ENABLED = 'true'
`$env:BACKEND_UPLOAD_DIR = '$uploadsDir'
Set-Location '$backendDir'
& '$pythonExe' -m app.workers.worker
"@

$frontendCommand = @"
`$env:VITE_API_BASE_URL = '$apiBaseUrl'
Set-Location '$frontendDir'
npm run dev -- --host 127.0.0.1 --port 5173
"@

$null = Start-Window -Name 'redis' -Command $redisCommand -WorkingDirectory $redisDir
$null = Start-Window -Name 'backend' -Command $backendCommand -WorkingDirectory $backendDir
$null = Start-Window -Name 'worker' -Command $workerCommand -WorkingDirectory $backendDir
$null = Start-Window -Name 'frontend' -Command $frontendCommand -WorkingDirectory $frontendDir

$healthResponse = Wait-ForHttp -Url "$apiBaseUrl/health"
$frontendResponse = Wait-ForHttp -Url $frontendUrl

$health = $healthResponse.Content | ConvertFrom-Json
if ($health.status -ne 'ok') {
    Write-Warning "API поднят, но health не полностью зелёный: $($healthResponse.Content)"
}

Write-Host ''
Write-Host 'Локальный стек запущен.' -ForegroundColor Green
Write-Host "Frontend: $frontendUrl"
Write-Host "API:      $apiUrl/docs"
Write-Host "Health:   $apiBaseUrl/health"
Write-Host 'Остановить всё можно командой: powershell -ExecutionPolicy Bypass -File .\stop-local.ps1'

if ($OpenBrowser) {
    Start-Process $frontendUrl | Out-Null
}


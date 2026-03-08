$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidDir = Join-Path $root '.runtime\pids'
$pidNames = @('frontend', 'worker', 'backend', 'redis')

if (-not (Test-Path $pidDir)) {
    Write-Host 'PID-файлы не найдены. Нечего останавливать.'
    return
}

foreach ($name in $pidNames) {
    $pidFile = Join-Path $pidDir "$name.pid"
    if (-not (Test-Path $pidFile)) {
        continue
    }

    $rawPid = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($rawPid) {
        $processId = [int]$rawPid
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "Остановлен $name (PID $processId)"
        }
        catch {
            Write-Host "$name уже остановлен или PID устарел ($processId)"
        }
    }

    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

Write-Host 'Локальные окна запуска остановлены.' -ForegroundColor Green


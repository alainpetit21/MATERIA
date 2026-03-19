<#
.SYNOPSIS
    Start and stop the Trivia Quest Docker environment.

.PARAMETER Action
    start, stop, restart, or status.

.EXAMPLE
    .\start-server.ps1
    .\start-server.ps1 stop
    .\start-server.ps1 restart
    .\start-server.ps1 status
#>

param(
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "start"
)

$ProjectName = "Trivia Quest"
$ProjectPath = $PSScriptRoot
$ComposeFile = "docker-compose.yml"
$Port        = 3002
$Url         = "http://localhost:$Port"

function Start-Project {
    Write-Host "`n>> Starting $ProjectName ..." -ForegroundColor Cyan
    Push-Location $ProjectPath
    try {
        & docker compose -f $ComposeFile up --build -d
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   OK  $ProjectName -> $Url" -ForegroundColor Green
        } else {
            Write-Host "   FAIL  $ProjectName" -ForegroundColor Red
        }
    } finally {
        Pop-Location
    }
}

function Stop-Project {
    Write-Host "`n>> Stopping $ProjectName ..." -ForegroundColor Yellow
    Push-Location $ProjectPath
    try {
        & docker compose -f $ComposeFile down
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   OK  $ProjectName stopped" -ForegroundColor Green
        } else {
            Write-Host "   FAIL  Could not stop $ProjectName" -ForegroundColor Red
        }
    } finally {
        Pop-Location
    }
}

function Show-Status {
    $portCheck = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue -InformationLevel Quiet
    if ($portCheck) {
        Write-Host "  [UP]    $($ProjectName.PadRight(25)) $Url" -ForegroundColor Green
    } else {
        Write-Host "  [DOWN]  $($ProjectName.PadRight(25)) port $Port" -ForegroundColor DarkGray
    }
}

# Execute
Write-Host "`n=== Trivia Quest ===" -ForegroundColor White

switch ($Action) {
    "start" {
        Start-Project
        Write-Host "`n--- Status ---" -ForegroundColor White
        Show-Status
    }
    "stop" {
        Stop-Project
    }
    "restart" {
        Stop-Project
        Start-Project
        Write-Host "`n--- Status ---" -ForegroundColor White
        Show-Status
    }
    "status" {
        Show-Status
    }
}

Write-Host ""

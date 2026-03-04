# Start local HTTP server for Trivia Quest
# Usage: .\start-server.ps1 [-Port <port>] [-SkipDB] [-Title <title>]

param(
    [int]$Port = 8080,
    [switch]$SkipDB,
    [string]$Title = "Trivia Quest",
    [string]$AdminPassword = "admin123",
    [string]$Freeplay = "false",
    [string]$RequireUserPassword = "false"
)

$Host.UI.RawUI.WindowTitle = "Trivia Quest Server"

Write-Host ""
Write-Host "  ╔══════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "  ║       Trivia Quest Server         ║" -ForegroundColor Magenta
Write-Host "  ╚══════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host ""

# Get script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $scriptDir "app"
$dataDir = Join-Path $scriptDir "data"
$dbPath = Join-Path $dataDir "questions.db"

# Try Python 3 first, then Python
$pythonCmd = $null
if (Get-Command python3 -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} else {
    Write-Host "  ERROR: Python is not installed or not in PATH" -ForegroundColor Red
    Write-Host "  Please install Python from https://python.org" -ForegroundColor Red
    exit 1
}

# Check for Flask
Write-Host "  Checking dependencies..." -ForegroundColor Cyan
$flaskCheck = & $pythonCmd -c "import flask; import flask_cors" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Installing Flask dependencies..." -ForegroundColor Yellow
    & $pythonCmd -m pip install flask flask-cors --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Failed to install Flask. Run: pip install flask flask-cors" -ForegroundColor Red
        exit 1
    }
}

Write-Host "  Title: $Title" -ForegroundColor Cyan

# Build database by default (unless skipped)
if (-not $SkipDB) {
    Write-Host "  Building SQLite database..." -ForegroundColor Yellow
    
    $buildScript = Join-Path $scriptDir "scripts\build_database.py"
    $questionBank = Join-Path $scriptDir "question_bank"
    
    # Create data directory if it doesn't exist
    if (-not (Test-Path $dataDir)) {
        New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
    }
    
    # Remove existing database to ensure fresh build
    if (Test-Path $dbPath) {
        Remove-Item $dbPath -Force
        Write-Host "  Removed existing database" -ForegroundColor DarkGray
    }
    
    # Set environment variables and run build script
    $env:DATABASE_PATH = $dbPath
    $env:QUESTION_BANK_PATH = $questionBank
    
    try {
        & $pythonCmd $buildScript
        if ($LASTEXITCODE -ne 0) {
            Write-Host ""
            Write-Host "  ERROR: Database build failed" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host ""
        Write-Host "  ERROR: Database build failed - $_" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "  Database built: $dbPath" -ForegroundColor Green
} else {
    Write-Host "  Skipping database build (-SkipDB)" -ForegroundColor DarkGray
}

Write-Host ""

# Set environment variables for dev server
$env:PORT = $Port
$env:DATABASE_PATH = $dbPath
$env:APP_TITLE = $Title
$env:ADMIN_PASSWORD = $AdminPassword
$env:FREEPLAY = $Freeplay
$env:REQUIRE_USER_PASSWORD = $RequireUserPassword

# Start the Flask dev server
$devServer = Join-Path $scriptDir "dev-server.py"
& $pythonCmd $devServer

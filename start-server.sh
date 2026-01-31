#!/bin/bash
# Start local HTTP server for Trivia Quest
# Usage: ./start-server.sh [port] [--skip-db] [--title "Custom Title"]

PORT=8080
SKIP_DB=false
APP_TITLE="Trivia Quest"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-db)
            SKIP_DB=true
            shift
            ;;
        --title)
            APP_TITLE="$2"
            shift 2
            ;;
        *)
            PORT="$1"
            shift
            ;;
    esac
done

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║       Trivia Quest Server         ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"
DATA_DIR="$SCRIPT_DIR/data"
DB_PATH="$DATA_DIR/questions.db"

# Detect Python command
PYTHON_CMD=""
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo "  ERROR: Python is not installed or not in PATH"
    echo "  Please install Python from https://python.org"
    exit 1
fi

# Check for Flask
echo "  Checking dependencies..."
if ! $PYTHON_CMD -c "import flask; import flask_cors" 2>/dev/null; then
    echo "  Installing Flask dependencies..."
    $PYTHON_CMD -m pip install flask flask-cors --quiet
    if [ $? -ne 0 ]; then
        echo "  ERROR: Failed to install Flask. Run: pip install flask flask-cors"
        exit 1
    fi
fi

echo "  Title: $APP_TITLE"

# Build database by default (unless skipped)
if [ "$SKIP_DB" = false ]; then
    echo "  Building SQLite database..."
    
    BUILD_SCRIPT="$SCRIPT_DIR/scripts/build_database.py"
    QUESTION_BANK="$SCRIPT_DIR/question_bank"
    
    # Create data directory if it doesn't exist
    mkdir -p "$DATA_DIR"
    
    # Remove existing database to ensure fresh build
    if [ -f "$DB_PATH" ]; then
        rm -f "$DB_PATH"
        echo "  Removed existing database"
    fi
    
    # Set environment variables and run build script
    export DATABASE_PATH="$DB_PATH"
    export QUESTION_BANK_PATH="$QUESTION_BANK"
    
    if ! $PYTHON_CMD "$BUILD_SCRIPT"; then
        echo ""
        echo "  ERROR: Database build failed"
        exit 1
    fi
    
    echo "  Database built: $DB_PATH"
else
    echo "  Skipping database build (--skip-db)"
fi

echo ""

# Set environment variables for dev server
export PORT="$PORT"
export DATABASE_PATH="$DB_PATH"
export APP_TITLE="$APP_TITLE"

# Start the Flask dev server
$PYTHON_CMD "$SCRIPT_DIR/dev-server.py"

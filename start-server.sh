#!/usr/bin/env bash
# Start and stop the Trivia Quest Docker environment.
#
# Usage:
#   ./start-server.sh [start|stop|restart|status]
#
# Examples:
#   ./start-server.sh
#   ./start-server.sh stop
#   ./start-server.sh restart
#   ./start-server.sh status

set -euo pipefail

PROJECT_NAME="Trivia Quest"
PROJECT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="docker-compose.yml"
PORT=3002
URL="http://localhost:$PORT"

# ── colours ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
CYAN='\033[0;36m'; WHITE='\033[1;37m'; GREY='\033[1;30m'; NC='\033[0m'

# ── helpers ──────────────────────────────────────────────────────
check_port() {
    (echo >/dev/tcp/localhost/"$1") 2>/dev/null
}

start_project() {
    printf "\n${CYAN}>> Starting %s ...${NC}\n" "$PROJECT_NAME"
    pushd "$PROJECT_PATH" >/dev/null
    if docker compose -f "$COMPOSE_FILE" up --build -d; then
        printf "   ${GREEN}OK  %s -> %s${NC}\n" "$PROJECT_NAME" "$URL"
    else
        printf "   ${RED}FAIL  %s${NC}\n" "$PROJECT_NAME"
    fi
    popd >/dev/null
}

stop_project() {
    printf "\n${YELLOW}>> Stopping %s ...${NC}\n" "$PROJECT_NAME"
    pushd "$PROJECT_PATH" >/dev/null
    if docker compose -f "$COMPOSE_FILE" down; then
        printf "   ${GREEN}OK  %s stopped${NC}\n" "$PROJECT_NAME"
    else
        printf "   ${RED}FAIL  Could not stop %s${NC}\n" "$PROJECT_NAME"
    fi
    popd >/dev/null
}

show_status() {
    if check_port "$PORT"; then
        printf "  ${GREEN}[UP]    %-25s %s${NC}\n" "$PROJECT_NAME" "$URL"
    else
        printf "  ${GREY}[DOWN]  %-25s port %s${NC}\n" "$PROJECT_NAME" "$PORT"
    fi
}

# ── execute ──────────────────────────────────────────────────────
ACTION="${1:-start}"

case "$ACTION" in
    start|stop|restart|status) ;;
    *) echo "Usage: $0 [start|stop|restart|status]"; exit 1 ;;
esac

printf "\n${WHITE}=== Trivia Quest ===${NC}\n"

case "$ACTION" in
    start)
        start_project
        printf "\n${WHITE}--- Status ---${NC}\n"
        show_status
        ;;
    stop)
        stop_project
        ;;
    restart)
        stop_project
        start_project
        printf "\n${WHITE}--- Status ---${NC}\n"
        show_status
        ;;
    status)
        show_status
        ;;
esac

echo ""

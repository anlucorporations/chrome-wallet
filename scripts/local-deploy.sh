#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# scripts/local-deploy.sh — Despliegue local de la wallet.
# ───────────────────────────────────────────────────────────────────────────
# Levanta en segundo plano los dos servicios que necesita la extensión:
#
#   1. anvil (Foundry)  → http://127.0.0.1:8545  (chainId 31337)
#   2. servidor web     → http://127.0.0.1:5173  (sirve test.html y el popup)
#
# La extensión se carga aparte en Chrome (chrome://extensions → Cargar
# descomprimida → dist/). Si tu Chrome no está en esta misma máquina, haz un
# túnel SSH con:  ssh -L 5173:127.0.0.1:5173 -L 8545:127.0.0.1:8545 <usuario>@<host>
#
# Uso:
#   bash scripts/local-deploy.sh start    # compila y arranca los servicios
#   bash scripts/local-deploy.sh status   # comprueba que responden
#   bash scripts/local-deploy.sh stop     # detiene los servicios
#   bash scripts/local-deploy.sh logs     # muestra los registros
# ───────────────────────────────────────────────────────────────────────────
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/.local-deploy"
ANVIL_LOG="$LOG_DIR/anvil.log"
WEB_LOG="$LOG_DIR/web.log"
ANVIL_PID="$LOG_DIR/anvil.pid"
WEB_PID="$LOG_DIR/web.pid"

ANVIL_URL="http://127.0.0.1:8545"
WEB_URL="http://127.0.0.1:5173"

service_up() {
  curl -s -m 3 -o /dev/null -X POST "$ANVIL_URL" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}'
}

web_up() {
  curl -s -m 3 -o /dev/null "$WEB_URL/index.html"
}

cmd_start() {
  mkdir -p "$LOG_DIR"

  if service_up; then
    echo "⛓️  anvil ya está en marcha en $ANVIL_URL"
  else
    echo "⛓️  Arrancando anvil…"
    nohup bash scripts/foundry.sh anvil --host 127.0.0.1 --port 8545 --chain-id 31337 \
      >"$ANVIL_LOG" 2>&1 &
    echo $! >"$ANVIL_PID"
    for _ in $(seq 1 40); do service_up && break; sleep 0.5; done
  fi

  if web_up; then
    echo "🌐 El servidor web ya está en marcha en $WEB_URL"
  else
    echo "🌐 Arrancando el servidor web…"
    nohup npx vite --host 127.0.0.1 --port 5173 >"$WEB_LOG" 2>&1 &
    echo $! >"$WEB_PID"
    for _ in $(seq 1 40); do web_up && break; sleep 0.5; done
  fi

  echo ""
  cmd_status
  echo ""
  echo "Para usar la extensión en tu equipo:"
  echo "  1. Descarga el ZIP de entrega y descomprímelo"
  echo "  2. chrome://extensions → Modo de desarrollador → Cargar descomprimida → dist/"
  echo "  3. Abre $WEB_URL/test.html"
  echo ""
  echo "Si el navegador no está en esta máquina, abre antes un túnel SSH:"
  echo "  ssh -L 5173:127.0.0.1:5173 -L 8545:127.0.0.1:8545 $(whoami)@$(hostname)"
}

cmd_status() {
  printf '  %-22s ' "anvil ($ANVIL_URL)"
  if service_up; then
    local chain
    chain="$(curl -s -m 3 -X POST "$ANVIL_URL" -H 'Content-Type: application/json' \
      -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' | sed 's/.*"result":"\([^"]*\)".*/\1/')"
    echo "✅ activo (chainId $chain)"
  else
    echo "❌ parado"
  fi

  printf '  %-22s ' "web ($WEB_URL)"
  if web_up; then echo "✅ activo (test.html e index.html)"; else echo "❌ parado"; fi
}

cmd_stop() {
  for name in web anvil; do
    local pid_file="$LOG_DIR/$name.pid"
    if [ -f "$pid_file" ]; then
      local pid
      pid="$(cat "$pid_file")"
      if kill "$pid" 2>/dev/null; then echo "🛑 Detenido $name (pid $pid)"; else echo "ℹ️  $name ya estaba parado"; fi
      rm -f "$pid_file"
    fi
  done
}

cmd_logs() {
  echo "── anvil ($ANVIL_LOG) ──"; tail -n 15 "$ANVIL_LOG" 2>/dev/null || echo "(sin registros)"
  echo "── web ($WEB_LOG) ──"; tail -n 15 "$WEB_LOG" 2>/dev/null || echo "(sin registros)"
}

case "${1:-start}" in
  start) cmd_start ;;
  status) cmd_status ;;
  stop) cmd_stop ;;
  logs) cmd_logs ;;
  *) echo "Uso: bash scripts/local-deploy.sh {start|status|stop|logs}" >&2; exit 1 ;;
esac

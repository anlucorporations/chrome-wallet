#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────
# scripts/foundry.sh — lanzador portable de las herramientas de Foundry
# ───────────────────────────────────────────────────────────────────
# Resuelve anvil/forge/cast/chisel aunque Foundry no esté en el PATH
# (caso habitual tras `foundryup`, que lo instala en ~/.foundry/bin).
#
# Uso:
#   bash scripts/foundry.sh anvil --host 127.0.0.1 --port 8545 --chain-id 31337
#   bash scripts/foundry.sh forge test
#   bash scripts/foundry.sh cast balance 0xf39F... --rpc-url local
# ───────────────────────────────────────────────────────────────────
set -euo pipefail

TOOL="${1:-}"
if [ -z "$TOOL" ]; then
  echo "Uso: bash scripts/foundry.sh <anvil|forge|cast|chisel> [argumentos...]" >&2
  exit 1
fi
shift

# 1) Si ya está en el PATH, se usa tal cual.
if command -v "$TOOL" >/dev/null 2>&1; then
  exec "$TOOL" "$@"
fi

# 2) Si no, se busca en las ubicaciones habituales de instalación.
for candidate in "$HOME/.foundry/bin/$TOOL" "/usr/local/bin/$TOOL" "/opt/foundry/bin/$TOOL"; do
  if [ -x "$candidate" ]; then
    exec "$candidate" "$@"
  fi
done

# 3) Mensaje de ayuda si Foundry no está instalado.
echo "❌ No se encontró '$TOOL': Foundry no está instalado o no es accesible." >&2
echo "" >&2
echo "   Instálalo con:" >&2
echo "     curl -L https://foundry.paradigm.xyz | bash" >&2
echo "     foundryup" >&2
echo "" >&2
echo "   O añade la carpeta de binarios al PATH de tu shell:" >&2
echo "     export PATH=\"\$PATH:\$HOME/.foundry/bin\"" >&2
exit 127

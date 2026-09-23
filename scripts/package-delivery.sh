#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────────────
# scripts/package-delivery.sh — Genera el ZIP de entrega del proyecto.
# ───────────────────────────────────────────────────────────────────────────
# Compila la extensión e incluye en el ZIP el código, el build (`dist/`) y la
# documentación vigente. Se excluyen los artefactos que no forman parte de la
# entrega: `node_modules`, el historial de desarrollo (8,2 MB de volcado de chat)
# y las carpetas de compilación de Foundry.
#
# Uso:
#   bash scripts/package-delivery.sh [nombre.zip]
# ───────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ZIP_NAME="${1:-codecrypto_wallet_entrega.zip}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "📦 Preparando la entrega…"

# 1. Build de la extensión (el enunciado pide entregar dist/ compilado)
echo "🔨 Compilando (npm run build)…"
npm run build >/dev/null
echo "   ✅ dist/ generado"

# 2. Copia de los archivos que sí se entregan
FILES=(
  src public contracts test scripts
  dist
  index.html connect.html notification.html test.html
  package.json package-lock.json
  tsconfig.json tsconfig.app.json tsconfig.node.json
  vite.config.ts eslint.config.js foundry.toml
  README.md INSTRUCCIONES.md CHANGELOG.md GUIA_RAPIDA_TESTING.md TAREA_PARA_ESTUDIANTE.md
  PRACTICA_INTEGRACION_GCP.md
)

for item in "${FILES[@]}"; do
  if [ -e "$item" ]; then
    mkdir -p "$STAGE/$(dirname "$item")"
    cp -r "$item" "$STAGE/$item"
  else
    echo "   ⚠️  Falta $item (se omite)"
  fi
done

# La documentación se entrega sin el historial de desarrollo
mkdir -p "$STAGE/documentacion"
for doc in documentacion/*.md; do
  [ -e "$doc" ] && cp "$doc" "$STAGE/documentacion/"
done
# Capturas del smoke test en Chrome (evidencia visual), si existen
[ -d documentacion/capturas ] && cp -r documentacion/capturas "$STAGE/documentacion/"

# Limpieza de artefactos dentro de lo copiado
rm -rf "$STAGE/scripts/__pycache__" 2>/dev/null || true

# 3. Empaquetado (python3 trae zipfile en la biblioteca estándar)
echo "🗜️  Comprimiendo en $ZIP_NAME…"
python3 - "$STAGE" "$ZIP_NAME" <<'PY'
import os, sys, zipfile

stage, zip_name = sys.argv[1], sys.argv[2]
if os.path.exists(zip_name):
    os.remove(zip_name)

with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for root, dirs, files in os.walk(stage):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            rel = os.path.relpath(full, stage)
            zf.write(full, os.path.join('codecrypto_wallet', rel))
PY

SIZE="$(du -h "$ZIP_NAME" | cut -f1)"
COUNT="$(python3 -c "import zipfile,sys;print(len(zipfile.ZipFile(sys.argv[1]).namelist()))" "$ZIP_NAME")"
echo "   ✅ $ZIP_NAME ($SIZE, $COUNT archivos)"

# 4. Resumen del contenido
echo ""
echo "Contenido principal:"
python3 - "$ZIP_NAME" <<'PY'
import sys, zipfile
names = zipfile.ZipFile(sys.argv[1]).namelist()
for prefix in ['src/', 'dist/', 'contracts/', 'test/', 'documentacion/']:
    files = [n for n in names if n.startswith(f'codecrypto_wallet/{prefix}')]
    print(f"  {prefix:<16} {len(files)} archivos")
raiz = [n for n in names if n.count('/') == 1]
print(f"  {'raíz':<16} {len(raiz)} archivos")
PY
echo ""
echo "✅ Entrega lista. Súbela con el nombre que pida tu profesor."

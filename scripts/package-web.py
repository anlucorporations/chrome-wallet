#!/usr/bin/env python3
"""Empaqueta `dist/` de la extensión como ZIP desempaquetado para servirlo desde
la web (M7: instalación nativa desde la barra de navegación del proyecto).

Genera en `web/public/wallet/`:
  - TrueKeateWallet.zip          (nombre estable para el enlace de descarga)
  - TrueKeateWallet-v<version>.zip (copia versionada)

Uso:  python3 scripts/package-web.py   (después de `npm run build`)
"""
from __future__ import annotations

import json
import os
import pathlib
import shutil
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]          # wallet-extension/
DIST = ROOT / "dist"
WEB = ROOT.parent / "web" / "public" / "wallet"

if not (DIST / "manifest.json").exists():
    sys.exit("No hay dist/manifest.json: ejecuta antes `npm run build`.")

manifest = json.loads((DIST / "manifest.json").read_text(encoding="utf-8"))
version = manifest.get("version", "0.0.0")
WEB.mkdir(parents=True, exist_ok=True)
estable = WEB / "TrueKeateWallet.zip"

with zipfile.ZipFile(estable, "w", zipfile.ZIP_DEFLATED) as z:
    for base, _dirs, files in os.walk(DIST):
        for nombre in files:
            ruta = pathlib.Path(base) / nombre
            z.write(ruta, ruta.relative_to(DIST))

shutil.copyfile(estable, WEB / f"TrueKeateWallet-v{version}.zip")
print(f"OK {estable} ({estable.stat().st_size} bytes) · versión {version}")

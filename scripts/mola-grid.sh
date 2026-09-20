#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/precompute"
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -e ".[mola]"
fi
if [[ ! -f data/raw/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif ]]; then
  .venv/bin/python -m mars_ocean download
fi
exec .venv/bin/python -m mars_ocean mola --spacing-km 150 --out "$ROOT/web/public/grid/hex-grid.json"

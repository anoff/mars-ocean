#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/precompute"
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -e ".[grid]"
fi
exec .venv/bin/python -m mars_ocean fake --spacing-km 150 --out "$ROOT/web/public/grid/hex-grid.json"

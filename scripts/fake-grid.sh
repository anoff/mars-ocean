#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/precompute"
exec python3 -m mars_ocean fake --spacing-km 150 --out "$ROOT/web/public/grid/hex-grid.json"

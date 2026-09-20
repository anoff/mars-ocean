from __future__ import annotations

import argparse
import json
from pathlib import Path

from mars_ocean import BIN_COUNT
from mars_ocean.fake import build_fake_grid


def _cmd_fake(args: argparse.Namespace) -> int:
    grid = build_fake_grid(spacing_km=args.spacing_km, bin_count=args.bin_count)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        json.dump(grid, handle, separators=(",", ":"))
        handle.write("\n")
    meta = grid["meta"]
    n = len(grid["features"])
    print(
        f"wrote {out}  hexes={n}  stages={len(meta['stages'])}  "
        f"total_km3={meta['total_volume_m3'] / 1e9:.4g}"
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mars_ocean")
    sub = parser.add_subparsers(dest="cmd", required=True)

    fake = sub.add_parser("fake", help="Write a DEM-free hex-grid.json")
    fake.add_argument("--spacing-km", type=float, default=150.0)
    fake.add_argument("--bin-count", type=int, default=BIN_COUNT)
    fake.add_argument("--out", type=str, default="../web/public/grid/hex-grid.json")
    fake.set_defaults(func=_cmd_fake)

    args = parser.parse_args(argv)
    return args.func(args)

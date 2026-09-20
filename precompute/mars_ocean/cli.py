from __future__ import annotations

import argparse
import json
from pathlib import Path

from mars_ocean import BIN_COUNT
from mars_ocean.download import dem_path, download_dem
from mars_ocean.fake import build_fake_grid


def _write_grid(grid: dict, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as handle:
        json.dump(grid, handle, separators=(",", ":"))
        handle.write("\n")
    meta = grid["meta"]
    print(
        f"wrote {out}  curve={meta.get('curve')}  hexes={len(grid['features'])}  "
        f"stages={len(meta['stages'])}  total_km3={meta['total_volume_m3'] / 1e9:.4g}"
    )


def _cmd_fake(args: argparse.Namespace) -> int:
    grid = build_fake_grid(spacing_km=args.spacing_km, bin_count=args.bin_count)
    _write_grid(grid, Path(args.out))
    return 0


def _cmd_download(args: argparse.Namespace) -> int:
    dest = Path(args.out) if args.out else dem_path()
    download_dem(dest)
    return 0


def _cmd_mola(args: argparse.Namespace) -> int:
    from mars_ocean.mola import build_mola_grid

    dem = Path(args.dem) if args.dem else dem_path()
    if not dem.exists():
        raise SystemExit(f"DEM not found: {dem}\nRun: python -m mars_ocean download")
    grid = build_mola_grid(dem, spacing_km=args.spacing_km, bin_count=args.bin_count)
    _write_grid(grid, Path(args.out))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mars_ocean")
    sub = parser.add_subparsers(dest="cmd", required=True)

    fake = sub.add_parser("fake", help="Write a DEM-free hex-grid.json")
    fake.add_argument("--spacing-km", type=float, default=150.0)
    fake.add_argument("--bin-count", type=int, default=BIN_COUNT)
    fake.add_argument("--out", type=str, default="../web/public/grid/hex-grid.json")
    fake.set_defaults(func=_cmd_fake)

    dl = sub.add_parser("download", help="Fetch the 463 m MOLA GeoTIFF")
    dl.add_argument("--out", type=str, default="")
    dl.set_defaults(func=_cmd_download)

    mola = sub.add_parser("mola", help="Build hex-grid.json from MOLA")
    mola.add_argument("--spacing-km", type=float, default=150.0)
    mola.add_argument("--bin-count", type=int, default=BIN_COUNT)
    mola.add_argument("--dem", type=str, default="")
    mola.add_argument("--out", type=str, default="../web/public/grid/hex-grid.json")
    mola.set_defaults(func=_cmd_mola)

    args = parser.parse_args(argv)
    return args.func(args)

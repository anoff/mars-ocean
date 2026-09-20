"""Fetch the USGS MOLA 463 m GeoTIFF (gitignored)."""

from __future__ import annotations

import subprocess
from pathlib import Path

DEM_URL = "https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"
DEM_NAME = "Mars_MGS_MOLA_DEM_mosaic_global_463m.tif"


def raw_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "raw"


def dem_path() -> Path:
    return raw_dir() / DEM_NAME


def download_dem(dest: Path | None = None) -> Path:
    dest = dest or dem_path()
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1_000_000_000:
        print(f"already have {dest} ({dest.stat().st_size / 1e9:.2f} GB)")
        return dest
    print(f"downloading {DEM_URL}")
    print(f"        to {dest}")
    cmd = [
        "curl",
        "-L",
        "--fail",
        "--retry",
        "5",
        "-C",
        "-",
        "--progress-bar",
        "-o",
        str(dest),
        DEM_URL,
    ]
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        raise SystemExit(f"download failed (curl exit {result.returncode})")
    if not dest.exists() or dest.stat().st_size < 1_000_000_000:
        raise SystemExit(f"download looks incomplete: {dest}")
    print(f"downloaded {dest.stat().st_size / 1e9:.2f} GB")
    return dest

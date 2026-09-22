"""Real hypsometric volume curves from the MOLA 463 m DEM."""

from __future__ import annotations

import math
import time
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from mars_ocean import BIN_COUNT, RADIUS_M, Z_GLOBAL_MAX
from mars_ocean.graph import pack_graph
from mars_ocean.hexgrid import iter_hex_centers
from mars_ocean.voronoi import voronoi_partition
from mars_ocean.volume import make_stages

# Headroom below Hellas so volumes[0] stays 0.
Z_GLOBAL_MIN_MOLA = -9000.0
CHECK_H = -3800.0
CHUNK = 65_536


def _xyz(lon_rad: np.ndarray, lat_rad: np.ndarray) -> np.ndarray:
    cos_lat = np.cos(lat_rad)
    return np.column_stack(
        (cos_lat * np.cos(lon_rad), cos_lat * np.sin(lon_rad), np.sin(lat_rad))
    )


def _accumulate_spills(
    ids2d: np.ndarray,
    z: np.ndarray,
    valid: np.ndarray,
    spill_lookup: dict[tuple[int, int], float],
) -> None:
    """Saddle between cells = min over adjacent pixel pairs of max(z_a, z_b)."""
    for dy, dx in ((0, 1), (1, 0)):
        a = ids2d[: ids2d.shape[0] - dy, : ids2d.shape[1] - dx]
        b = ids2d[dy:, dx:]
        za = z[: z.shape[0] - dy, : z.shape[1] - dx]
        zb = z[dy:, dx:]
        ok = valid[: valid.shape[0] - dy, : valid.shape[1] - dx] & valid[dy:, dx:] & (a != b)
        if not np.any(ok):
            continue
        aa = a[ok].astype(np.int64, copy=False)
        bb = b[ok].astype(np.int64, copy=False)
        saddle = np.maximum(za[ok], zb[ok])
        lo = np.minimum(aa, bb)
        hi = np.maximum(aa, bb)
        for i, j, s in zip(lo.tolist(), hi.tolist(), saddle.tolist()):
            key = (i, j)
            prev = spill_lookup.get(key)
            if prev is None or s < prev:
                spill_lookup[key] = s


def _pixel_area_m2(lat_rad: np.ndarray, dlon: float, dlat: float, radius_m: float) -> np.ndarray:
    half = abs(dlat) / 2.0
    return (radius_m**2) * abs(dlon) * (np.sin(lat_rad + half) - np.sin(lat_rad - half))


def build_mola_grid(
    dem_path: Path,
    spacing_km: float = 150.0,
    bin_count: int = BIN_COUNT,
) -> dict:
    import rasterio
    from rasterio.windows import Window

    spacing_m = spacing_km * 1000.0
    centers = iter_hex_centers(spacing_m)
    n_hex = len(centers)
    lon_c = np.radians(np.array([c[0] for c in centers], dtype=np.float64))
    lat_c = np.radians(np.array([c[1] for c in centers], dtype=np.float64))
    tree = cKDTree(_xyz(lon_c, lat_c))
    stages = np.array(make_stages(Z_GLOBAL_MIN_MOLA, Z_GLOBAL_MAX, bin_count), dtype=np.float64)
    volumes = np.zeros((n_hex, bin_count), dtype=np.float64)
    z_min = np.full(n_hex, np.inf)
    z_max = np.full(n_hex, -np.inf)
    area_sum = 0.0
    v_check = 0.0
    n_used = 0
    spill_lookup: dict[tuple[int, int], float] = {}

    with rasterio.open(dem_path) as src:
        if src.count != 1:
            raise SystemExit(f"expected 1 band, got {src.count}")
        transform = src.transform
        nodata = src.nodata
        width, height = src.width, src.height
        # Mosaic is equirectangular metres on the IAU sphere, not lon/lat degrees.
        dlon = abs(transform.a) / RADIUS_M
        dlat = abs(transform.e) / RADIUS_M
        print(
            f"DEM {width}x{height} nodata={nodata} "
            f"crs={src.crs} dtype={src.dtypes[0]}"
        )
        t0 = time.time()
        rows_done = 0
        strip = 256
        for row_off in range(0, height, strip):
            win_h = min(strip, height - row_off)
            window = Window(0, row_off, width, win_h)
            band = src.read(1, window=window, masked=False)
            rows = np.arange(row_off, row_off + win_h, dtype=np.float64)
            cols = np.arange(width, dtype=np.float64)
            xs = transform.c + transform.a * (cols + 0.5)
            ys = transform.f + transform.e * (rows + 0.5)
            lon = xs / RADIUS_M
            lat = ys / RADIUS_M
            lon_grid, lat_grid = np.meshgrid(lon, lat)
            z = band.astype(np.float64, copy=False)
            valid = np.isfinite(z)
            if nodata is not None:
                valid &= z != nodata
            valid &= np.abs(z) < 30_000
            if not np.any(valid):
                rows_done += window.height
                continue
            z_v = z[valid]
            lat_v = lat_grid[valid]
            lon_v = lon_grid[valid]
            area = _pixel_area_m2(lat_v, dlon, dlat, RADIUS_M)
            area_sum += float(area.sum())
            n_used += int(z_v.size)
            _, hex_ids = tree.query(_xyz(lon_v, lat_v), workers=-1)
            hex_ids = hex_ids.astype(np.int64, copy=False)
            np.minimum.at(z_min, hex_ids, z_v)
            np.maximum.at(z_max, hex_ids, z_v)
            ids2d = np.full(z.shape, -1, dtype=np.int32)
            ids2d[valid] = hex_ids
            _accumulate_spills(ids2d, z, valid, spill_lookup)
            v_check += float(np.maximum(0.0, CHECK_H - z_v).dot(area))
            for start in range(0, z_v.size, CHUNK):
                sl = slice(start, start + CHUNK)
                contrib = np.maximum(0.0, stages - z_v[sl, None]) * area[sl, None]
                np.add.at(volumes, hex_ids[sl], contrib)
            rows_done += win_h
            if rows_done % 2048 < win_h:
                pct = 100.0 * rows_done / height
                elapsed = time.time() - t0
                print(
                    f"  {pct:5.1f}%  rows {rows_done}/{height}  "
                    f"{elapsed:.0f}s  pixels={n_used:,}",
                    flush=True,
                )

    empty = ~np.isfinite(z_min)
    z_min[empty] = 0.0
    z_max[empty] = 0.0
    volumes[:, 0] = 0.0
    sphere = 4.0 * math.pi * RADIUS_M * RADIUS_M
    print(
        f"pixels used {n_used:,}  area ratio {area_sum / sphere:.4f}  "
        f"z {float(z_min.min()):.0f} … {float(z_max.max()):.0f}"
    )
    print(
        f"unbinned V({CHECK_H:.0f} m) = {v_check / 1e9:.4g} km³  "
        f"(target ~2e7 km³, ratio {v_check / 1e9 / 2e7:.2f})"
    )
    binned_check = float(np.interp(CHECK_H, stages, volumes.sum(axis=0)))
    print(f"binned   V({CHECK_H:.0f} m) = {binned_check / 1e9:.4g} km³")

    geoms, neighbors = voronoi_partition(centers)
    features = []
    total = 0.0
    for index, geom in enumerate(geoms):
        vols = volumes[index].tolist()
        vols[0] = 0.0
        total += vols[-1]
        features.append(
            {
                "type": "Feature",
                "id": f"h-{index}",
                "properties": {
                    "id": f"h-{index}",
                    "zMin": float(z_min[index]),
                    "zMax": float(z_max[index]),
                    "volumes": vols,
                },
                "geometry": geom,
            }
        )
    return {
        "type": "FeatureCollection",
        "meta": {
            "planet": "mars",
            "radius_m": RADIUS_M,
            "spacing_km": spacing_km,
            "curve": "mola",
            "volume_unit": "m3",
            "total_volume_m3": total,
            "z_global_min": Z_GLOBAL_MIN_MOLA,
            "z_global_max": Z_GLOBAL_MAX,
            "stages": stages.tolist(),
            "check_h_m": CHECK_H,
            "check_volume_m3": v_check,
        },
        "graph": pack_graph(neighbors, z_min.tolist(), z_max.tolist(), spill_lookup),
        "features": features,
    }

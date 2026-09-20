"""Fake west-fast / east-slow volume curves. No DEM."""

from __future__ import annotations

from mars_ocean import BIN_COUNT, RADIUS_M, Z_GLOBAL_MAX, Z_GLOBAL_MIN
from mars_ocean.hexgrid import hex_area_m2, iter_hex_centers
from mars_ocean.voronoi import voronoi_geometries
from mars_ocean.volume import east_volume, make_stages, west_volume

WEST_ZMIN = -7200.0
EAST_ZMIN = -1800.0


def build_fake_grid(spacing_km: float = 150.0, bin_count: int = BIN_COUNT) -> dict:
    spacing_m = spacing_km * 1000.0
    area = hex_area_m2(spacing_m)
    stages = make_stages(Z_GLOBAL_MIN, Z_GLOBAL_MAX, bin_count)
    centers = iter_hex_centers(spacing_m)
    geoms = voronoi_geometries(centers)
    features: list[dict] = []
    total = 0.0
    for index, ((lon, lat), geom) in enumerate(zip(centers, geoms, strict=True)):
        west = lon < 0.0
        z_min = WEST_ZMIN if west else EAST_ZMIN
        curve = west_volume if west else east_volume
        volumes = [curve(h, area, z_min, Z_GLOBAL_MAX) for h in stages]
        volumes[0] = 0.0
        total += volumes[-1]
        features.append(
            {
                "type": "Feature",
                "id": f"h-{index}",
                "properties": {
                    "id": f"h-{index}",
                    "zMin": z_min,
                    "zMax": z_min if west else Z_GLOBAL_MAX,
                    "fillRate": "fast" if west else "slow",
                    "volumes": volumes,
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
            "curve": "fake",
            "volume_unit": "m3",
            "total_volume_m3": total,
            "z_global_min": Z_GLOBAL_MIN,
            "z_global_max": Z_GLOBAL_MAX,
            "stages": stages,
        },
        "features": features,
    }

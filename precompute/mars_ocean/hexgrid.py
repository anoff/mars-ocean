"""Row-offset hex lattice on a sphere, clipped near the poles."""

from __future__ import annotations

import math

from mars_ocean import LAT_CLIP_DEG, RADIUS_M


def hex_area_m2(spacing_m: float) -> float:
    return (math.sqrt(3.0) / 2.0) * spacing_m * spacing_m


def _unwrap_ring(ring: list[list[float]]) -> list[list[float]]:
    out = [[ring[0][0], ring[0][1]]]
    for lon, lat in ring[1:]:
        prev = out[-1][0]
        while lon - prev > 180.0:
            lon -= 360.0
        while prev - lon > 180.0:
            lon += 360.0
        out.append([lon, lat])
    return out


def _interp_at_lon(a: list[float], b: list[float], lon: float) -> list[float]:
    da = b[0] - a[0]
    if da == 0.0:
        return [lon, a[1]]
    t = (lon - a[0]) / da
    return [lon, a[1] + t * (b[1] - a[1])]


def _clip_lon_window(ring: list[list[float]], lo: float, hi: float) -> list[list[float]] | None:
    if ring[0] != ring[-1]:
        ring = [*ring, ring[0]]
    out: list[list[float]] = []
    for i in range(len(ring) - 1):
        a, b = ring[i], ring[i + 1]
        a_in = lo <= a[0] <= hi
        b_in = lo <= b[0] <= hi
        if a_in and b_in:
            out.append([b[0], b[1]])
        elif a_in and not b_in:
            edge = hi if b[0] > hi else lo
            out.append(_interp_at_lon(a, b, edge))
        elif (not a_in) and b_in:
            edge = hi if a[0] > hi else lo
            out.append(_interp_at_lon(a, b, edge))
            out.append([b[0], b[1]])
    if len(out) < 3:
        return None
    if out[0] != out[-1]:
        out.append(out[0][:])
    return out


def split_antimeridian(ring: list[list[float]]) -> list[list[list[float]]]:
    unwrapped = _unwrap_ring(ring)
    lo = min(p[0] for p in unwrapped)
    hi = max(p[0] for p in unwrapped)
    if hi <= 180.0 and lo >= -180.0:
        closed = unwrapped if unwrapped[0] == unwrapped[-1] else [*unwrapped, unwrapped[0][:]]
        return [closed]
    rings: list[list[list[float]]] = []
    for shift in (-360.0, 0.0, 360.0):
        shifted = [[p[0] + shift, p[1]] for p in unwrapped]
        clipped = _clip_lon_window(shifted, -180.0, 180.0)
        if clipped:
            rings.append(clipped)
    return rings or [unwrapped]


def hex_ring(lat_deg: float, lon_deg: float, spacing_m: float, radius_m: float = RADIUS_M) -> list[list[float]]:
    """Closed pointy-top hex ring in lon/lat. Circumradius chosen so neighbour distance is spacing_m."""
    circum_m = spacing_m / math.sqrt(3.0)
    lat = math.radians(lat_deg)
    cos_lat = math.cos(lat)
    ring: list[list[float]] = []
    for k in range(6):
        ang = math.radians(30.0 + 60.0 * k)
        east = circum_m * math.cos(ang)
        north = circum_m * math.sin(ang)
        dlat = north / radius_m
        dlon = east / (radius_m * max(cos_lat, 1e-6))
        ring.append(
            [
                lon_deg + math.degrees(dlon),
                lat_deg + math.degrees(dlat),
            ]
        )
    ring.append(ring[0][:])
    return ring


def iter_hex_centers(
    spacing_m: float,
    radius_m: float = RADIUS_M,
    lat_clip_deg: float = LAT_CLIP_DEG,
) -> list[tuple[float, float]]:
    """Return (lon_deg, lat_deg) centres on a row-offset lattice."""
    dy = spacing_m * math.sqrt(3.0) / 2.0
    dlat = dy / radius_m
    lat_max = math.radians(lat_clip_deg)
    n_half = int(lat_max / dlat)
    centers: list[tuple[float, float]] = []
    for i in range(-n_half, n_half + 1):
        lat = i * dlat
        cos_lat = math.cos(lat)
        if cos_lat <= 1e-3:
            continue
        n_cols = max(1, round(2.0 * math.pi * radius_m * cos_lat / spacing_m))
        dlon = 2.0 * math.pi / n_cols
        offset = 0.5 * dlon if i % 2 else 0.0
        lat_deg = math.degrees(lat)
        for j in range(n_cols):
            lon = -math.pi + offset + j * dlon
            lon_deg = math.degrees(lon)
            if lon_deg >= 180.0:
                lon_deg -= 360.0
            if lon_deg < -180.0:
                lon_deg += 360.0
            centers.append((lon_deg, lat_deg))
    return centers


def geometry_for_center(lon_deg: float, lat_deg: float, spacing_m: float) -> dict:
    ring = hex_ring(lat_deg, lon_deg, spacing_m)
    parts = split_antimeridian(ring)
    if len(parts) == 1:
        return {"type": "Polygon", "coordinates": [parts[0]]}
    return {"type": "MultiPolygon", "coordinates": [[part] for part in parts]}

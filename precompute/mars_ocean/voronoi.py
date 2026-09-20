"""Spherical Voronoi cells for hex centres — a gap-free partition of the globe."""

from __future__ import annotations

import math

import numpy as np
from scipy.spatial import SphericalVoronoi

from mars_ocean.hexgrid import split_antimeridian

EDGE_STEPS = 4


def _lonlat_to_xyz(lon_deg: np.ndarray, lat_deg: np.ndarray) -> np.ndarray:
    lon = np.radians(lon_deg)
    lat = np.radians(lat_deg)
    cos_lat = np.cos(lat)
    return np.column_stack((cos_lat * np.cos(lon), cos_lat * np.sin(lon), np.sin(lat)))


def _xyz_to_lonlat(vec: np.ndarray) -> list[float]:
    n = np.linalg.norm(vec)
    x, y, z = vec / n
    return [math.degrees(math.atan2(y, x)), math.degrees(math.asin(float(np.clip(z, -1.0, 1.0))))]


def _slerp(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    dot = float(np.clip(np.dot(a, b), -1.0, 1.0))
    omega = math.acos(dot)
    if omega < 1e-12:
        return a
    so = math.sin(omega)
    return (math.sin((1.0 - t) * omega) / so) * a + (math.sin(t * omega) / so) * b


def _densify_cycle(verts: np.ndarray, steps: int = EDGE_STEPS) -> np.ndarray:
    out: list[np.ndarray] = []
    n = len(verts)
    for i in range(n):
        a = verts[i]
        b = verts[(i + 1) % n]
        out.append(a)
        for s in range(1, steps):
            out.append(_slerp(a, b, s / steps))
    return np.vstack(out)


def _parts_to_geometry(parts: list[list[list[float]]]) -> dict:
    if len(parts) == 1:
        return {"type": "Polygon", "coordinates": [parts[0]]}
    return {"type": "MultiPolygon", "coordinates": [[part] for part in parts]}


def _close_through_pole(ring: list[list[float]], pole_lat: float) -> list[list[float]]:
    """Insert the pole on the widest longitude gap so the cap fills in lon/lat."""
    if ring[0] != ring[-1]:
        ring = [*ring, ring[0][:]]
    best_i = 0
    best_d = -1.0
    for i in range(len(ring) - 1):
        d = abs(ring[i + 1][0] - ring[i][0])
        if d > best_d:
            best_d = d
            best_i = i
    a = ring[best_i]
    b = ring[best_i + 1]
    insert = [[a[0], pole_lat], [b[0], pole_lat]]
    return ring[: best_i + 1] + insert + ring[best_i + 1 :]


def voronoi_geometries(centers: list[tuple[float, float]]) -> list[dict]:
    """One spherical Voronoi polygon per centre. Covers the whole sphere, no gaps."""
    lon = np.array([c[0] for c in centers], dtype=np.float64)
    lat = np.array([c[1] for c in centers], dtype=np.float64)
    xyz = _lonlat_to_xyz(lon, lat)
    sv = SphericalVoronoi(xyz, radius=1.0, threshold=1e-8)
    sv.sort_vertices_of_regions()
    north_i = int(np.argmax(xyz[:, 2]))
    south_i = int(np.argmin(xyz[:, 2]))
    geoms: list[dict] = []
    for i, region in enumerate(sv.regions):
        verts = _densify_cycle(sv.vertices[np.array(region, dtype=int)])
        ring = [_xyz_to_lonlat(v) for v in verts]
        ring.append(ring[0][:])
        if i == north_i:
            ring = _close_through_pole(ring, 90.0)
        elif i == south_i:
            ring = _close_through_pole(ring, -90.0)
        geoms.append(_parts_to_geometry(split_antimeridian(ring)))
    return geoms

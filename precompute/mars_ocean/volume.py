"""Shared volume-curve helpers (fake now, MOLA later)."""

from __future__ import annotations


def make_stages(z_min: float, z_max: float, bin_count: int) -> list[float]:
    if bin_count < 2:
        raise ValueError("bin_count must be >= 2")
    if z_max <= z_min:
        raise ValueError("z_max must be > z_min")
    step = (z_max - z_min) / (bin_count - 1)
    return [z_min + i * step for i in range(bin_count)]


def lerp(x0: float, x1: float, y0: float, y1: float, x: float) -> float:
    if x1 == x0:
        return y0
    t = (x - x0) / (x1 - x0)
    return y0 + t * (y1 - y0)


def volume_at(h: float, stages: list[float], volumes: list[float]) -> float:
    if h <= stages[0]:
        return 0.0
    if h >= stages[-1]:
        return volumes[-1]
    lo = 0
    hi = len(stages) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if stages[mid] <= h:
            lo = mid
        else:
            hi = mid
    return lerp(stages[lo], stages[hi], volumes[lo], volumes[hi], h)


def invert_volume(target: float, stages: list[float], global_v: list[float]) -> float:
    """Least h such that V(h) >= target. Plateaus return the left edge."""
    if target <= 0.0:
        return stages[0]
    if target >= global_v[-1]:
        return stages[-1]
    lo = 0
    hi = len(global_v) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if global_v[mid] < target:
            lo = mid
        else:
            hi = mid
    if global_v[hi] == global_v[lo]:
        return stages[lo]
    return lerp(global_v[lo], global_v[hi], stages[lo], stages[hi], target)


def west_volume(h: float, area_m2: float, z_min: float, z_cap: float) -> float:
    """Flat pan: area fills immediately, then a water column."""
    if h <= z_min:
        return 0.0
    return area_m2 * (min(h, z_cap) - z_min)


def east_volume(h: float, area_m2: float, z_min: float, z_cap: float) -> float:
    """Slow fill: inundated area grows with depth (V ~ u^2)."""
    if h <= z_min:
        return 0.0
    span = z_cap - z_min
    if span <= 0.0:
        return 0.0
    u = (min(h, z_cap) - z_min) / span
    return area_m2 * span * u * u / 2.0

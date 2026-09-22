"""Neighbor / spill graph helpers."""

from __future__ import annotations


def approx_spill(zmin_i: float, zmax_i: float, zmin_j: float, zmax_j: float) -> float:
    """If one cell is entirely below the other's floor, spill is that floor (rim). Else higher floor."""
    if zmax_i < zmin_j:
        return zmin_j
    if zmax_j < zmin_i:
        return zmin_i
    return max(zmin_i, zmin_j)


def pack_graph(
    neighbors: list[list[int]],
    z_min: list[float] | None = None,
    z_max: list[float] | None = None,
    spill_lookup: dict[tuple[int, int], float] | None = None,
) -> dict:
    """Build JSON graph. Spill defaults to a rim estimate from zMin/zMax."""
    spills: list[list[float]] = []
    for i, nbs in enumerate(neighbors):
        row: list[float] = []
        for j in nbs:
            key = (i, j) if i < j else (j, i)
            s = None if spill_lookup is None else spill_lookup.get(key)
            if s is None and z_min is not None and z_max is not None:
                s = approx_spill(z_min[i], z_max[i], z_min[j], z_max[j])
            elif s is None and z_min is not None:
                s = max(z_min[i], z_min[j])
            if s is None:
                s = 0.0
            row.append(float(s))
        spills.append(row)
    return {"neighbors": neighbors, "spills": spills}

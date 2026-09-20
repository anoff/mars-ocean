import type { HexGrid } from "./ocean";

type Ring = number[][];

const EDGE_STEPS = 4;

function wrapLon(lon: number): number {
  let x = lon;
  while (x > 180) {
    x -= 360;
  }
  while (x < -180) {
    x += 360;
  }
  return x;
}

function unwrapDelta(lon: number, origin: number): number {
  let d = lon - origin;
  if (d > 180) {
    d -= 360;
  }
  if (d < -180) {
    d += 360;
  }
  return d;
}

function fitRing(ring: Ring): Ring {
  if (ring.length < 4) {
    return ring;
  }
  const out: Ring = [];
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i];
    const b = ring[i + 1];
    out.push(a);
    const dlon = unwrapDelta(b[0], a[0]);
    const dlat = b[1] - a[1];
    for (let s = 1; s < EDGE_STEPS; s += 1) {
      const t = s / EDGE_STEPS;
      out.push([wrapLon(a[0] + dlon * t), a[1] + dlat * t]);
    }
  }
  out.push(out[0]);
  return out;
}

function fitGeometry(geometry: HexGrid["features"][number]["geometry"]): HexGrid["features"][number]["geometry"] {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as Ring[];
    return { type: "Polygon", coordinates: rings.map(fitRing) };
  }
  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as Ring[][];
    return { type: "MultiPolygon", coordinates: polys.map((rings) => rings.map(fitRing)) };
  }
  return geometry;
}

/** Densify hex edges so fills follow the globe; do not inflate (that stripes latitude rows). */
export function fitHexGrid(grid: HexGrid): HexGrid {
  return {
    ...grid,
    features: grid.features.map((feature) => ({
      ...feature,
      geometry: fitGeometry(feature.geometry),
    })),
  };
}

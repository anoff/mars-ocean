export type GridMeta = {
  planet: string;
  radius_m: number;
  spacing_km: number;
  curve: string;
  volume_unit: string;
  total_volume_m3: number;
  z_global_min: number;
  z_global_max: number;
  stages: number[];
  check_h_m?: number;
  check_volume_m3?: number;
};

export type HexProperties = {
  id: string;
  zMin: number;
  zMax: number;
  fillRate?: "fast" | "slow";
  volumes: number[];
};

export type SpillGraphJson = {
  neighbors: number[][];
  spills: number[][];
};

export type HexGrid = {
  type: "FeatureCollection";
  meta: GridMeta;
  graph?: SpillGraphJson;
  features: Array<{
    type: "Feature";
    id: string;
    properties: HexProperties;
    geometry: { type: string; coordinates: unknown };
  }>;
};

export type OceanIndex = {
  meta: GridMeta;
  ids: string[];
  volumes: Float64Array;
  zMin: Float64Array;
  zMax: Float64Array;
  areaM2: number;
  globalV: Float64Array;
  graph: SpillGraphJson | null;
  idIndex: Map<string, number>;
  lon: Float64Array;
  lat: Float64Array;
};

function walkLonLat(coords: unknown, visit: (lon: number, lat: number) => void): void {
  if (!Array.isArray(coords) || coords.length === 0) {
    return;
  }
  if (typeof coords[0] === "number") {
    visit(coords[0], coords[1] as number);
    return;
  }
  for (const child of coords) {
    walkLonLat(child, visit);
  }
}

function featureCentroid(coordinates: unknown): [number, number] {
  let origin = 0;
  let slon = 0;
  let slat = 0;
  let n = 0;
  walkLonLat(coordinates, (lon, lat) => {
    if (n === 0) {
      origin = lon;
    }
    let d = lon - origin;
    if (d > 180) {
      d -= 360;
    }
    if (d < -180) {
      d += 360;
    }
    slon += d;
    slat += lat;
    n += 1;
  });
  if (n === 0) {
    return [0, 0];
  }
  let lon = origin + slon / n;
  while (lon > 180) {
    lon -= 360;
  }
  while (lon < -180) {
    lon += 360;
  }
  return [lon, slat / n];
}

export function nearestCell(ocean: OceanIndex, lon: number, lat: number): number {
  const cos = Math.cos((lat * Math.PI) / 180);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < ocean.lon.length; i += 1) {
    let dlon = ocean.lon[i] - lon;
    if (dlon > 180) {
      dlon -= 360;
    }
    if (dlon < -180) {
      dlon += 360;
    }
    const dlat = ocean.lat[i] - lat;
    const d = dlon * dlon * cos * cos + dlat * dlat;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function hexAreaM2(spacingKm: number): number {
  const d = spacingKm * 1000;
  return (Math.sqrt(3) / 2) * d * d;
}

export function indexGrid(grid: HexGrid): OceanIndex {
  const bins = grid.meta.stages.length;
  const n = grid.features.length;
  const volumes = new Float64Array(n * bins);
  const ids = new Array<string>(n);
  const zMin = new Float64Array(n);
  const zMax = new Float64Array(n);
  const lon = new Float64Array(n);
  const lat = new Float64Array(n);
  const globalV = new Float64Array(bins);
  for (let i = 0; i < n; i += 1) {
    const props = grid.features[i].properties;
    ids[i] = props.id;
    zMin[i] = props.zMin;
    zMax[i] = props.zMax;
    const [clon, clat] = featureCentroid(grid.features[i].geometry.coordinates);
    lon[i] = clon;
    lat[i] = clat;
    const src = props.volumes;
    if (src.length !== bins) {
      throw new Error(`hex ${props.id} volumes length ${src.length} != ${bins}`);
    }
    const base = i * bins;
    for (let k = 0; k < bins; k += 1) {
      const v = src[k];
      volumes[base + k] = v;
      globalV[k] += v;
    }
  }
  return {
    meta: grid.meta,
    ids,
    volumes,
    zMin,
    zMax,
    areaM2: hexAreaM2(grid.meta.spacing_km),
    globalV,
    graph: grid.graph ?? null,
    idIndex: new Map(ids.map((id, i) => [id, i])),
    lon,
    lat,
  };
}

function lerp(x0: number, x1: number, y0: number, y1: number, x: number): number {
  if (x1 === x0) {
    return y0;
  }
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

export function volumeAtHeight(
  h: number,
  stages: number[],
  vols: ArrayLike<number>,
  base = 0,
): number {
  if (h <= stages[0]) {
    return 0;
  }
  const last = stages.length - 1;
  if (h >= stages[last]) {
    return vols[base + last];
  }
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (stages[mid] <= h) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lerp(stages[lo], stages[hi], vols[base + lo], vols[base + hi], h);
}

export function invertVolume(target: number, stages: number[], globalV: ArrayLike<number>): number {
  if (target <= 0) {
    return stages[0];
  }
  const last = globalV.length - 1;
  if (target >= globalV[last]) {
    return stages[last];
  }
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (globalV[mid] < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  if (globalV[hi] === globalV[lo]) {
    return stages[lo];
  }
  return lerp(globalV[lo], globalV[hi], stages[lo], stages[hi], target);
}

function areaFraction(
  volumes: Float64Array,
  base: number,
  stages: number[],
  h: number,
  areaM2: number,
): number {
  if (h <= stages[0] || areaM2 <= 0) {
    return 0;
  }
  const last = stages.length - 1;
  let lo = 0;
  let hi = last;
  if (h >= stages[last]) {
    lo = last - 1;
    hi = last;
  } else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (stages[mid] <= h) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
  }
  const dh = stages[hi] - stages[lo];
  if (dh === 0) {
    return 0;
  }
  const slope = (volumes[base + hi] - volumes[base + lo]) / dh;
  return Math.max(0, Math.min(1, slope / areaM2));
}

export type OceanPaint = {
  h: number;
  flooded: number;
};

export function evaluateOcean(ocean: OceanIndex, volumeM3: number): OceanPaint {
  const h = invertVolume(volumeM3, ocean.meta.stages, ocean.globalV);
  const bins = ocean.meta.stages.length;
  const n = ocean.ids.length;
  let flooded = 0;
  for (let i = 0; i < n; i += 1) {
    flooded += areaFraction(ocean.volumes, i * bins, ocean.meta.stages, h, ocean.areaM2);
  }
  return { h, flooded: n === 0 ? 0 : flooded / n };
}

export function formatKm3(m3: number): string {
  const km3 = m3 / 1e9;
  if (km3 >= 1e6) {
    return `${(km3 / 1e6).toFixed(2)} million km³`;
  }
  if (km3 >= 1000) {
    return `${(km3 / 1000).toFixed(1)} thousand km³`;
  }
  if (km3 >= 10) {
    return `${km3.toFixed(0)} km³`;
  }
  return `${km3.toFixed(2)} km³`;
}

export function formatHeight(h: number): string {
  const rounded = Math.round(h);
  return `${rounded} m`;
}

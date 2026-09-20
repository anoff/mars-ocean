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
};

export type HexProperties = {
  id: string;
  zMin: number;
  zMax: number;
  fillRate?: "fast" | "slow";
  volumes: number[];
};

export type HexGrid = {
  type: "FeatureCollection";
  meta: GridMeta;
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
  areaM2: number;
  globalV: Float64Array;
};

function hexAreaM2(spacingKm: number): number {
  const d = spacingKm * 1000;
  return (Math.sqrt(3) / 2) * d * d;
}

export function indexGrid(grid: HexGrid): OceanIndex {
  const bins = grid.meta.stages.length;
  const n = grid.features.length;
  const volumes = new Float64Array(n * bins);
  const ids = new Array<string>(n);
  const globalV = new Float64Array(bins);
  for (let i = 0; i < n; i += 1) {
    const props = grid.features[i].properties;
    ids[i] = props.id;
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
    areaM2: hexAreaM2(grid.meta.spacing_km),
    globalV,
  };
}

function lerp(x0: number, x1: number, y0: number, y1: number, x: number): number {
  if (x1 === x0) {
    return y0;
  }
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
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

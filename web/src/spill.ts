import { invertVolume, volumeAtHeight, type OceanIndex } from "./ocean";

export type SpillGraph = {
  neighbors: number[][];
  spills: number[][];
};

export type PourNetwork = {
  stages: number[];
  zMin: ArrayLike<number>;
  zMax: ArrayLike<number>;
  /** Packed [cell0_stage0, cell0_stage1, ..., cell1_stage0, ...] */
  volumes: ArrayLike<number>;
  neighbors: number[][];
  spills: number[][];
};

export type PourResult = {
  heights: Float64Array;
  flooded: number;
  h: number;
};

function binsOf(net: PourNetwork): number {
  return net.stages.length;
}

function nCells(net: PourNetwork): number {
  return Math.floor(net.volumes.length / binsOf(net));
}

function curveOf(net: PourNetwork, cells: Iterable<number>): Float64Array {
  const bins = binsOf(net);
  const curve = new Float64Array(bins);
  for (const i of cells) {
    const base = i * bins;
    for (let k = 0; k < bins; k += 1) {
      curve[k] += net.volumes[base + k];
    }
  }
  return curve;
}

function cellCurve(net: PourNetwork, i: number): Float64Array {
  const bins = binsOf(net);
  const out = new Float64Array(bins);
  const base = i * bins;
  for (let k = 0; k < bins; k += 1) {
    out[k] = net.volumes[base + k];
  }
  return out;
}

const HOLE_ZMAX_SLACK = 500;
const HOLE_ZMIN_SLACK = 50;

function brim(net: PourNetwork, lake: Iterable<number>): number {
  let z = -Infinity;
  for (const i of lake) {
    if (net.zMax[i] > z) {
      z = net.zMax[i];
    }
  }
  return z;
}

/** Cells of the same hole as `source` (similar floor/brim), not the rim or plains. */
function depression(net: PourNetwork, source: number, frozen: Set<number>): Set<number> {
  const zMaxS = net.zMax[source];
  const seen = new Set<number>([source]);
  const queue = [source];
  while (queue.length > 0) {
    const i = queue.pop() as number;
    for (const j of net.neighbors[i] ?? []) {
      if (seen.has(j) || frozen.has(j)) {
        continue;
      }
      if (net.zMin[j] <= zMaxS + HOLE_ZMIN_SLACK && net.zMax[j] <= zMaxS + HOLE_ZMAX_SLACK) {
        seen.add(j);
        queue.push(j);
      }
    }
  }
  return seen;
}

/** Source sits in a hole if its brim is below some neighbour's floor. */
function sourceIsHole(net: PourNetwork, source: number): boolean {
  const nbs = net.neighbors[source] ?? [];
  if (nbs.length === 0) {
    return false;
  }
  let maxNbMin = -Infinity;
  for (const j of nbs) {
    if (net.zMin[j] > maxNbMin) {
      maxNbMin = net.zMin[j];
    }
  }
  return net.zMax[source] < maxNbMin - 100;
}

function lowestSpill(
  net: PourNetwork,
  lake: Set<number>,
  blocked: Set<number>,
): { z: number; j: number } | null {
  let bestZ = Infinity;
  let bestJ = -1;
  for (const i of lake) {
    const nbs = net.neighbors[i] ?? [];
    const zs = net.spills[i] ?? [];
    for (let k = 0; k < nbs.length; k += 1) {
      const j = nbs[k];
      if (lake.has(j) || blocked.has(j)) {
        continue;
      }
      const z = zs[k];
      if (z < bestZ) {
        bestZ = z;
        bestJ = j;
      }
    }
  }
  if (bestJ < 0 || !Number.isFinite(bestZ)) {
    return null;
  }
  return { z: bestZ, j: bestJ };
}

function assign(heights: Float64Array, frozen: Set<number>, lake: Iterable<number>, h: number): void {
  for (const i of lake) {
    heights[i] = h;
    frozen.add(i);
  }
}

/**
 * Pour volume into `source`.
 *
 * Closed holes (Argyre): fill every cell of the hole together, then freeze
 * them full at the rim and start a new lake downstream.
 * Open plains: merge neighbours into one waterline (like planet mode).
 */
export function pour(net: PourNetwork, source: number, volume: number): Float64Array {
  const n = nCells(net);
  const stages = net.stages;
  const heights = new Float64Array(n);
  heights.fill(Number.NaN);
  if (volume <= 0 || source < 0 || source >= n) {
    return heights;
  }

  const frozen = new Set<number>();

  const fill = (start: number, vol: number): void => {
    if (vol <= 0 || frozen.has(start)) {
      return;
    }
    if (sourceIsHole(net, start)) {
      const hole = depression(net, start, frozen);
      const spill = lowestSpill(net, hole, frozen);
      const curve = curveOf(net, hole);
      if (!spill) {
        assign(heights, frozen, hole, invertVolume(vol, stages, curve));
        return;
      }
      const vSpill = volumeAtHeight(spill.z, stages, curve);
      if (vol <= vSpill) {
        assign(heights, frozen, hole, Math.min(invertVolume(vol, stages, curve), spill.z));
        return;
      }
      assign(heights, frozen, hole, Math.max(spill.z, brim(net, hole)));
      fill(spill.j, vol - vSpill);
      return;
    }
    const lake = new Set<number>([start]);
    for (;;) {
      const spill = lowestSpill(net, lake, frozen);
      const curve = curveOf(net, lake);
      if (!spill) {
        assign(heights, frozen, lake, invertVolume(vol, stages, curve));
        return;
      }
      const vSpill = volumeAtHeight(spill.z, stages, curve);
      if (vol <= vSpill) {
        assign(heights, frozen, lake, Math.min(invertVolume(vol, stages, curve), spill.z));
        return;
      }
      lake.add(spill.j);
    }
  };

  fill(source, volume);
  return heights;
}

export function pourFromSource(ocean: OceanIndex, source: number, targetV: number): PourResult {
  const stages = ocean.meta.stages;
  const heights = ocean.graph
    ? pour(
        {
          stages,
          zMin: ocean.zMin,
          zMax: ocean.zMax,
          volumes: ocean.volumes,
          neighbors: ocean.graph.neighbors,
          spills: ocean.graph.spills,
        },
        source,
        targetV,
      )
    : new Float64Array(ocean.ids.length).fill(Number.NaN);

  let flooded = 0;
  for (let i = 0; i < heights.length; i += 1) {
    if (Number.isFinite(heights[i]) && heights[i] > ocean.zMin[i]) {
      flooded += 1;
    }
  }
  const sourceH = Number.isFinite(heights[source]) ? heights[source] : stages[0];
  return { heights, flooded: heights.length === 0 ? 0 : flooded / heights.length, h: sourceH };
}

export function firstSpillVolume(ocean: OceanIndex, source: number): number {
  const graph = ocean.graph;
  if (!graph) {
    return ocean.globalV[ocean.globalV.length - 1];
  }
  const net: PourNetwork = {
    stages: ocean.meta.stages,
    zMin: ocean.zMin,
    zMax: ocean.zMax,
    volumes: ocean.volumes,
    neighbors: graph.neighbors,
    spills: graph.spills,
  };
  const spill = lowestSpill(net, new Set([source]), new Set());
  const curve = cellCurve(net, source);
  if (!spill) {
    return curve[curve.length - 1];
  }
  return Math.max(volumeAtHeight(spill.z, ocean.meta.stages, curve), 1);
}

export function approxSpill(zMinA: number, zMaxA: number, zMinB: number, zMaxB: number): number {
  if (zMaxA < zMinB) {
    return zMinB;
  }
  if (zMaxB < zMinA) {
    return zMinA;
  }
  return Math.max(zMinA, zMinB);
}

/** Neighbours = centres within ~2 grid spacings. */
export function graphFromOcean(ocean: OceanIndex): SpillGraph {
  const n = ocean.lon.length;
  const cosMax = Math.cos((1.9 * ocean.meta.spacing_km * 1000) / ocean.meta.radius_m);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const z = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const lon = (ocean.lon[i] * Math.PI) / 180;
    const lat = (ocean.lat[i] * Math.PI) / 180;
    const cl = Math.cos(lat);
    x[i] = cl * Math.cos(lon);
    y[i] = cl * Math.sin(lon);
    z[i] = Math.sin(lat);
  }
  const sets = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (x[i] * x[j] + y[i] * y[j] + z[i] * z[j] >= cosMax) {
        sets[i].add(j);
        sets[j].add(i);
      }
    }
  }
  const neighbors = sets.map((s) => [...s].sort((a, b) => a - b));
  const spills = neighbors.map((nbs, i) =>
    nbs.map((j) => approxSpill(ocean.zMin[i], ocean.zMax[i], ocean.zMin[j], ocean.zMax[j])),
  );
  return { neighbors, spills };
}

/** Test helper: column buckets V = area * max(0, h - zMin). */
export function bucketNetwork(
  stages: number[],
  cells: Array<{ zMin: number; zMax: number; area: number }>,
  edges: Array<{ a: number; b: number; spill?: number }>,
): PourNetwork {
  const n = cells.length;
  const bins = stages.length;
  const volumes = new Float64Array(n * bins);
  const zMin = new Float64Array(n);
  const zMax = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    zMin[i] = cells[i].zMin;
    zMax[i] = cells[i].zMax;
    const base = i * bins;
    for (let k = 0; k < bins; k += 1) {
      const h = stages[k];
      volumes[base + k] = h <= cells[i].zMin ? 0 : cells[i].area * (h - cells[i].zMin);
    }
  }
  const neighbors: number[][] = Array.from({ length: n }, () => []);
  const spills: number[][] = Array.from({ length: n }, () => []);
  for (const e of edges) {
    const z =
      e.spill ?? approxSpill(cells[e.a].zMin, cells[e.a].zMax, cells[e.b].zMin, cells[e.b].zMax);
    neighbors[e.a].push(e.b);
    neighbors[e.b].push(e.a);
    spills[e.a].push(z);
    spills[e.b].push(z);
  }
  return { stages, zMin, zMax, volumes, neighbors, spills };
}

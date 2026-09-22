import { describe, expect, it } from "vitest";
import { invertVolume, volumeAtHeight } from "./ocean";
import { approxSpill, bucketNetwork, pour } from "./spill";

const STAGES = [-40, -30, -20, -10, 0, 10];

function wet(heights: Float64Array, zMin: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < heights.length; i += 1) {
    if (Number.isFinite(heights[i]) && heights[i] > zMin[i]) {
      out.push(i);
    }
  }
  return out;
}

function h(heights: Float64Array, i: number): number {
  return heights[i];
}

describe("approxSpill", () => {
  it("uses the neighbour floor when a cell is an entire hole below it", () => {
    expect(approxSpill(-30, -20, -5, 5)).toBe(-5);
    expect(approxSpill(-5, 5, -30, -20)).toBe(-5);
  });

  it("uses the higher floor when elevation ranges overlap (open plains)", () => {
    expect(approxSpill(-20, 0, -15, 5)).toBe(-15);
  });
});

describe("pour: single cell", () => {
  const net = bucketNetwork(STAGES, [{ zMin: -20, zMax: -10, area: 2 }], []);

  it("stays dry at zero volume", () => {
    const heights = pour(net, 0, 0);
    expect(Number.isFinite(heights[0])).toBe(false);
  });

  it("fills to h = zMin + V/area", () => {
    const heights = pour(net, 0, 20);
    expect(h(heights, 0)).toBeCloseTo(-10);
  });

  it("keeps adding a water column above zMax", () => {
    const heights = pour(net, 0, 60);
    expect(h(heights, 0)).toBeCloseTo(10);
  });
});

describe("pour: two overlapping plains cells (one sea)", () => {
  const net = bucketNetwork(
    STAGES,
    [
      { zMin: -20, zMax: 0, area: 1 },
      { zMin: -15, zMax: 5, area: 1 },
    ],
    [{ a: 0, b: 1 }],
  );

  it("fills only the source at small volume", () => {
    const heights = pour(net, 0, 2);
    expect(wet(heights, net.zMin)).toEqual([0]);
    expect(h(heights, 0)).toBeGreaterThan(-20);
    expect(h(heights, 0)).toBeLessThan(-15);
  });

  it("merges into one waterline once the saddle is overtopped", () => {
    const heights = pour(net, 0, 25);
    expect(wet(heights, net.zMin)).toEqual([0, 1]);
    expect(h(heights, 0)).toBeCloseTo(h(heights, 1));
    expect(h(heights, 0)).toBeGreaterThan(-15);
  });

  it("matches global invert on the combined curve when both are wet", () => {
    const volume = 30;
    const heights = pour(net, 0, volume);
    const combined = new Float64Array(STAGES.length);
    for (let k = 0; k < STAGES.length; k += 1) {
      combined[k] = net.volumes[k] + net.volumes[STAGES.length + k];
    }
    const globalH = invertVolume(volume, STAGES, combined);
    expect(h(heights, 0)).toBeCloseTo(globalH);
    expect(h(heights, 1)).toBeCloseTo(globalH);
  });
});

describe("pour: Argyre-like pit then plains", () => {
  const net = bucketNetwork(
    STAGES,
    [
      { zMin: -40, zMax: -30, area: 1 },
      { zMin: -10, zMax: 0, area: 4 },
      { zMin: -10, zMax: 5, area: 4 },
    ],
    [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
    ],
  );

  it("fills only the pit at small volume", () => {
    const heights = pour(net, 0, 5);
    expect(h(heights, 0)).toBeCloseTo(-35);
    expect(wet(heights, net.zMin)).toEqual([0]);
  });

  it("keeps the pit full (at least brim) after overflow", () => {
    const heights = pour(net, 0, 50);
    expect(h(heights, 0)).toBeGreaterThanOrEqual(-30);
    expect(wet(heights, net.zMin).includes(0)).toBe(true);
    expect(wet(heights, net.zMin).includes(1)).toBe(true);
  });

  it("does not empty the pit when the plains take most of the volume", () => {
    const heights = pour(net, 0, 80);
    expect(h(heights, 0)).toBeGreaterThanOrEqual(-30);
    expect(h(heights, 1)).toBeCloseTo(h(heights, 2));
    expect(h(heights, 1)).toBeGreaterThan(-10);
  });

  it("plains share one waterline (a sea, not one cell at a time)", () => {
    const heights = pour(net, 0, 80);
    expect(h(heights, 1)).toBeCloseTo(h(heights, 2));
  });
});

describe("pour: disconnected cell stays dry", () => {
  const net = bucketNetwork(
    STAGES,
    [
      { zMin: -20, zMax: 0, area: 1 },
      { zMin: -20, zMax: 0, area: 1 },
    ],
    [],
  );

  it("does not wet the other cell", () => {
    const heights = pour(net, 0, 40);
    expect(Number.isFinite(heights[0])).toBe(true);
    expect(Number.isFinite(heights[1])).toBe(false);
  });
});

describe("pour: pit with a slope cell that spans the rim", () => {
  const net = bucketNetwork(
    STAGES,
    [
      { zMin: -40, zMax: -30, area: 1 },
      { zMin: -35, zMax: 900, area: 1 },
      { zMin: -10, zMax: 10, area: 20 },
    ],
    [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
    ],
  );

  it("does not drain the pit after spillover into a large sea", () => {
    const before = pour(net, 0, 8);
    const after = pour(net, 0, 80);
    expect(h(after, 0)).toBeGreaterThanOrEqual(h(before, 0) - 1e-6);
    expect(h(after, 0)).toBeGreaterThanOrEqual(-30);
    expect(Number.isFinite(after[2])).toBe(true);
    expect(h(after, 2)).toBeGreaterThan(-10);
  });

  it("keeps the pit at brim when leftover is huge (1M-km³ analogue)", () => {
    const after = pour(net, 0, 400);
    expect(h(after, 0)).toBeGreaterThanOrEqual(-30);
    expect(h(after, 2)).toBeGreaterThan(h(after, 0) - 40);
  });
});

describe("pour: three-cell chain with explicit saddles", () => {
  const net = bucketNetwork(
    STAGES,
    [
      { zMin: -30, zMax: -20, area: 1 },
      { zMin: -5, zMax: 10, area: 2 },
      { zMin: -5, zMax: 10, area: 2 },
    ],
    [
      { a: 0, b: 1, spill: -5 },
      { a: 1, b: 2, spill: -5 },
    ],
  );

  it("fills cell 0 only below the rim", () => {
    const vRim = volumeAtHeight(-5, STAGES, net.volumes, 0);
    const heights = pour(net, 0, vRim * 0.5);
    expect(wet(heights, net.zMin)).toEqual([0]);
    expect(h(heights, 0)).toBeLessThan(-5);
  });

  it("after overtopping, 1 and 2 fill together while 0 stays at the rim", () => {
    const vRim = volumeAtHeight(-5, STAGES, net.volumes, 0);
    const heights = pour(net, 0, vRim + 20);
    expect(h(heights, 0)).toBeGreaterThanOrEqual(-20);
    expect(h(heights, 1)).toBeCloseTo(h(heights, 2));
    expect(wet(heights, net.zMin)).toEqual([0, 1, 2]);
  });
});

describe("pour: open plains match a global waterline", () => {
  const net = bucketNetwork(
    STAGES,
    [
      { zMin: -20, zMax: 10, area: 3 },
      { zMin: -18, zMax: 10, area: 3 },
      { zMin: -16, zMax: 10, area: 3 },
    ],
    [
      { a: 0, b: 1 },
      { a: 1, b: 2 },
    ],
  );

  it("at large volume every cell shares the global invert height", () => {
    const volume = 90;
    const heights = pour(net, 1, volume);
    const combined = new Float64Array(STAGES.length);
    for (let i = 0; i < 3; i += 1) {
      for (let k = 0; k < STAGES.length; k += 1) {
        combined[k] += net.volumes[i * STAGES.length + k];
      }
    }
    const globalH = invertVolume(volume, STAGES, combined);
    for (let i = 0; i < 3; i += 1) {
      expect(h(heights, i)).toBeCloseTo(globalH, 5);
    }
  });
});

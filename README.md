# Mars Ocean

Handover repo for **Grok Build**. This is not a finished product.

Goal: an interactive page that pours water onto Mars. A Python job precomputes an equal-area hex lookup grid. A React map loads that grid from its own `public/` folder and fills hexes from a volume slider.

Full contract, data sources, and stage checklist: [`IMPLEMENTATION.md`](./IMPLEMENTATION.md).

## What to build

```
web/                         # Vite + React + MapLibre
  public/grid/hex-grid.json  # lookup grid the map reads
  src/                       # map + volume slider
precompute/                  # Python CLI that writes hex-grid.json
```

## Run (stage 1)

```
cd web && npm install && npm run dev
```

Open the printed local URL. You should see Mars as a globe (OpenPlanetaryMap raster on a sphere, no terrain) with pan/zoom/rotate and attribution `NASA / MOLA / USGS / OpenPlanetaryMap`.

## Stages (do in order)

1. **Mars map only** — React app, OpenPlanetaryMap tiles, pan/zoom. No water.
2. **Fake hex grid** — Python writes `hex-grid.json`. West of lon 0 fills fast, east fills slow. No DEM download required.
3. **Wire the slider** — app loads `/grid/hex-grid.json`, slider is total volume, west floods first.
4. **Real curves** — same JSON schema, volumes from MOLA 463 m DEM. Slider code must not change.

## Done when

Dragging the slider fills Mars from the hex grid, and swapping fake JSON for MOLA JSON does not require web-app changes.

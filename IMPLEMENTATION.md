# Implementation plan (hand to Grok Build)

Build in the four stages below. Do not skip ahead and break the schema. Each stage must leave the previous stage runnable.

Planet constants:

- Mars mean radius `R = 3_396_190` m (IAU / MOLA mosaic)
- Heights are metres above the **areoid**
- Typical surface range about `-8200` m to `+21229` m (confirm from the GeoTIFF; do not hard-code extrema)

DEM (stage 4 only):

- USGS MOLA 463 m GeoTIFF (Int16, 46080×23040, simple cylindrical, 128 px/°, ~2 GB)  
  `https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif`
- Units are metres of elevation above the GMM-2B areoid, not planetary radii.
- Do **not** start from the HRSC 200 m blend (that file is ~11 GB).

Basemap tiles (stage 1):

```
https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-2/all/{z}/{x}/{y}.png
```

OpenPlanetaryMap projects Mars lon/lat into Web Mercator the same way Earth maps do (`lon -180..180`). Poles are clipped. That is acceptable for v1. Cap map zoom to what the named map actually serves (about `0…8`).

---

## Shared contract: `hex-grid.json`

Path the web app loads:

```
web/public/grid/hex-grid.json
```

Shape:

```json
{
  "type": "FeatureCollection",
  "meta": {
    "planet": "mars",
    "radius_m": 3396190,
    "spacing_km": 150,
    "curve": "fake",
    "volume_unit": "m3",
    "total_volume_m3": 123,
    "z_global_min": -8000,
    "z_global_max": 0,
    "stages": [-8000, -7875, 0]
  },
  "features": [
    {
      "type": "Feature",
      "id": "h-0",
      "properties": {
        "id": "h-0",
        "zMin": -7200,
        "zMax": -4100,
        "fillRate": "fast",
        "volumes": [0, 1200000000, 4500000000000]
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      }
    }
  ]
}
```

Rules:

- `meta.stages` is a **shared** global elevation ladder (m, areoid), strictly increasing. Default **64** bins from `z_global_min` to `z_global_max`.
- Every feature has `volumes.length === meta.stages.length`. `volumes[0] === 0` at `stages[0] === z_global_min`.
- `volumes[k]` is **cumulative** water stored in that hex when the global water surface is `stages[k]`, in m³: `Σ (stages[k] − z)+ A` over the hex’s pixels.
- Interpolate linearly between bins.
- There is **no lid at local terrain max**. After a hex is fully submerged, remaining bins keep growing with slope ≈ hex area. Property `zMax` is the highest terrain in the hex (for readouts), not the last stage.
- `z_global_max` is the ocean cap and the last stage. Default **`0` m areoid** so the slider stays in the ocean range. `total_volume_m3 === V(z_global_max)`. Filling to Olympus Mons would bury the interesting volume in the first 1% of a linear slider.
- `fillRate` is only for the fake stage (`fast` | `slow`). Stage 4 may omit it.
- Geometry is a closed hex ring in lon/lat, WGS84-style degrees, lon in `[-180, 180]`. Split rings that cross the antimeridian. Clip near `±85°` to match Web Mercator.
- Demo spacing is `150 km` (**~7.4k hexes**, not 1.2k). Expect ~8–20 MB GeoJSON. Production target is `25 km` (~270k hexes) as a later binary format, not GeoJSON.

Volume at a global water height `h` for one hex:

```
if h <= stages[0]: 0
if h >= stages[-1]: volumes[-1]
else: lerp between surrounding bins
```

Inundated **area** (for paint) is `dV/dh` — the slope of that curve — not `V / Vmax`.

Global volume:

```
V(h) = sum_i volume_i(h)
```

Pre-sum a global curve at `meta.stages` and invert that. The slider is in **total volume**, not height. Invert `V(h)` with binary search on `h`. If `V` is locally flat, take the **least** `h` such that `V(h) ≥ target`.

---

## Stage 1 — Mars rendering web app

Goal: a React app that shows Mars as a **globe**. No water yet, no 3D terrain.

Stack (do not swap without a reason):

- Vite + React + TypeScript
- MapLibre GL JS (`projection: { type: "globe" }`)
- OpenPlanetaryMap raster tiles painted on the sphere

Done when:

- `cd web && npm install && npm run dev` shows a Mars globe (OPM pixel map, black space)
- Pan / zoom / rotate works
- Attribution visible: `NASA / MOLA / USGS / OpenPlanetaryMap`

Do not add Cesium or MOLA terrain in this stage. Poles will smear: OPM tiles stop near ±85° and MapLibre stretches the last row to the pole.

---

## Stage 2 — Python fake hex grid

Goal: generate `hex-grid.json` without downloading a DEM.

Behaviour:

- Place hex **centres** on a row-offset lattice (east-west spacing scaled by `1/cos(lat)`), clip poles near `±85°`. Display rings may be imperfect.
- Volumes in later stages must **partition the planet**: assign each sample (fake area, or DEM pixel in stage 4) to exactly one cell (nearest centre). Do not treat overlapping `1/cos(lat)` rings as a volume geometry.
- Default spacing `150 km` for the committed demo asset (~7.4k cells).
- Split the planet on longitude `0` with **overlapping** elevation ranges so `V(h)` is not flat between west-full and east-start:
  - **west (`lon < 0`)**: `fillRate = "fast"`. Shallow low basin. Example `zMin = -7000`. Area fills immediately (bucket); small total capacity.
  - **east (`lon >= 0`)**: `fillRate = "slow"`. Higher plateau. Example `zMin = -2500`. Holds **most** of the volume.
  - Both curves continue to `z_global_max = 0`. Do not use a sealed west tank (`zMax = -3500`) plus an east 8× lid — that contradicts “mid-slider west is a sea.”
- 64 **shared** global stages on `meta`, not 32 local stages per hex.
- Fake volumes: treat each hex as a bucket with area `A = (√3/2) * d²` (centre-to-centre spacing `d`) and a linear depth fill above `zMin`, then a continuing column up to `z_global_max`.

CLI:

```
python -m mars_ocean fake --spacing-km 150 --out ../web/public/grid/hex-grid.json
```

Package lives under `precompute/` (`pyproject.toml`, `src/mars_ocean/`). Commit the 150 km fake JSON so the web app runs without Python.

Done when the written GeoJSON loads in geojson.io (features only; `meta` is a foreign member) and west/east properties differ.

---

## Stage 3 — Slider fills Mars

Goal: the web app loads the grid from `/grid/hex-grid.json` and a volume slider floods hexes.

UI:

- Range slider `0 … meta.total_volume_m3`
- Readout: volume (km³), inferred water height (m areoid), flooded **area** fraction
- Hex fill: `rgba` blue, opacity from inundated area fraction `clamp((dV/dh) / A_hex)` — not volume fraction
- Outline faint at low zoom, stronger when zoomed

Logic:

1. Load grid once.
2. Build per-hex interpolators and a **pre-summed global** `V[k]` at `meta.stages`.
3. On slider input, binary-search `h` on the global curve so `V(h)` matches the requested volume.
4. Set feature-state (throttled to animation frames, `promoteId`). Do not `setData` the whole collection on every input.

At mid slider the **western** hemisphere should be mostly blue and the **eastern** still mostly dry. That is how you know fake curves are wired.

Optional debug: a hidden height control that sets `h` directly and shows `V(h)`.

Done when dragging the slider visibly floods west first, then east.

---

## Stage 4 — Real volume lookup

Goal: same schema, real hypsometry from MOLA. The web slider code must not change.

Pipeline:

1. `python -m mars_ocean download` — fetch the 463 m GeoTIFF into `precompute/data/raw/` (gitignored). Do not load 2 GB as float64.
2. Assign **every DEM pixel to exactly one hex** (nearest centre, or rasterize a partition). Point-in-polygon on overlapping rings will double-count.
3. Stream the Int16 mosaic in windows (rasterio). Skip nodata; do not treat fill as elevation 0.
4. Compute pixel area on the sphere:

   `A(φ) = R² Δλ (sin(φ + Δφ/2) - sin(φ - Δφ/2))`

   Do not use a single equatorial m/px. Sanity-check `Σ A_pixel ≈ 4πR²` within a few percent.
5. Accumulate `volumes[k] = sum over pixels in hex with z < stages[k] of (stages[k] - z) * A_pixel` on the **shared** `meta.stages`. After local `zMax`, the column still grows.
6. Write the same GeoJSON (or a compact sibling format if the file exceeds ~20 MB).
7. Copy into `web/public/grid/hex-grid.json` only when replacing the committed fake default locally.
8. Set `meta.curve = "mola"`.

Start with `--spacing-km 150` even in stage 4. Only after the integral matches published ballparks (~`2e7 km³` near `-3800 m` areoid) drop spacing toward `25 km`.

Validate twice:

- Direct (unbinned) DEM integral at `h = -3800` m. If this is off, stop.
- Binned JSON + slider readout. The ±30% budget is for datum/area bugs, not also for 64-bin interpolation error.

Optional later, not this stage: neighbor graph + spill elevations for source-and-overflow filling. Stage 4 stays **global equipotential** (`z < h` everywhere) so the slider math does not change.

Done when replacing the fake file with the MOLA file still drives the same slider, and a readout at `h ≈ -3800 m` is within ~30% of `2×10⁷ km³` (Carr & Head 2003: Deuteronilus ~1.9×10⁷ km³ at −3792 m).

---

## Out of scope (do not do unless asked)

- Hydrodynamic flow, ice vs liquid, atmosphere
- Cesium globe / 3D terrain exaggeration
- 5 m CTX mosaic
- Hex counts above ~300k in GeoJSON
- Auth, backend, database
- H3 (acceptable later if neighbor ids are needed for spill)

## Suggested build order for an agent

Do **not** download the DEM or run the MOLA integral yourself. Leave that to Task (`task mola` / `./scripts/mola-grid.sh`).

1. Confirm `task dev` (or `./scripts/dev.sh`) shows the map.
2. Implement grid writers behind `task fake` and `task mola`. Do not execute `mola` unless the user runs it.
3. Leave the committed `hex-grid.json` as the **fake** default so first load stays DEM-free.
4. `task mola` is how a human replaces that file with real curves.

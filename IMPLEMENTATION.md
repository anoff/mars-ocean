# Implementation plan (hand to Grok Build)

Build in the four stages below. Do not skip ahead and break the schema. Each stage must leave the previous stage runnable.

Planet constants:

- Mars mean radius `R = 3_396_190` m (IAU / MOLA mosaic)
- Heights are metres above the **areoid**
- Typical surface range about `-8200` m to `+21229` m

DEM (stage 4 only):

- USGS MOLA 463 m GeoTIFF  
  `https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif`
- Optional sharper: USGS MOLA+HRSC 200 m blend  
  `https://planetarymaps.usgs.gov/mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif`

Basemap tiles (stage 1):

```
https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-2/all/{z}/{x}/{y}.png
```

OpenPlanetaryMap projects Mars lon/lat into Web Mercator the same way Earth maps do (`lon -180..180`). Poles are clipped. That is acceptable for v1.

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
    "bin_count": 32,
    "volume_unit": "m3",
    "total_volume_m3": 123,
    "z_global_min": -8000,
    "z_global_max": 2000
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
        "stages": [-7200, -7100],
        "volumes": [0, 1200000000]
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

- `stages[k]` is water-surface elevation (m, areoid), strictly increasing.
- `volumes[k]` is **cumulative** water stored in that hex when the local water surface is `stages[k]`, in m³. `volumes[0] === 0`.
- Interpolate linearly between bins.
- `fillRate` is only for the fake stage (`fast` | `slow`). Stage 4 may omit it.
- Geometry is a closed hex ring in lon/lat, WGS84-style degrees, lon in `[-180, 180]`.
- Demo spacing is `150 km` (~1.2k hexes) so the JSON stays small. Production target is `25 km` (~270k hexes) as a later binary format, not GeoJSON.

Volume at a global water height `h` for one hex:

```
if h <= zMin: 0
if h >= zMax: volumes[-1]
else: lerp between surrounding bins
```

Global volume:

```
V(h) = sum_i volume_i(h)
```

The slider is in **total volume**, not height. Invert `V(h)` with binary search on `h`.

---

## Stage 1 — Mars rendering web app

Goal: a React app that shows Mars. No water yet.

Stack (do not swap without a reason):

- Vite + React + TypeScript
- MapLibre GL JS
- OpenPlanetaryMap raster tiles

Done when:

- `cd web && npm install && npm run dev` shows a Mars basemap
- Pan / zoom works
- Attribution visible: `NASA / MOLA / USGS / OpenPlanetaryMap`

Do not add Cesium in this stage.

---

## Stage 2 — Python fake hex grid

Goal: generate `hex-grid.json` without downloading a DEM.

Behaviour:

- Build an equal-ish hex tessellation on the sphere (row offset hex grid; scale east-west spacing by `1/cos(lat)`).
- Default spacing `150 km` for the committed demo asset.
- Split the planet on longitude `0`:
  - **west (`lon < 0`)**: `fillRate = "fast"`. Low basin. Example `zMin = -7500`, `zMax = -3500`. Steep early curve so a little volume floods most of the hex.
  - **east (`lon >= 0`)**: `fillRate = "slow"`. High plateau. Example `zMin = -2500`, `zMax = 1500`. Needs much more volume before it paints.
- 32 elevation bins per hex.
- Fake volumes: treat each hex as a bucket with area `A = (√3/2) * d²` and a linear depth fill, then multiply east hexes by a large capacity factor (e.g. 8×) so they stay dry while the west is already a sea.

CLI:

```
python -m mars_ocean fake --spacing-km 150 --out ../web/public/grid/hex-grid.json
```

Done when the written GeoJSON loads in geojson.io and west/east properties differ.

---

## Stage 3 — Slider fills Mars

Goal: the web app loads the grid from `/grid/hex-grid.json` and a volume slider floods hexes.

UI:

- Range slider `0 … meta.total_volume_m3`
- Readout: volume (km³), inferred water height (m areoid), flooded fraction
- Hex fill: `rgba` blue, opacity from flooded fraction of that hex
- Outline faint at low zoom, stronger when zoomed

Logic:

1. Load grid once.
2. Build per-hex interpolators.
3. On slider input, binary-search `h` so `sum volume_i(h)` matches the requested volume.
4. Set a feature-state or rebuild a fill color expression.

At mid slider the **western** hemisphere should be mostly blue and the **eastern** still mostly dry. That is how you know fake curves are wired.

Done when dragging the slider visibly floods west first, then east.

---

## Stage 4 — Real volume lookup

Goal: same schema, real hypsometry from MOLA.

Pipeline:

1. `python -m mars_ocean download` — fetch the 463 m GeoTIFF into `precompute/data/raw/` (gitignored).
2. For each hex polygon, sample DEM pixels whose centres fall inside (or rasterize hex to mask).
3. Compute pixel area on the sphere:

   `A(φ) = R² Δλ (sin(φ + Δφ/2) - sin(φ - Δφ/2))`

   Do not use a single equatorial m/px.
4. Build 32 bins from that hex’s `zMin..zMax`.
5. `volumes[k] = sum over pixels with z < stages[k] of (stages[k] - z) * A_pixel`
6. Write the same GeoJSON (or a compact sibling format if the file exceeds ~20 MB).
7. Copy into `web/public/grid/hex-grid.json`.
8. Set `meta.curve = "mola"`.

Start with `--spacing-km 150` even in stage 4. Only after the integral matches published ballparks (~`2e7 km³` near `-3800 m` areoid) drop spacing toward `25 km`.

Optional later, not this stage: neighbor graph + spill elevations for source-and-overflow filling. Stage 4 stays **global equipotential** (`z < h` everywhere) so the slider math does not change.

Done when replacing the fake file with the MOLA file still drives the same slider, and a readout at `h ≈ -3800 m` is within ~30% of `2×10⁷ km³`.

---

## Out of scope (do not do unless asked)

- Hydrodynamic flow, ice vs liquid, atmosphere
- Cesium globe / 3D terrain exaggeration
- 5 m CTX mosaic
- Hex counts above ~300k in GeoJSON
- Auth, backend, database

## Suggested build order for an agent

1. Confirm stage 1 runs.
2. Do not restyle the map; generate / regenerate the fake grid and keep the slider.
3. Implement real MOLA curves behind `python -m mars_ocean mola`.
4. Leave `fake` as the default so first-load stays DEM-free.

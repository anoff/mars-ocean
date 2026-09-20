# Stack (canon)

## Web game

Vite + React + TypeScript + MapLibre + Zustand (or Valtio).

- `src/map/` — tiles, hex fill, region click
- `src/sim/` — headless tick, techs, win/lose. No React imports.
- `src/ui/` — tree, meters, events
- `public/grid/` — hex-grid.json + regions.geojson

Basemap default: OpenPlanetaryMap XYZ. Optional toggle: OPM shaded color MOLA.

No Unity, Unreal, Cesium, or Three.js in v1. Godot only if the map is allowed to become dumb art.

## Precompute

Python CLI in `precompute/` writes `web/public/grid/hex-grid.json`.
Schema: IMPLEMENTATION.md. Fake curves first; MOLA later. Demo spacing 150 km.

## Persist

localStorage for a run. No backend.

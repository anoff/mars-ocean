import { useCallback, useEffect, useRef, useState } from "react";
import {
  Map,
  NavigationControl,
  setMaxParallelImageRequests,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import Overlay from "./Overlay";
import { fitHexGrid } from "./hexDisplay";
import { evaluateOcean, indexGrid, invertVolume, type HexGrid, type OceanIndex } from "./ocean";

setWorkerUrl(workerUrl);
setMaxParallelImageRequests(32);

const OPM_TILES =
  "https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-2/all/{z}/{x}/{y}.png";

const ATTRIBUTION = "NASA / MOLA / USGS / OpenPlanetaryMap";
const HEX_SOURCE = "hex";
const MAP_DEBOUNCE_MS = 80;

function addHexLayers(map: Map, grid: HexGrid) {
  if (map.getSource(HEX_SOURCE)) {
    return;
  }
  map.addSource(HEX_SOURCE, {
    type: "geojson",
    data: fitHexGrid(grid) as unknown as FeatureCollection,
    promoteId: "id",
    maxzoom: 0,
    tolerance: 0,
  });
  map.addLayer({
    id: "hex-fill",
    type: "fill",
    source: HEX_SOURCE,
    paint: {
      "fill-antialias": true,
      "fill-color": "#4db2ff",
      "fill-opacity": [
        "case",
        ["<=", ["global-state", "waterH"], ["get", "zMin"]],
        0,
        [
          "case",
          ["==", ["get", "fillRate"], "fast"],
          0.7,
          [
            "*",
            0.7,
            [
              "min",
              1,
              [
                "max",
                0,
                [
                  "/",
                  ["-", ["global-state", "waterH"], ["get", "zMin"]],
                  ["max", 1, ["-", ["get", "zMax"], ["get", "zMin"]]],
                ],
              ],
            ],
          ],
        ],
      ],
    },
  });
  map.addLayer({
    id: "hex-line",
    type: "line",
    source: HEX_SOURCE,
    minzoom: 3,
    paint: {
      "line-color": "rgba(210, 230, 255, 0.85)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 6, 0.9],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.22, 6, 0.5],
    },
  });
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const oceanRef = useRef<OceanIndex | null>(null);
  const pendingRef = useRef(0);
  const debounceRef = useRef<number>(0);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalM3, setTotalM3] = useState(0);
  const [volumeM3, setVolumeM3] = useState(0);
  const [heightM, setHeightM] = useState(-8000);
  const [flooded, setFlooded] = useState(0);

  const paintMap = useCallback((volume: number) => {
    const map = mapRef.current;
    const ocean = oceanRef.current;
    if (!map || !ocean || !map.getSource(HEX_SOURCE)) {
      return;
    }
    const result = evaluateOcean(ocean, volume);
    map.setGlobalStateProperty("waterH", result.h);
    setHeightM(result.h);
    setFlooded(result.flooded);
  }, []);

  const onVolume = useCallback(
    (volume: number) => {
      pendingRef.current = volume;
      setVolumeM3(volume);
      const ocean = oceanRef.current;
      if (ocean) {
        setHeightM(invertVolume(volume, ocean.meta.stages, ocean.globalV));
      }
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = 0;
        paintMap(pendingRef.current);
      }, MAP_DEBOUNCE_MS);
    },
    [paintMap],
  );

  const onCommit = useCallback(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = 0;
    paintMap(pendingRef.current);
  }, [paintMap]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) {
      return;
    }

    const map = new Map({
      container,
      style: {
        version: 8,
        name: "Mars",
        state: { waterH: { default: -8000 } },
        projection: { type: "globe" },
        sky: {
          "sky-color": "#000000",
          "horizon-color": "#000000",
          "atmosphere-blend": 0,
        },
        sources: {
          "opm-lo": {
            type: "raster",
            tiles: [OPM_TILES],
            tileSize: 256,
            attribution: ATTRIBUTION,
            maxzoom: 2,
          },
          "opm-hi": {
            type: "raster",
            tiles: [OPM_TILES],
            tileSize: 256,
            attribution: ATTRIBUTION,
            minzoom: 3,
            maxzoom: 7,
          },
        },
        layers: [
          {
            id: "opm-lo",
            type: "raster",
            source: "opm-lo",
            maxzoom: 3,
            paint: { "raster-fade-duration": 0 },
          },
          {
            id: "opm-hi",
            type: "raster",
            source: "opm-hi",
            minzoom: 3,
            paint: { "raster-fade-duration": 0 },
          },
        ],
      },
      center: [0, 10],
      zoom: 1.85,
      minZoom: 0,
      maxZoom: 8,
      maxPitch: 60,
      renderWorldCopies: false,
      attributionControl: { compact: false },
      canvasContextAttributes: { antialias: false },
      pixelRatio: 1,
      fadeDuration: 0,
      refreshExpiredTiles: false,
      maxTileCacheZoomLevels: 8,
      cancelPendingTileRequestsWhileZooming: true,
    });

    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    mapRef.current = map;

    const gridPromise: Promise<HexGrid> = fetch("/grid/hex-grid.json").then((response) => {
      if (!response.ok) {
        throw new Error(`grid HTTP ${response.status}`);
      }
      return response.json() as Promise<HexGrid>;
    });

    const onLoad = () => {
      void gridPromise
        .then((grid) => {
          addHexLayers(map, grid);
          const ocean = indexGrid(grid);
          oceanRef.current = ocean;
          const initial = ocean.meta.check_volume_m3 ?? 0;
          setTotalM3(ocean.meta.total_volume_m3);
          setVolumeM3(initial);
          if (initial > 0) {
            const result = evaluateOcean(ocean, initial);
            map.setGlobalStateProperty("waterH", result.h);
            setHeightM(result.h);
            setFlooded(result.flooded);
          } else {
            setHeightM(ocean.meta.z_global_min);
          }
          setReady(true);
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "failed to load hex grid");
        });
    };

    if (map.loaded()) {
      onLoad();
    } else {
      map.once("load", onLoad);
    }

    return () => {
      window.clearTimeout(debounceRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <>
      <div ref={containerRef} className="map" />
      <Overlay
        totalM3={totalM3}
        volumeM3={volumeM3}
        heightM={heightM}
        flooded={flooded}
        ready={ready}
        error={error}
        onVolume={onVolume}
        onCommit={onCommit}
      />
    </>
  );
}

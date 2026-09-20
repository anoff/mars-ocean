import { useEffect, useRef } from "react";
import {
  Map,
  NavigationControl,
  setMaxParallelImageRequests,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);
setMaxParallelImageRequests(32);

const OPM_TILES =
  "https://cartocdn-gusc.global.ssl.fastly.net/opmbuilder/api/v1/map/named/opm-mars-basemap-v0-2/all/{z}/{x}/{y}.png";

const ATTRIBUTION = "NASA / MOLA / USGS / OpenPlanetaryMap";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);

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

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="map" />;
}

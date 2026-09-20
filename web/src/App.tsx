import { useEffect, useRef } from "react";
import { Map, NavigationControl, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);

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
        sources: {
          opm: {
            type: "raster",
            tiles: [OPM_TILES],
            tileSize: 256,
            attribution: ATTRIBUTION,
            maxzoom: 9,
          },
        },
        layers: [
          {
            id: "opm",
            type: "raster",
            source: "opm",
            minzoom: 0,
          },
        ],
      },
      center: [0, 10],
      zoom: 2.2,
      minZoom: 0,
      maxZoom: 9,
      renderWorldCopies: true,
      attributionControl: { compact: false },
    });

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="map" />;
}

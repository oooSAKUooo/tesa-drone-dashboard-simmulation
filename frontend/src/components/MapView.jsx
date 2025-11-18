import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { MAPBOX_TOKEN } from "../config";

mapboxgl.accessToken = MAPBOX_TOKEN;

export default function MapView({ markers = [], trails = {}, centerZoom = false }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const INITIAL_CENTER = [101.1705, 14.292];
  const INITIAL_ZOOM = 14.3;

  useEffect(() => {
    if (!mapEl.current) return;

    const map = new mapboxgl.Map({
      container: mapEl.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      pitch: 0,
      bearing: 0,
    });

    mapRef.current = map;

    map.on("load", () => {
      setMapLoaded(true);

      // 🛰️ Marker Source
      map.addSource("drone-markers", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // วงกลม marker
      map.addLayer({
        id: "drone-circles",
        type: "circle",
        source: "drone-markers",
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.95,
        },
      });

      // ป้าย label
      map.addLayer({
        id: "drone-labels",
        type: "symbol",
        source: "drone-markers",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.8)",
          "text-halo-width": 1.5,
        },
      });

      // เส้น trail
      map.addSource("drone-trails", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "drone-trails-layer",
        type: "line",
        source: "drone-trails",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 3,
          "line-opacity": 0.8,
        },
      });
    });

    return () => map.remove();
  }, []);

  // 🎯 อัปเดตตำแหน่ง marker
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const src = map.getSource("drone-markers");
    if (!src) return;

    if (!map._prevPositions) map._prevPositions = {};
    const oldPos = map._prevPositions;
    const newPos = {};

    markers.forEach((m) => {
      const key = `${m.team}-${m.obj_id}`;
      newPos[key] = [m.lng, m.lat];
    });

    let frame = 0;
    const totalFrames = 60;
    function animate() {
      frame++;
      const t = frame / totalFrames;

      const features = markers.map((m) => {
        const key = `${m.team}-${m.obj_id}`;
        const start = oldPos[key] || [m.lng, m.lat];
        const target = newPos[key];
        const lng = start[0] + (target[0] - start[0]) * t;
        const lat = start[1] + (target[1] - start[1]) * t;
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: {
            label: m.obj_id,
            color: m.team === "offensive" ? "#ef4444" : "#3b82f6",
          },
        };
      });

      src.setData({ type: "FeatureCollection", features });
      if (frame < totalFrames) requestAnimationFrame(animate);
      else map._prevPositions = newPos;
    }

    animate();
  }, [markers, mapLoaded]);

  // 🧩 Trails
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const map = mapRef.current;
    const src = map.getSource("drone-trails");
    if (!src) return;

    const features = Object.entries(trails).map(([key, coords]) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords.slice(-30) },
      properties: {
        color: key.startsWith("offensive") ? "#ef4444" : "#3b82f6",
      },
    }));

    src.setData({ type: "FeatureCollection", features });
  }, [trails, mapLoaded]);

  // 🧭 ซูมเข้าใกล้ node (เมื่อเปิด centerZoom)
  useEffect(() => {
    if (!mapLoaded || !centerZoom || markers.length === 0) return;
    const map = mapRef.current;

    // หาค่าเฉลี่ยตำแหน่งทุก marker
    const avgLng = markers.reduce((s, m) => s + m.lng, 0) / markers.length;
    const avgLat = markers.reduce((s, m) => s + m.lat, 0) / markers.length;

    map.flyTo({
      center: [avgLng, avgLat],
      zoom: 16, // 🔍 ซูมเข้ากว่า default
      speed: 0.8,
      curve: 1.4,
      essential: true,
    });
  }, [centerZoom, markers, mapLoaded]);

  // 🔄 Reset
  const resetView = () => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      speed: 0.7,
      curve: 1.2,
      pitch: 0,
      bearing: 0,
    });
  };

  return (
    <div className="relative w-full h-[420px] rounded-2xl overflow-hidden border border-white/10">
      <div ref={mapEl} className="absolute inset-0" />
      <button
        onClick={resetView}
        className="absolute top-3 left-3 bg-white/90 hover:bg-white text-gray-900 font-medium rounded-lg px-3 py-1 text-sm shadow-md backdrop-blur-sm transition-all"
      >
        🔄 Reset View
      </button>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export default function RoutesMapPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/routes");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Veri çekilemedi");
        setData(json);
      } catch (e: any) {
        setError(e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const mapContainer = useMemo(() => {
    if (!data || !data.features?.length) return null;
    const div = document.createElement("div");
    div.className =
      "h-[calc(100vh-180px)] min-h-[720px] w-full rounded-3xl border border-black/10 shadow-lg";

    const map = new maplibregl.Map({
      container: div,
      style: "https://demotiles.maplibre.org/style.json",
      center: [25, 25],
      zoom: 1.3,
      attributionControl: false,
    });

    map.on("load", () => {
      map.addSource("routes", {
        type: "geojson",
        data,
      });
      map.addLayer({
        id: "route-lines",
        type: "line",
        source: "routes",
        paint: {
          "line-color": [
            "match",
            ["get", "status"],
            "Denizde", "#0ea5e9",
            "Varış", "#22c55e",
            "Gecikme", "#ef4444",
            "#8b5cf6",
          ],
          "line-width": 2,
          "line-opacity": 0.75,
        },
      });
      map.addLayer({
        id: "route-halo",
        type: "line",
        source: "routes",
        paint: {
          "line-color": "#000",
          "line-width": 4,
          "line-opacity": 0.05,
        },
      });

      // Ship markers (Point features)
      if (data.ships?.features?.length) {
        map.addSource("ships", {
          type: "geojson",
          data: data.ships,
        });
        map.addLayer({
          id: "ship-points",
          type: "circle",
          source: "ships",
          paint: {
            "circle-radius": 6,
            "circle-color": [
              "match",
              ["get", "status"],
              "Denizde",
              "#0ea5e9",
              "Varış",
              "#22c55e",
              "Gecikme",
              "#ef4444",
              "#8b5cf6",
            ],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-opacity": 0.9,
          },
        });
      }
    });

    return div;
  }, [data]);

  return (
    <section className="min-h-screen">
      {loading ? (
        <div className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black/60">Yükleniyor...</div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : !data?.features?.length ? (
        <div className="rounded-2xl border border-black/10 bg-[var(--sand)] px-4 py-3 text-sm text-black/70">Gösterilecek rota yok.</div>
      ) : (
        <div ref={(node) => { if (node && mapContainer) node.replaceWith(mapContainer); }} />
      )}
    </section>
  );
}


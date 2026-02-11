import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const { data: shipments, error } = await supabase
    .from("shipments")
    .select(
      "id, file_no, status, origin_port:origin_port_id(lat, lon, name), destination_port:destination_port_id(lat, lon, name), eta_current, etd_planned"
    )
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const WP = {
    MALACCA: [103.8, 1.26] as [number, number],
    CAPE: [18.47, -34.36] as [number, number],
    SENEGAL: [-17.5, 14.7] as [number, number],
    CANARY: [-16.0, 28.0] as [number, number],
    GIB: [-5.35, 36.14] as [number, number],
  };

  const features: any[] = [];
  const shipPoints: any[] = [];

  const pickWaypoints = (): [number, number][] => {
    return [WP.MALACCA, WP.CAPE, WP.SENEGAL, WP.CANARY, WP.GIB];
  };

  (shipments ?? []).forEach((s) => {
    const o = Array.isArray((s as any).origin_port)
      ? (s as any).origin_port[0]
      : (s as any).origin_port;
    const d = Array.isArray((s as any).destination_port)
      ? (s as any).destination_port[0]
      : (s as any).destination_port;
    if (!o?.lat || !o?.lon || !d?.lat || !d?.lon) return;

    const coords: [number, number][] = [
      [Number(o.lon), Number(o.lat)],
      ...pickWaypoints(),
      [Number(d.lon), Number(d.lat)],
    ];

    features.push({
      type: "Feature",
      properties: {
        id: s.id,
        file_no: s.file_no,
        status: s.status,
        origin: o.name,
        destination: d.name,
        route: "sea-template",
      },
      geometry: {
        type: "LineString",
        coordinates: coords,
      },
    });

    // Geminin ilerleme noktası (sabit 52 gün)
    const startDate = s.etd_planned ? new Date(s.etd_planned) : null;
    const transitDays = 52;
    if (startDate) {
      const today = new Date();
      const elapsedMs = today.getTime() - startDate.getTime();
      const progress = Math.min(1, Math.max(0, elapsedMs / (transitDays * 24 * 60 * 60 * 1000)));

      const totalSeg = coords.length - 1;
      if (totalSeg > 0) {
        const segProgress = progress * totalSeg;
        const segIndex = Math.min(totalSeg - 1, Math.floor(segProgress));
        const localT = segProgress - segIndex;
        const [x1, y1] = coords[segIndex];
        const [x2, y2] = coords[segIndex + 1];
        const point: [number, number] = [x1 + (x2 - x1) * localT, y1 + (y2 - y1) * localT];

        shipPoints.push({
          type: "Feature",
          properties: {
            id: s.id,
            file_no: s.file_no,
            progress,
            status: s.status,
          },
          geometry: { type: "Point", coordinates: point },
        });
      }
    }
  });

  return NextResponse.json({
    type: "FeatureCollection",
    features,
    ships: { type: "FeatureCollection", features: shipPoints },
  });
}

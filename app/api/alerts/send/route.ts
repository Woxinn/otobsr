import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AlertRow = {
  id: string;
  shipment_id: string | null;
  event_type: string;
  channel: string;
  payload: Record<string, unknown> | null;
};

// Basit stub sender: email/slack icin sadece status'u gunceller, gercek gonderim yok
async function sendStub(_alert: AlertRow) {
  // Buraya gercek email/slack gonderim entegrasyonu eklenecek.
  return { ok: true };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const { data: pendingAlerts, error } = await supabase
    .from("alerts")
    .select("id, shipment_id, event_type, channel, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  let sent = 0;

  for (const alert of pendingAlerts ?? []) {
    const result = await sendStub(alert as AlertRow);
    if (result.ok) {
      await supabase
        .from("alerts")
        .update({ status: "sent", sent_at: new Date().toISOString(), error_text: null })
        .eq("id", alert.id);
      sent += 1;
    } else {
      await supabase
        .from("alerts")
        .update({ status: "error", error_text: (result as any).error ?? "send failed" })
        .eq("id", alert.id);
    }
  }

  return NextResponse.json({ ok: true, processed: pendingAlerts?.length ?? 0, sent });
}

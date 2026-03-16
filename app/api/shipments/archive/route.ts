import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { id, archived } = await req.json().catch(() => ({}));
  if (!id) {
    return NextResponse.json({ error: "shipment id gerekli" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const update = {
    archived_at: archived ? new Date().toISOString() : null,
  };

  const { error } = await supabase.from("shipments").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

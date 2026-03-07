import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireBridgeAgent } from "@/lib/mssql-bridge-auth";

export async function POST(req: NextRequest) {
  try {
    requireBridgeAgent(req);
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const requestId = String(body?.requestId ?? "").trim();
  const status = String(body?.status ?? "").trim();

  if (!requestId || !["completed", "failed"].includes(status)) {
    return NextResponse.json({ error: "requestId ve gecerli status zorunlu" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("mssql_bridge_requests")
    .update({
      status,
      result: status === "completed" ? body?.result ?? null : null,
      error: status === "failed" ? String(body?.error ?? "Agent error") : null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

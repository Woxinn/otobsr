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
  const agentName = String(body?.agentName ?? "").trim();
  if (!agentName) {
    return NextResponse.json({ error: "agentName zorunlu" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  await supabase.rpc("mssql_bridge_requeue_stale_requests");

  const { data, error } = await supabase.rpc("mssql_bridge_claim_request", {
    p_agent_name: agentName,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const request = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ request: request ?? null });
}

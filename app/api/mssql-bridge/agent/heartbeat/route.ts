import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getBridgeAgentAuthDebug, requireBridgeAgent } from "@/lib/mssql-bridge-auth";

export async function POST(req: NextRequest) {
  try {
    requireBridgeAgent(req);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message ?? "unauthorized",
        debug: getBridgeAgentAuthDebug(req),
      },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const agentName = String(body?.agentName ?? "").trim();
  if (!agentName) {
    return NextResponse.json({ error: "agentName zorunlu" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const payload = {
    agent_name: agentName,
    status: "online",
    version: body?.version ? String(body.version) : null,
    host: body?.host ? String(body.host) : null,
    meta: body?.meta && typeof body.meta === "object" ? body.meta : {},
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("mssql_bridge_agents").upsert(payload, { onConflict: "agent_name" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

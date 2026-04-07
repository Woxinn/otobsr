import { NextResponse } from "next/server";
import { canViewFinance, getCurrentUserRole } from "@/lib/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { role } = await getCurrentUserRole();
  if (!canViewFinance(role)) {
    return NextResponse.json({ error: "Yetki yok" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: mails, error } = await admin
    .from("insurance_inbound_mails")
    .select(
      "id, subject, from_email, received_at, has_policy_attachment, policy_attachment_count, import_status, imported_order_id"
    )
    .eq("has_policy_attachment", true)
    .ilike("subject", "%sigorta%")
    .order("received_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: mails ?? [] });
}

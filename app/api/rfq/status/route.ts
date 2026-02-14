import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (role === "Satis") return NextResponse.json({ error: "Yetki yok" }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
  }

  const id = body?.id as string | undefined;
  const status = body?.status as string | undefined;
  if (!id || !status) return NextResponse.json({ error: "Eksik alan" }, { status: 400 });

  const { error } = await supabase.from("rfqs").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: "Güncellenemedi" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

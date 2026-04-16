import { NextResponse } from "next/server";
import { getCurrentUserRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncTasks } from "@/lib/tasks";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { role } = await getCurrentUserRole(supabase, user);

    if (role === "Satis") {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await syncTasks();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "sync failed",
      },
      { status: 500 }
    );
  }
}


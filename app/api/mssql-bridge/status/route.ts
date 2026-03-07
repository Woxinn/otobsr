import { NextResponse } from "next/server";
import { fetchLiveBridgeStatus } from "@/lib/live-mssql";

export async function GET() {
  try {
    const agents = await fetchLiveBridgeStatus();
    return NextResponse.json({ agents });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "status okunamadi" }, { status: 500 });
  }
}

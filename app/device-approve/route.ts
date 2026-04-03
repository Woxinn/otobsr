import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/";
  return NextResponse.redirect(new URL(`/device-check?returnTo=${encodeURIComponent(returnTo)}`, request.url));
}

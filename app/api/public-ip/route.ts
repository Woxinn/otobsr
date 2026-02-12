export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
    });
    const data = await res.json();
    return Response.json({ ok: true, ip: data.ip });
  } catch (error: any) {
    return Response.json(
      { ok: false, error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}

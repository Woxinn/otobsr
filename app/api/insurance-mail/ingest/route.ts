import { NextRequest, NextResponse } from "next/server";
import { importInsurancePolicyFromPayload } from "@/lib/insurance-policy-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const enabled = process.env.INSURANCE_POLICY_AUTO_IMPORT_ENABLED === "true";
  if (!enabled) {
    return NextResponse.json({ error: "Otomatik sigorta importu kapali." }, { status: 403 });
  }

  const secret = process.env.INSURANCE_POLICY_AUTO_IMPORT_SECRET?.trim();
  const incomingSecret = req.headers.get("x-insurance-ingest-secret")?.trim();
  if (!secret || !incomingSecret || incomingSecret !== secret) {
    return NextResponse.json({ error: "Yetkisiz istek." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const result = await importInsurancePolicyFromPayload({
    subject: String(body?.subject ?? ""),
    attachments: (Array.isArray(body?.attachments) ? body.attachments : []).map((item: any) => ({
      filename: String(item?.filename ?? ""),
      contentBase64: String(item?.contentBase64 ?? ""),
      contentType: item?.contentType ? String(item.contentType) : undefined,
    })),
  });

  if (!result.ok) {
    const { status, ...payload } = result;
    return NextResponse.json(payload, { status });
  }
  return NextResponse.json(result, { status: 200 });
}

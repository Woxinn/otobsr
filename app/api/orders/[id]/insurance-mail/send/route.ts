import { NextRequest, NextResponse } from "next/server";
import { canViewFinance, getCurrentUserRole } from "@/lib/roles";
import {
  buildInsuranceWorkbook,
  normalizeInsuranceFormPayload,
  sanitizeFileName,
  type InsuranceFormPayload,
} from "@/lib/insurance-form";
import { buildInsuranceRequestEmail, sendResendEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const parseEmails = (input: unknown) => {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter((value) => value.includes("@"))
    )
  );
};

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { role } = await getCurrentUserRole();
  if (!canViewFinance(role)) {
    return NextResponse.json({ error: "Yetki yok" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const emails = parseEmails(body?.emails);
  if (!emails.length) {
    return NextResponse.json({ error: "En az bir gecerli e-posta girin." }, { status: 400 });
  }

  const payload = normalizeInsuranceFormPayload((body?.form ?? {}) as Partial<InsuranceFormPayload>);
  const orderLabel = String(body?.orderLabel ?? "").trim();
  const workbookBuffer = await buildInsuranceWorkbook(payload);
  const fileBase = sanitizeFileName(`order-${id}`);
  const emailContent = buildInsuranceRequestEmail({
    orderLabel,
    consignmentNo: payload.consignmentNo,
    flotanNo: payload.flotanNo,
    vehicleDetail: payload.vehicleDetail,
    goodsDescription: payload.goodsDescription,
    goodsValue: payload.goodsValue,
  });

  await sendResendEmail({
    to: emails,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
    attachments: [
      {
        filename: `navlun-sigortasi-${fileBase}.xlsx`,
        content: Buffer.from(workbookBuffer as ArrayBuffer).toString("base64"),
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  });

  return NextResponse.json({ ok: true, sent: emails.length });
}

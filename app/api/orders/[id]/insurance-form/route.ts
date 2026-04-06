import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserRole } from "@/lib/roles";
import {
  buildInsuranceWorkbook,
  getInsuranceFormData,
  sanitizeFileName,
} from "@/lib/insurance-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { role } = await getCurrentUserRole();
  if (role === "Satis") {
    return NextResponse.json({ error: "Yetki yok" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const insuranceData = await getInsuranceFormData(id);

  if (!insuranceData) {
    return NextResponse.json({ error: "Siparis bulunamadi" }, { status: 404 });
  }

  const buffer = await buildInsuranceWorkbook(insuranceData.payload);
  const fileBase = sanitizeFileName(insuranceData.orderLabel);

  return new NextResponse(buffer as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="navlun-sigortasi-${fileBase}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

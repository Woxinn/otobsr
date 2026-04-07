import { notFound, redirect } from "next/navigation";
import InsuranceMailComposer from "@/components/InsuranceMailComposer";
import InsuranceInboxImporter from "@/components/InsuranceInboxImporter";
import { canViewFinance, getCurrentUserRole } from "@/lib/roles";
import { getInsuranceFormData } from "@/lib/insurance-form";

type RecipientPreset = {
  label: string;
  emails: string[];
};

const parseRecipientPresets = (): RecipientPreset[] => {
  const raw = process.env.INSURANCE_MAIL_PRESETS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ label?: string; emails?: string[] }>;
    return (parsed ?? [])
      .map((item) => ({
        label: String(item?.label ?? "").trim(),
        emails: Array.from(
          new Set(
            (item?.emails ?? [])
              .map((email) => String(email ?? "").trim().toLowerCase())
              .filter((email) => email.includes("@"))
          )
        ),
      }))
      .filter((item) => item.label && item.emails.length > 0);
  } catch {
    return [];
  }
};

export default async function InsuranceMailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { role } = await getCurrentUserRole();
  if (!canViewFinance(role)) {
    redirect(`/orders/${id}`);
  }

  const data = await getInsuranceFormData(id);
  if (!data) {
    notFound();
  }

  return (
    <section className="space-y-6">
      <InsuranceMailComposer
        orderId={data.orderId}
        orderLabel={data.orderLabel}
        initialPayload={data.payload}
        presets={parseRecipientPresets()}
      />
      <InsuranceInboxImporter orderId={data.orderId} />
    </section>
  );
}

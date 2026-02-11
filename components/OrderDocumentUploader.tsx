"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";

type DocumentType = {
  id: string;
  name: string;
  applies_to?: string | null;
};

export default function OrderDocumentUploader({
  orderId,
  documentTypes,
  orderCurrency,
}: {
  orderId: string;
  documentTypes: DocumentType[];
  orderCurrency?: string | null;
}) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { addToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [documentTypeId, setDocumentTypeId] = useState(
    documentTypes[0]?.id ?? ""
  );
  const [status, setStatus] = useState("Geldi");
  const [receivedAt, setReceivedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [insuranceAmount, setInsuranceAmount] = useState("");
  const [insuranceCurrency, setInsuranceCurrency] = useState(
    orderCurrency || "USD"
  );
  const [loading, setLoading] = useState(false);

  const orderTypes = useMemo(
    () => documentTypes.filter((type) => type.applies_to === "order"),
    [documentTypes]
  );

  const isInsurance = useMemo(() => {
    const selected = orderTypes.find((type) => type.id === documentTypeId);
    const name = selected?.name?.toLowerCase() ?? "";
    return name.includes("navlun") || name.includes("sigorta");
  }, [documentTypeId, orderTypes]);

  const isProforma = useMemo(() => {
    const selected = orderTypes.find((type) => type.id === documentTypeId);
    const name = selected?.name?.toLowerCase() ?? "";
    return name.includes("proforma");
  }, [documentTypeId, orderTypes]);

  const handleUpload = async () => {
    if (!file || !documentTypeId) {
      addToast("Dosya ve evrak tipi secmelisiniz.", "error");
      return;
    }

    setLoading(true);
    const extension = file.name.split(".").pop() ?? "pdf";
    const uniqueName = `${Date.now()}.${extension}`;
    const filePath = `orders/${orderId}/${uniqueName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, file);

    if (uploadError) {
      setLoading(false);
      addToast("Dosya yuklenemedi.", "error");
      return;
    }

    const parsedInsurance =
      insuranceAmount.trim() === ""
        ? null
        : Number(insuranceAmount.replace(",", "."));

    if (isInsurance && parsedInsurance !== null && Number.isNaN(parsedInsurance)) {
      setLoading(false);
      addToast("Navlun sigortasi tutari gecerli degil.", "error");
      return;
    }

    const { error: insertError } = await supabase
      .from("order_documents")
      .insert({
        order_id: orderId,
        storage_path: filePath,
        file_name: file.name,
        document_type_id: documentTypeId,
        status,
        received_at: receivedAt || null,
        notes: notes || null,
        insurance_amount: isInsurance ? parsedInsurance : null,
        insurance_currency: isInsurance ? insuranceCurrency || "USD" : null,
      });

    setLoading(false);

    if (insertError) {
      addToast("Belge kaydi olusturulamadi.", "error");
      return;
    }

    if (isProforma) {
      await supabase
        .from("orders")
        .update({ order_status: "Proforma Geldi" })
        .eq("id", orderId)
        .eq("order_status", "Siparis Verildi");
    }

    setFile(null);
    setNotes("");
    setInsuranceAmount("");
    setInsuranceCurrency(orderCurrency || "USD");
    addToast("Belge yuklendi.", "success");
    router.refresh();
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-[var(--sky)] p-4 text-sm">
      <p className="font-semibold">Belge yukle</p>
      <div className="mt-3 grid gap-3">
        <input
          type="file"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="rounded-xl border border-black/10 bg-white p-2 text-sm"
        />
        <select
          value={documentTypeId}
          onChange={(event) => setDocumentTypeId(event.target.value)}
          className="rounded-xl border border-black/10 bg-white p-2 text-sm"
        >
          {orderTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-xl border border-black/10 bg-white p-2 text-sm"
        >
          <option value="Bekleniyor">Bekleniyor</option>
          <option value="Geldi">Geldi</option>
          <option value="Sorunlu">Sorunlu</option>
        </select>
        <input
          type="date"
          value={receivedAt}
          onChange={(event) => setReceivedAt(event.target.value)}
          className="rounded-xl border border-black/10 bg-white p-2 text-sm"
        />
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Not"
          className="rounded-xl border border-black/10 bg-white p-2 text-sm"
        />
        {isInsurance ? (
          <div className="grid gap-2 rounded-xl border border-black/10 bg-white p-3 text-sm">
            <p className="text-xs font-semibold text-black/70">
              Navlun sigortasi tutari
            </p>
            <input
              value={insuranceAmount}
              onChange={(event) => setInsuranceAmount(event.target.value)}
              placeholder="Orn: 1250"
              className="rounded-xl border border-black/10 bg-white p-2 text-sm"
            />
            <input
              value={insuranceCurrency}
              onChange={(event) => setInsuranceCurrency(event.target.value)}
              placeholder="Para birimi (USD)"
              className="rounded-xl border border-black/10 bg-white p-2 text-sm"
            />
          </div>
        ) : null}
      </div>
      <button
        onClick={handleUpload}
        disabled={loading}
        className="mt-4 rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-70"
      >
        {loading ? "Yukleniyor..." : "Belgeyi kaydet"}
      </button>
    </div>
  );
}

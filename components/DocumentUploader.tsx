"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import { useGlobalLoading } from "@/components/GlobalLoadingProvider";

type DocumentType = {
  id: string;
  name: string;
};

type Props = {
  shipmentId?: string;
  rfqId?: string;
  documentTypes: DocumentType[];
  onUploaded?: () => void;
};

export default function DocumentUploader({
  shipmentId,
  rfqId,
  documentTypes,
  onUploaded,
}: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [documentTypeId, setDocumentTypeId] = useState(
    documentTypes[0]?.id ?? ""
  );
  const [status, setStatus] = useState("Geldi");
  const [receivedAt, setReceivedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();
  const { startLoading, updateLoading, stopLoading } = useGlobalLoading();

  const handleUpload = async () => {
    if (!file || !documentTypeId) {
      addToast("Dosya ve evrak tipi seçmelisiniz.", "error");
      return;
    }

    setLoading(true);
    startLoading({ label: "Belge yükleniyor", detail: file.name, progress: 12 });
    try {
      const supabase = createSupabaseBrowserClient();

      const extension = file.name.split(".").pop() ?? "pdf";
      const key = shipmentId ?? rfqId ?? "unlinked";
      const uniqueName = `${key}-${Date.now()}.${extension}`;
      const filePath = `${key}/${uniqueName}`;

      updateLoading({ detail: "Dosya depoya aktarılıyor", progress: 38 });
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file);

      if (uploadError) {
        console.error("Document upload failed", uploadError);
        addToast(
          uploadError.message
            ? `Dosya yüklenemedi: ${uploadError.message}`
            : "Dosya yüklenemedi.",
          "error"
        );
        return;
      }

      updateLoading({ detail: "Belge kaydı oluşturuluyor", progress: 72 });
      const { error: insertError } = await supabase.from("documents").insert({
        shipment_id: shipmentId ?? null,
        document_type_id: documentTypeId,
        status,
        received_at: receivedAt || null,
        notes: rfqId ? `rfq:${rfqId}${notes ? " " + notes : ""}` : notes || null,
        storage_path: filePath,
        file_name: file.name,
      });

      if (insertError) {
        console.error("Document insert failed", insertError);
        addToast(
          insertError.message
            ? `Belge kaydı oluşturulamadı: ${insertError.message}`
            : "Belge kaydı oluşturulamadı.",
          "error"
        );
        return;
      }

      updateLoading({ detail: "Ekran yenileniyor", progress: 92 });
      setFile(null);
      setNotes("");
      addToast("Belge yüklendi.", "success");
      onUploaded?.();
      router.refresh();
    } finally {
      setLoading(false);
      stopLoading();
    }
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-[var(--sky)] p-4 text-sm">
      <p className="font-semibold">Belge yükle</p>
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
          {documentTypes.map((type) => (
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
      </div>
      <button
        onClick={handleUpload}
        disabled={loading}
        className="mt-4 rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-70"
      >
        {loading ? "Yükleniyor..." : "Belgeyi kaydet"}
      </button>
    </div>
  );
}

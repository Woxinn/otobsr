"use client";

import { useState, useMemo, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import { useGlobalLoading } from "@/components/GlobalLoadingProvider";
import { FileUp, CheckCircle2, AlertCircle, FileText } from "lucide-react";

type OrderItem = {
  id: string;
  name: string;
};

type ShipmentItem = {
  id: string;
  file_no: string;
};

type DocumentType = {
  id: string;
  name: string;
  applies_to?: string | null;
};

type Props = {
  orders: OrderItem[];
  shipments: ShipmentItem[];
  documentTypes: DocumentType[];
};

export default function DashboardUploadInbox({
  orders,
  shipments,
  documentTypes,
}: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { addToast } = useToast();
  const { startLoading, updateLoading, stopLoading } = useGlobalLoading();

  const [isDragOver, setIsDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [matchType, setMatchType] = useState<"order" | "shipment">("order");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [status, setStatus] = useState("Geldi");
  const [receivedAt, setReceivedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [isAutoMatched, setIsAutoMatched] = useState(false);
  const [autoMatchMsg, setAutoMatchMsg] = useState("");

  const [loading, setLoading] = useState(false);

  // Filtered document types based on matchType selection
  const filteredTypes = useMemo(() => {
    return documentTypes.filter((t) => {
      if (matchType === "order") {
        return t.applies_to === "order";
      } else {
        return t.applies_to === "shipment" || !t.applies_to;
      }
    });
  }, [documentTypes, matchType]);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const processFile = (fileObj: File) => {
    setFile(fileObj);
    setIsAutoMatched(false);
    setAutoMatchMsg("");

    const fileNameLower = fileObj.name.toLowerCase();

    // 1. Check if filename matches a shipment file_no
    const matchedShipment = shipments.find((s) => {
      const shpName = s.file_no.toLowerCase().trim();
      return shpName && fileNameLower.includes(shpName);
    });

    if (matchedShipment) {
      setMatchType("shipment");
      setSelectedShipmentId(matchedShipment.id);
      setIsAutoMatched(true);
      setAutoMatchMsg(`Akıllı Eşleşme: ${matchedShipment.file_no} nolu Sevkiyat`);
      detectDocumentType(fileNameLower, "shipment");
      return;
    }

    // 2. Check if filename matches an order name
    const matchedOrder = orders.find((o) => {
      const ordName = o.name.toLowerCase().trim();
      return ordName && fileNameLower.includes(ordName);
    });

    if (matchedOrder) {
      setMatchType("order");
      setSelectedOrderId(matchedOrder.id);
      setIsAutoMatched(true);
      setAutoMatchMsg(`Akıllı Eşleşme: ${matchedOrder.name} nolu Sipariş`);
      detectDocumentType(fileNameLower, "order");
      return;
    }

    // Default pre-selections if no auto match
    if (orders.length > 0) {
      setSelectedOrderId(orders[0].id);
    }
    if (shipments.length > 0) {
      setSelectedShipmentId(shipments[0].id);
    }

    detectDocumentType(fileNameLower, "order");
  };

  const detectDocumentType = (fileNameLower: string, typeContext: "order" | "shipment") => {
    let matchedId = "";

    const candidates = documentTypes.filter((t) => {
      if (typeContext === "order") return t.applies_to === "order";
      return t.applies_to === "shipment" || !t.applies_to;
    });

    if (fileNameLower.includes("fatura") || fileNameLower.includes("invoice")) {
      const found = candidates.find(
        (c) =>
          c.name.toLowerCase().includes("fatura") ||
          c.name.toLowerCase().includes("invoice")
      );
      if (found) matchedId = found.id;
    } else if (fileNameLower.includes("proforma")) {
      const found = candidates.find((c) =>
        c.name.toLowerCase().includes("proforma")
      );
      if (found) matchedId = found.id;
    } else if (fileNameLower.includes("konşimento") || fileNameLower.includes("lading") || fileNameLower.includes("bl")) {
      const found = candidates.find(
        (c) =>
          c.name.toLowerCase().includes("konşimento") ||
          c.name.toLowerCase().includes("lading") ||
          c.name.toLowerCase().includes("bl")
      );
      if (found) matchedId = found.id;
    } else if (fileNameLower.includes("çeki") || fileNameLower.includes("packing")) {
      const found = candidates.find(
        (c) =>
          c.name.toLowerCase().includes("çeki") ||
          c.name.toLowerCase().includes("packing")
      );
      if (found) matchedId = found.id;
    }

    if (matchedId) {
      setDocumentTypeId(matchedId);
    } else if (candidates.length > 0) {
      setDocumentTypeId(candidates[0].id);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      addToast("Lütfen bir dosya yükleyin.", "error");
      return;
    }

    const currentTypeId = documentTypeId || (filteredTypes[0]?.id ?? "");
    if (!currentTypeId) {
      addToast("Lütfen evrak tipini seçin.", "error");
      return;
    }

    const selectedItemId = matchType === "order" ? selectedOrderId : selectedShipmentId;
    if (!selectedItemId) {
      addToast(
        matchType === "order"
          ? "Lütfen ilişkili siparişi seçin."
          : "Lütfen ilişkili sevkiyatı seçin.",
        "error"
      );
      return;
    }

    setLoading(true);
    startLoading({ label: "Evrak depoya aktarılıyor", detail: file.name, progress: 15 });

    try {
      const extension = file.name.split(".").pop() ?? "pdf";
      const uniqueName = `${Date.now()}.${extension}`;

      let filePath = "";
      if (matchType === "order") {
        filePath = `orders/${selectedItemId}/${uniqueName}`;
      } else {
        filePath = `${selectedItemId}/${uniqueName}`;
      }

      updateLoading({ detail: "Dosya depoya yükleniyor", progress: 45 });
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file);

      if (uploadError) {
        addToast(`Dosya yüklenemedi: ${uploadError.message}`, "error");
        return;
      }

      updateLoading({ detail: "Veritabanı kaydı oluşturuluyor", progress: 75 });

      if (matchType === "order") {
        const { error: insertError } = await supabase.from("order_documents").insert({
          order_id: selectedItemId,
          storage_path: filePath,
          file_name: file.name,
          document_type_id: currentTypeId,
          status,
          received_at: receivedAt || null,
          notes: notes || null,
        });

        if (insertError) {
          addToast(`Evrak kaydı oluşturulamadı: ${insertError.message}`, "error");
          return;
        }

        // Check if proforma is uploaded
        const selectedType = documentTypes.find((t) => t.id === currentTypeId);
        const typeNameLower = selectedType?.name?.toLowerCase() ?? "";
        if (typeNameLower.includes("proforma")) {
          await supabase
            .from("orders")
            .update({ order_status: "Proforma Geldi" })
            .eq("id", selectedItemId)
            .eq("order_status", "Siparis Verildi");
        }
      } else {
        const { error: insertError } = await supabase.from("documents").insert({
          shipment_id: selectedItemId,
          document_type_id: currentTypeId,
          status,
          received_at: receivedAt || null,
          notes: notes || null,
          storage_path: filePath,
          file_name: file.name,
        });

        if (insertError) {
          addToast(`Evrak kaydı oluşturulamadı: ${insertError.message}`, "error");
          return;
        }
      }

      updateLoading({ detail: "Ekran güncelleniyor", progress: 95 });
      addToast("Belge başarıyla yüklendi.", "success");
      setFile(null);
      setNotes("");
      setIsAutoMatched(false);
      setAutoMatchMsg("");
      router.refresh();
    } catch (err: any) {
      addToast(`Bir hata oluştu: ${err.message || err}`, "error");
    } finally {
      setLoading(false);
      stopLoading();
    }
  };

  const handleReset = () => {
    setFile(null);
    setNotes("");
    setIsAutoMatched(false);
    setAutoMatchMsg("");
  };

  return (
    <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400 font-bold">
            Evrak Girişi
          </p>
          <h2 className="mt-1 text-lg font-semibold [font-family:var(--font-display)] text-slate-800">
            Akıllı Evrak Kutusu
          </h2>
        </div>
        <FileUp className="h-5 w-5 text-slate-350" />
      </div>

      <div className="mt-4">
        {!file ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
              isDragOver
                ? "border-emerald-500 bg-emerald-50/10"
                : "border-slate-200 bg-slate-50/30 hover:border-slate-300"
            }`}
          >
            <div className="rounded-full bg-slate-100 p-3.5 text-slate-400">
              <FileUp className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-700">
              Dosyayı buraya sürükleyin veya seçin
            </p>
            <p className="mt-1 text-xs text-slate-400">PDF, XLS, PNG veya DOC formatları</p>
            <label className="mt-4 cursor-pointer rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-700">
              Dosya Seç
              <input
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-400">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="text-xs font-semibold text-slate-450 hover:text-slate-600"
              >
                Kaldır
              </button>
            </div>

            {isAutoMatched && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50/80 px-3 py-2 text-xs font-medium text-emerald-800 border border-emerald-100">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{autoMatchMsg}</span>
              </div>
            )}

            {!isAutoMatched && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-800 border border-amber-100">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Otomatik eşleşme bulunamadı. Lütfen manuel seçin.</span>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  İlişki Türü
                </label>
                <select
                  value={matchType}
                  onChange={(e) => {
                    const val = e.target.value as "order" | "shipment";
                    setMatchType(val);
                    detectDocumentType(file.name.toLowerCase(), val);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-sm"
                >
                  <option value="order">Sipariş</option>
                  <option value="shipment">Sevkiyat (Shipment)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  İlişkili Öğe
                </label>
                {matchType === "order" ? (
                  <select
                    value={selectedOrderId}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-sm"
                  >
                    <option value="">Seçin...</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={selectedShipmentId}
                    onChange={(e) => setSelectedShipmentId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-sm"
                  >
                    <option value="">Seçin...</option>
                    {shipments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.file_no}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Evrak Tipi
                </label>
                <select
                  value={documentTypeId}
                  onChange={(e) => setDocumentTypeId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-sm"
                >
                  {filteredTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Evrak Durumu
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-sm"
                >
                  <option value="Geldi">Geldi</option>
                  <option value="Bekleniyor">Bekleniyor</option>
                  <option value="Sorunlu">Sorunlu</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Alındı Tarihi
                </label>
                <input
                  type="date"
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-sm"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Ek Not
                </label>
                <input
                  type="text"
                  placeholder="Not giriniz..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-sm"
                />
              </div>
            </div>

            <button
              onClick={handleUpload}
              disabled={loading}
              className="w-full mt-2 rounded-lg bg-[#101817] py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#182322] disabled:opacity-70"
            >
              {loading ? "Evrak Yükleniyor..." : "Evrak Kaydet"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

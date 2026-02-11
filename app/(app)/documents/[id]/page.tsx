import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateDocument, deleteDocument } from "@/app/actions/documents";
import DocumentDownloadButton from "@/components/DocumentDownloadButton";
import ConfirmActionForm from "@/components/ConfirmActionForm";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const supabase = await createSupabaseServerClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("*, document_types(name), shipments(file_no)")
    .eq("id", resolvedParams.id)
    .single();

  if (!doc) {
    notFound();
  }

  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("id, name")
    .order("name");

  const { data: shipments } = await supabase
    .from("shipments")
    .select("id, file_no")
    .order("file_no");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Belge detay
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            {doc.document_types?.name ?? "Evrak"}
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Shipment: {doc.shipments?.file_no ?? "Baglanmamis"}
          </p>
        </div>
        <Link
          href="/documents"
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Listeye don
        </Link>
      </div>

      <form
        action={updateDocument}
        className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="document_id" value={doc.id} />
        <input type="hidden" name="shipment_id" value={doc.shipment_id ?? ""} />
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium">
            Evrak tipi
            <select
              name="document_type_id"
              defaultValue={doc.document_type_id ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              {documentTypes?.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Durum
            <select
              name="status"
              defaultValue={doc.status ?? "Bekleniyor"}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="Bekleniyor">Bekleniyor</option>
              <option value="Geldi">Geldi</option>
              <option value="Sorunlu">Sorunlu</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Shipment
            <select
              name="shipment_id"
              defaultValue={doc.shipment_id ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Baglanmamis</option>
              {shipments?.map((shipment) => (
                <option key={shipment.id} value={shipment.id}>
                  {shipment.file_no}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Alinma tarihi
            <input
              type="date"
              name="received_at"
              defaultValue={doc.received_at ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium lg:col-span-2">
            Not
            <input
              name="notes"
              defaultValue={doc.notes ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {doc.storage_path ? (
            <DocumentDownloadButton
              storagePath={doc.storage_path}
              label="Dosyayi indir"
            />
          ) : (
            <span className="text-black/60">Dosya yok</span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
            Guncelle
          </button>
        </div>
      </form>
      <ConfirmActionForm
        action={deleteDocument}
        confirmText="Belge silinsin mi?"
        buttonText="Sil"
      >
        <input type="hidden" name="document_id" value={doc.id} />
        <input type="hidden" name="shipment_id" value={doc.shipment_id ?? ""} />
      </ConfirmActionForm>
    </section>
  );
}

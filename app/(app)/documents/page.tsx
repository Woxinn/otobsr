import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DocumentUploader from "@/components/DocumentUploader";
import DocumentDownloadButton from "@/components/DocumentDownloadButton";

type SearchParams = {
  type?: string;
  status?: string;
  shipment?: string;
  order?: string;
  unlinked?: string;
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("id, name")
    .order("name");
  const { data: shipments } = await supabase
    .from("shipments")
    .select("id, file_no")
    .order("file_no");
  const { data: orders } = await supabase
    .from("orders")
    .select("id, name")
    .order("name");
  const { data: documents } = await supabase
    .from("documents")
    .select("*, document_types(name), shipments(file_no)")
    .order("uploaded_at", { ascending: false });
  const { data: orderDocuments } = await supabase
    .from("order_documents")
    .select("*, document_types(name), orders(name)")
    .order("uploaded_at", { ascending: false });

  const allDocuments = [
    ...(documents ?? []).map((doc) => ({ ...doc, source: "shipment" as const })),
    ...(orderDocuments ?? []).map((doc) => ({ ...doc, source: "order" as const })),
  ];

  let filtered = allDocuments;

  if (searchParams.type) {
    filtered = filtered.filter(
      (doc) => doc.document_type_id === searchParams.type
    );
  }
  if (searchParams.status) {
    filtered = filtered.filter((doc) => doc.status === searchParams.status);
  }
  if (searchParams.shipment) {
    filtered = filtered.filter((doc) => doc.shipment_id === searchParams.shipment);
  }
  if (searchParams.order) {
    filtered = filtered.filter((doc) => doc.order_id === searchParams.order);
  }
  if (searchParams.unlinked === "1") {
    filtered = filtered.filter((doc) => !doc.shipment_id);
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-black/40">
          Belgeler merkezi
        </p>
        <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
          Tum evraklar tek listede
        </h2>
      </div>

      <form className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-4">
          <label className="text-sm font-medium">
            Evrak tipi
            <select
              name="type"
              defaultValue={searchParams.type ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
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
              defaultValue={searchParams.status ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              <option value="Bekleniyor">Bekleniyor</option>
              <option value="Geldi">Geldi</option>
              <option value="Sorunlu">Sorunlu</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Shipment
            <select
              name="shipment"
              defaultValue={searchParams.shipment ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              {shipments?.map((shipment) => (
                <option key={shipment.id} value={shipment.id}>
                  {shipment.file_no}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Siparis
            <select
              name="order"
              defaultValue={searchParams.order ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              {orders?.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.name ?? order.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="unlinked"
              value="1"
              defaultChecked={searchParams.unlinked === "1"}
            />
            Baglanmamis belgeler
          </label>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
            Filtrele
          </button>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.35fr]">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Belgeler</h3>
          <div className="mt-4 space-y-3 text-sm">
            {filtered.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.2em] text-black/40">
                      <th className="px-3 py-2">Evrak</th>
                      <th className="px-3 py-2">Dosya</th>
                      <th className="px-3 py-2">Shipment</th>
                      <th className="px-3 py-2">Siparis</th>
                      <th className="px-3 py-2">Durum</th>
                      <th className="px-3 py-2">Tarih</th>
                      <th className="px-3 py-2">Not</th>
                      <th className="px-3 py-2 text-right">Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((doc) => (
                      <tr
                        key={`${doc.source}-${doc.id}`}
                        className="rounded-2xl border border-black/10 bg-[var(--sky)]"
                      >
                        <td className="px-3 py-3 font-semibold">
                          {doc.document_types?.name ?? "Evrak"}
                        </td>
                        <td className="px-3 py-3 text-xs text-black/60">
                          <div className="flex items-center gap-2">
                            <span>{doc.file_name ?? "Dosya yok"}</span>
                            {doc.storage_path ? (
                              <DocumentDownloadButton
                                storagePath={doc.storage_path}
                              />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {doc.shipments?.file_no ?? "Baglanmamis"}
                        </td>
                        <td className="px-3 py-3">
                          {doc.orders?.name ?? "-"}
                        </td>
                        <td className="px-3 py-3">{doc.status ?? "-"}</td>
                        <td className="px-3 py-3">{doc.received_at ?? "-"}</td>
                        <td className="px-3 py-3">{doc.notes ?? "-"}</td>
                        <td className="px-3 py-3 text-right">
                          <Link
                            href={`/documents/${doc.id}`}
                            className="rounded-full border border-black/20 px-4 py-1 text-xs font-semibold"
                          >
                            Detay
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
                Filtreye uygun belge yok.
              </div>
            )}
          </div>
        </div>
        <div>
          <DocumentUploader documentTypes={documentTypes ?? []} />
        </div>
      </div>
    </section>
  );
}


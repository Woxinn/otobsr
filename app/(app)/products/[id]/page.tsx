import Link from "next/link";
import sql from "mssql";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupplierProductAlias,
  deleteProduct,
  deleteSupplierProductAlias,
} from "@/app/actions/products";
import { computeCosts, pickWeightKg, GtipRow } from "@/lib/gtipCost";
import ConfirmActionForm from "@/components/ConfirmActionForm";
import { canViewFinance, getCurrentUserRole } from "@/lib/roles";

const fmt = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
const fmtPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
};
const fmtDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const fmtInt = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

async function fetchNetsisStock(code: string | null | undefined) {
  if (!code) return { value: null as number | null, error: "Netsis kodu yok" };

  const {
    MSSQL_SERVER,
    MSSQL_PORT,
    MSSQL_DB,
    MSSQL_USER,
    MSSQL_PASS,
    MSSQL_TRUST_CERT,
    MSSQL_ENCRYPT,
  } = process.env;

  const envOk = MSSQL_SERVER && MSSQL_DB && MSSQL_USER && MSSQL_PASS;
  if (!envOk)
    return { value: null, error: "MSSQL baglanti ayarlari eksik (.env.local)" };

  try {
    const pool = await sql.connect({
      server: MSSQL_SERVER!,
      port: MSSQL_PORT ? Number(MSSQL_PORT) : 1433,
      database: MSSQL_DB!,
      user: MSSQL_USER!,
      password: MSSQL_PASS!,
      options: {
        encrypt: MSSQL_ENCRYPT !== "false",
        trustServerCertificate: MSSQL_TRUST_CERT === "true",
        cryptoCredentialsDetails: { minVersion: "TLSv1", maxVersion: "TLSv1.2" },
        enableArithAbort: true,
      },
    });

    const result = await pool
      .request()
      .input("stok", sql.VarChar, String(code).trim())
      .query(`
        SELECT SUM(CASE WHEN Har.STHAR_GCKOD='G' THEN Har.STHAR_GCMIK ELSE -Har.STHAR_GCMIK END) AS NetMiktar
        FROM TBLSTHAR Har
        WHERE LTRIM(RTRIM(Har.STOK_KODU)) = @stok
      `);

    await pool.close();
    return { value: result.recordset?.[0]?.NetMiktar ?? 0, error: null };
  } catch (err: any) {
    console.error("[product detail mssql]", err);
    return { value: null, error: err?.message ?? String(err) };
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const isSales = role === "Satis";
  const canSeeFinance = canViewFinance(role);
  const canEdit = role === "Admin";

  const { data: product } = await supabase
    .from("products")
    .select(
      "id, code, name, brand, description, notes, group_id, unit_price, created_at, gtip_id, domestic_cost_percent, netsis_stok_kodu, gtip:gtips(code)"
    )
    .eq("id", id)
    .single();

  if (!product) {
    return (
      <section className="rounded-3xl border border-black/10 bg-white p-8 text-sm text-black/60">
        Ürün bulunamadi.
      </section>
    );
  }

  const stockResult = await fetchNetsisStock(product.netsis_stok_kodu);

  const { data: group } = product.group_id
    ? await supabase
        .from("product_groups")
        .select("id, name")
        .eq("id", product.group_id)
        .single()
    : { data: null };

  const { data: gtip } = product.gtip_id
    ? await supabase.from("gtips").select("*").eq("id", product.gtip_id).single()
    : { data: null };

  const { data: countryRates } = product.gtip_id
    ? await supabase
        .from("gtip_country_rates")
        .select("*")
        .eq("gtip_id", product.gtip_id)
        .order("country")
    : { data: [] as any[] };

  const { data: attributes } = product.group_id
    ? await supabase
        .from("product_attributes")
        .select("id, name, unit, value_type, is_required, sort_order")
        .eq("group_id", product.group_id)
        .order("sort_order", { ascending: true })
        .order("name")
    : { data: [] };

  const { data: values } = await supabase
    .from("product_attribute_values")
    .select("attribute_id, value_text, value_number")
    .eq("product_id", product.id);

  const { data: extraAttributes } = await supabase
    .from("product_extra_attributes")
    .select("id, name, unit, value_type, value_text, value_number")
    .eq("product_id", product.id)
    .order("created_at", { ascending: true });

  const valueByAttribute = new Map(
    (values ?? []).map((value) => [value.attribute_id, value])
  );

  const weightCandidates =
    (attributes ?? []).map((attr) => {
      const v = valueByAttribute.get(attr.id);
      const raw = attr.value_type === "number" ? v?.value_number : v?.value_text;
      return { name: attr.name, value: raw };
    }) ?? [];
  const extraWeightCandidates =
    (extraAttributes ?? []).map((attr) => ({
      name: attr.name,
      value: attr.value_type === "number" ? attr.value_number : attr.value_text,
    })) ?? [];
  const weightKg = pickWeightKg([...weightCandidates, ...extraWeightCandidates] as any[]);

  const standardAttributeCards = (attributes ?? []).map((attr) => {
    const value = valueByAttribute.get(attr.id);
    const rawValue = attr.value_type === "number" ? value?.value_number : value?.value_text;
    const displayValue =
      rawValue === null || rawValue === undefined || rawValue === ""
        ? "-"
        : attr.value_type === "number"
        ? Number(rawValue).toLocaleString("tr-TR")
        : String(rawValue);
    return {
      key: `attr-${attr.id}`,
      name: attr.name,
      unit: attr.unit,
      value: displayValue,
    };
  });

  const extraAttributeCards = (extraAttributes ?? []).map((attr) => {
    const rawValue = attr.value_type === "number" ? attr.value_number : attr.value_text;
    const displayValue =
      rawValue === null || rawValue === undefined || rawValue === ""
        ? "-"
        : attr.value_type === "number"
        ? Number(rawValue).toLocaleString("tr-TR")
        : String(rawValue);
    return {
      key: `extra-${attr.id}`,
      name: attr.name,
      unit: attr.unit,
      value: displayValue,
    };
  });

  const mergedAttributeCards = [...standardAttributeCards, ...extraAttributeCards];

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name");

  const { data: aliases } = await supabase
    .from("supplier_product_aliases")
    .select("id, supplier_id, supplier_name, supplier:suppliers(name)")
    .eq("product_id", product.id)
    .order("supplier_name");

  const { data: orderItems } = await supabase
    .from("order_items")
    .select(
      "order_id, product_id, unit_price, quantity, orders(id, name, created_at, extra_cost_percent, suppliers:orders_supplier_id_fkey(name, country))"
    )
    .eq("product_id", product.id);

  const linkedOrderIds = Array.from(
    new Set((orderItems ?? []).map((item) => item.order_id).filter(Boolean))
  ) as string[];
  const { data: orderShipmentLinks } = linkedOrderIds.length
    ? await supabase
        .from("shipment_orders")
        .select("order_id, shipments(eta_current)")
        .in("order_id", linkedOrderIds)
    : { data: [] as any[] };

  const orderEtaByOrder = new Map<string, string | null>();
  (orderShipmentLinks ?? []).forEach((row: any) => {
    const orderId = row.order_id as string | null;
    if (!orderId) return;
    const shipments = Array.isArray(row.shipments) ? row.shipments : row.shipments ? [row.shipments] : [];
    const etaDates = shipments
      .map((s: any) => s?.eta_current as string | null)
      .filter(Boolean)
      .map((d: string) => new Date(d))
      .filter((d: Date) => !Number.isNaN(d.getTime()));
    if (!etaDates.length) return;
    const earliest = etaDates.sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];
    const current = orderEtaByOrder.get(orderId);
    if (!current) {
      orderEtaByOrder.set(orderId, earliest.toISOString());
      return;
    }
    const currentDate = new Date(current);
    if (earliest.getTime() < currentDate.getTime()) {
      orderEtaByOrder.set(orderId, earliest.toISOString());
    }
  });

  const linkedOrders = (() => {
    const grouped = new Map<
      string,
        {
          order: any;
          country: string | null;
          supplierName: string | null;
          extraCostPercent: number | null;
          totalQty: number;
          totalAmount: number;
        }
    >();

    (orderItems ?? []).forEach((item) => {
      if (!item.orders) return;
      const order = item.orders as any;
      const orderId = order.id;
      if (!orderId) return;
      const qtyRaw = (item as any).quantity ?? (item as any).packages ?? 0;
      const qty = Number(qtyRaw) || 0;
      const unitPrice = Number(item.unit_price ?? product.unit_price ?? 0) || 0;
      const amount = qty * unitPrice;
        const country = (order as any)?.suppliers?.country ?? null;
        const supplierName = (order as any)?.suppliers?.name ?? null;
        const extraCostPercentRaw = (order as any)?.extra_cost_percent;
        const extraCostPercent =
          extraCostPercentRaw === null || extraCostPercentRaw === undefined
            ? null
            : Number(extraCostPercentRaw);

      const existing = grouped.get(orderId);
      if (existing) {
        existing.totalQty += qty;
        existing.totalAmount += amount;
      } else {
          grouped.set(orderId, {
            order,
            country,
            supplierName,
            extraCostPercent:
              Number.isFinite(extraCostPercent) ? extraCostPercent : null,
            totalQty: qty,
            totalAmount: amount,
          });
        }
      });

      const rows = Array.from(grouped.values()).map((entry) => {
      const { order, country, supplierName, extraCostPercent, totalQty, totalAmount } = entry;
      const rateForCountry =
        (countryRates ?? []).find((c) => c.country === country) ?? null;
      const gtipForCost: GtipRow | null = rateForCountry
        ? {
            ...(gtip as any),
            customs_duty_rate: rateForCountry.customs_duty_rate,
            additional_duty_rate: rateForCountry.additional_duty_rate,
            anti_dumping_applicable: rateForCountry.anti_dumping_applicable,
            anti_dumping_rate: rateForCountry.anti_dumping_rate,
            surveillance_applicable: rateForCountry.surveillance_applicable,
            surveillance_unit_value: rateForCountry.surveillance_unit_value,
            vat_rate: rateForCountry.vat_rate,
          }
        : ((gtip as unknown as GtipRow) ?? null);

      const avgUnitPrice =
        totalQty > 0 ? totalAmount / totalQty : product.unit_price ?? null;

      const costs = computeCosts({
        basePrice: avgUnitPrice,
        domesticCostPercent:
          extraCostPercent ?? ((product.domestic_cost_percent as number | null) ?? 0),
        weightKg,
        gtip: gtipForCost,
      });

      const vatRate = 0.2;
      const vatBaseCandidates = [costs.gozetimliMatrah, costs.gozetimsizMatrah].filter(
        (v): v is number => v !== null
      );
      const vatBase = vatBaseCandidates.length ? Math.max(...vatBaseCandidates) : null;
      const grossVatPayable = vatBase !== null ? vatBase * vatRate : null;
      const vatCreditBase =
        costs.araTutar !== null ? (costs.araTutar ?? 0) + (costs.customsFromAra ?? 0) : null;
      const vatCredit = vatCreditBase !== null ? vatCreditBase * vatRate : null;
      const netVatPayable =
        grossVatPayable !== null ? Math.max(grossVatPayable - (vatCredit ?? 0), 0) : null;

      const subtotalBeforeVat =
        (costs.araTutar ?? 0) +
        (costs.customsFromGozetim ?? 0) +
        (costs.addFromGozetim ?? 0) +
        (costs.dumpingTutar ?? 0);
      const kdvBaseCandidates: number[] = [];
      if (costs.gozetimsizMatrah !== null) kdvBaseCandidates.push(costs.gozetimsizMatrah);
      kdvBaseCandidates.push(subtotalBeforeVat);
      const kdvBaz = kdvBaseCandidates.length ? Math.max(...kdvBaseCandidates) : null;
      const addDutyRate = Number((gtipForCost as any)?.additional_duty_rate ?? 0);
      const hasSurveillance = Boolean((gtipForCost as any)?.surveillance_applicable);
      const shouldAddNetVat = addDutyRate > 0 || hasSurveillance;

      const unitCost =
        kdvBaz !== null
          ? shouldAddNetVat
            ? netVatPayable !== null
              ? kdvBaz + netVatPayable
              : null
            : kdvBaz
          : costs.gozetimsizMatrah;

        return {
          id: order.id,
          name: order.name ?? "Siparis",
          created_at: order.created_at,
          shipment_eta: orderEtaByOrder.get(order.id) ?? null,
          country,
          supplier_name: supplierName,
          extra_cost_percent: extraCostPercent,
          unit_price: avgUnitPrice,
          quantity: totalQty,
          unitCost,
        };
      });

    return rows.sort((a: any, b: any) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
    );
  })();

  const linkedOrdersWithPrev = linkedOrders.map((item, idx, arr) => {
    const prev = arr[idx + 1];
    const prevUnitCost = prev?.unitCost ?? null;
    const diffPct =
      prevUnitCost && item.unitCost !== null
        ? ((item.unitCost - prevUnitCost) / prevUnitCost) * 100
        : null;
    return { ...item, prevUnitCost, diffPct };
  });

  const warnings: string[] = [];
  if (!product.gtip_id) warnings.push("GTIP bagli degil");
  if (weightKg === null) warnings.push("Agirlik bulunamadi (niteliklerden)");

  return (
    <section className="space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[32px] border border-white/30 bg-gradient-to-r from-sky-500 via-emerald-500 to-indigo-600 px-6 py-6 text-white shadow-[0_25px_70px_-30px_rgba(15,61,62,0.6)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.15),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(255,255,255,0.12),transparent_30%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.35em] text-white/70">Ürün detayi</p>
            <h1 className="text-3xl font-semibold leading-tight [font-family:var(--font-display)]">{product.name}</h1>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 font-semibold">Kod: {product.code}</span>
              <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 font-semibold">
                GTIP: {(Array.isArray((product as any).gtip)
                  ? (product as any).gtip[0]?.code
                  : (product as any).gtip?.code) ?? "-"}
              </span>
              <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 font-semibold">Grup: {group?.name ?? "Yok"}</span>
              <span className="rounded-full border border-white/30 bg-white/15 px-3 py-1 font-semibold">
                Netsis kod: {product.netsis_stok_kodu ?? "-"}
              </span>
            </div>
            <div className="mt-3 inline-flex items-center gap-3 rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-sm backdrop-blur shadow-[0_14px_38px_-26px_rgba(15,61,62,0.8)]">
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] uppercase tracking-[0.2em] text-white/70">Netsis stok</span>
                <span className="text-2xl font-semibold text-white">{fmtInt(stockResult.value)}</span>
              </div>
              {stockResult.error ? (
                <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-amber-100">
                  {stockResult.error}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {canSeeFinance ? (
              <Link
                href={`/products/${product.id}/costs`}
                className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                Maliyet
              </Link>
            ) : null}
            {canEdit ? (
              <>
                <Link
                  href={`/products/${product.id}/edit`}
                  className="rounded-full border border-white/50 bg-transparent px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
                >
                  Düzenle
                </Link>
                <ConfirmActionForm
                  action={deleteProduct}
                  confirmText="Ürün silinsin mi? Bu islem geri alinamaz."
                  buttonText="Ürünu sil"
                  className="inline"
                  buttonClassName="rounded-full border border-white/50 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20"
                >
                  <input type="hidden" name="product_id" value={product.id} />
                </ConfirmActionForm>
              </>
            ) : null}
            <Link
              href="/products"
              className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20"
            >
              Listeye don
            </Link>
          </div>
        </div>
        <div className="relative mt-5 grid gap-3 md:grid-cols-4">
          {[
            ...(canSeeFinance
              ? [
                  {
                    label: "Birim fiyat",
                    value: product.unit_price ? `${fmt(product.unit_price)} USD` : "-",
                  },
                  { label: "Yurtici masraf %", value: fmt(product.domestic_cost_percent ?? 0) },
                ]
              : []),
            { label: "Agirlik (kg)", value: weightKg !== null ? fmt(weightKg) : "-" },
            { label: "GTIP ulke sayisi", value: (countryRates ?? []).length },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-white/25 bg-white/15 px-4 py-3 text-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-white/40"
            >
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/70">{item.label}</p>
              <p className="mt-2 text-lg font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {warnings.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">
          Eksikler: {warnings.join(", ")}
        </div>
      ) : null}

      {/* Attributes */}
      <div className="rounded-2xl border border-black/10 bg-white/90 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Nitelikler</p>
          <span className="text-xs text-black/50">{mergedAttributeCards.length} alan</span>
        </div>
        {mergedAttributeCards.length ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {mergedAttributeCards.map((attr) => (
              <div
                key={attr.key}
                className="rounded-xl border border-black/8 bg-gradient-to-br from-slate-50 via-white to-slate-100 px-3 py-2 text-sm shadow-[0_10px_24px_-18px_rgba(15,61,62,0.4)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(15,61,62,0.45)]"
              >
                <p className="text-[11px] font-semibold text-black/60">
                  {attr.name}
                  {attr.unit ? ` (${attr.unit})` : ""}
                </p>
                <p className="mt-1 text-sm font-semibold text-black">{attr.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
            Kategori secilmedi veya nitelik yok.
          </div>
        )}
      </div>

      {/* Linked orders */}
      <div className="rounded-[30px] border border-black/10 bg-white/95 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">Bagli siparisler</p>
          <span className="text-xs text-black/50">{linkedOrders.length} siparis</span>
        </div>
        {linkedOrders.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.3em] text-black/40">
                <tr>
                  <th className="px-3 py-2">Siparis</th>
                  <th className="px-3 py-2">Tarih</th>
                  {canSeeFinance ? <th className="px-3 py-2 text-right">Birim fiyat</th> : null}
                  <th className="px-3 py-2 text-right">Adet</th>
                      {role !== "Satis" ? <th className="px-3 py-2">Tedarikçi</th> : null}
                    <th className="px-3 py-2 text-right">Ulke</th>
                    {canSeeFinance ? (
                      <th className="px-3 py-2 text-right">Ekstra masraf (%)</th>
                    ) : null}
                  {canSeeFinance ? <th className="px-3 py-2 text-right">Birim maliyet*</th> : null}
                  {canSeeFinance ? (
                    <th className="px-3 py-2 text-right">Önceki sip. fark (%)</th>
                  ) : null}
                  <th className="px-3 py-2 text-right">Islem</th>
                </tr>
              </thead>
              <tbody className="text-black/70">
                {linkedOrdersWithPrev.map((linked, idx) => (
                  <tr
                    key={linked.id}
                    className={`border-t border-black/5 transition hover:-translate-y-0.5 hover:bg-slate-50 ${
                      idx % 2 === 0 ? "bg-slate-50/40" : "bg-white"
                    }`}
                  >
                    <td className="px-3 py-3 text-sm font-semibold text-black">
                      <Link href={`/orders/${linked.id}`} className="text-black transition hover:text-[var(--ocean)]">
                        {linked.name ?? "Siparis"}
                      </Link>
                    </td>
                    <td className="px-3 py-3">{fmtDate(linked.shipment_eta)}</td>
                    {canSeeFinance ? (
                      <td className="px-3 py-3 text-right">{fmt(linked.unit_price)}</td>
                    ) : null}
                    <td className="px-3 py-3 text-right">{linked.quantity ?? "-"}</td>
                      {role !== "Satis" ? (
                        <td className="px-3 py-3">{linked.supplier_name ?? "-"}</td>
                      ) : null}
                      <td className="px-3 py-3 text-right">{linked.country ?? "-"}</td>
                    {canSeeFinance ? (
                      <td className="px-3 py-3 text-right">{fmtPercent(linked.extra_cost_percent)}</td>
                    ) : null}
                    {canSeeFinance ? (
                      <td className="px-3 py-3 text-right font-semibold">{fmt(linked.unitCost)}</td>
                    ) : null}
                    {canSeeFinance ? (
                      <td className="px-3 py-3 text-right">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                            linked.diffPct === null
                              ? "bg-slate-100 text-black/50"
                              : linked.diffPct > 0
                              ? "bg-red-100 text-red-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {fmtPercent(linked.diffPct)}
                        </span>
                      </td>
                    ) : null}
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/orders/${linked.id}`}
                        className="rounded-full border border-black/15 px-3 py-1 text-xs font-semibold text-black/70 transition hover:-translate-y-0.5 hover:border-black/30"
                      >
                        Detay
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-black/50">
              *Birim maliyet: siparis birim fiyati + tedarikci ulkesine ozel GTIP oranlari ile KDVsiz tahmini maliyet. Fark: bir onceki siparise gore yuzde degisim.
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-black/10 bg-[var(--sand)] px-4 py-3 text-sm text-black/70">
            Henüz bu urune bagli siparis yok.
          </div>
        )}
      </div>

      {/* Supplier aliases */}
      <div className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">Tedarikçi urun adlari</p>
          <form action={createSupplierProductAlias} className="flex flex-wrap gap-2">
            <input type="hidden" name="product_id" value={product.id} />
            <select
              name="supplier_id"
              className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-xs"
            >
              <option value="">Tedarikçi sec</option>
              {suppliers?.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
            <input
              name="supplier_name"
              placeholder="Tedarikçi urun adi"
              className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-xs"
            />
            <button className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-md">
              Ekle
            </button>
          </form>
        </div>

        {aliases?.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.3em] text-black/40">
                <tr>
                  <th className="px-3 py-2">Tedarikçi</th>
                  <th className="px-3 py-2">Ürün adi</th>
                  <th className="px-3 py-2 text-right">Islem</th>
                </tr>
              </thead>
              <tbody className="text-black/70">
                {aliases.map((alias) => (
                  <tr key={alias.id} className="border-t border-black/5">
                    <td className="px-3 py-3 text-sm font-semibold text-black">
                      {(Array.isArray((alias as any).supplier)
                        ? (alias as any).supplier[0]?.name
                        : (alias as any).supplier?.name) ?? "-"}
                    </td>
                    <td className="px-3 py-3">{alias.supplier_name}</td>
                      <td className="px-3 py-3 text-right">
                        <ConfirmActionForm
                          action={deleteSupplierProductAlias}
                          confirmText="Tedarikçi urun adi silinsin mi?"
                          buttonText="Sil"
                          className="inline"
                        >
                          <input type="hidden" name="id" value={alias.id} />
                          <input type="hidden" name="product_id" value={product.id} />
                        </ConfirmActionForm>
                      </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-black/10 bg-[var(--sand)] px-4 py-3 text-sm text-black/70">
            Tedarikçi urun adi bulunamadi.
          </div>
        )}
      </div>
    </section>
  );
}




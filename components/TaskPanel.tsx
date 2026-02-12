import { closeTask } from "@/app/actions/tasks";
import { resolveAlert } from "@/app/actions/alerts";
import { updateOrderStatus } from "@/app/actions/orders";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const taskLabels: Record<string, string> = {
  eta_approaching: "ETA yaklasiyor",
  bl_missing: "BL bekleniyor",
  delay_check: "Gecikti kontrol et",
};

export default async function TaskPanel() {
  const supabase = await createSupabaseServerClient();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, task_type, shipment_id, shipments(file_no)")
    .eq("status", "Acik")
    .order("created_at", { ascending: false });

  const productionEvents = [
    "order_missing_ready_date",
    "order_ready_in_5d",
    "order_ready_in_3d",
    "order_ready_in_0d",
    "order_ready_overdue",
  ];

  const { data: alerts } = await supabase
    .from("alerts")
    .select(
      "id, event_type, order_id, payload, created_at, orders(name, expected_ready_date, suppliers(name))"
    )
    .eq("status", "pending")
    .in("event_type", productionEvents)
    .order("created_at", { ascending: false })
    .limit(20);

  const toYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toYmd(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowIso = toYmd(tomorrow);

  const { data: readyTodayRaw } = await supabase
    .from("orders")
    .select("id, name, expected_ready_date, order_status, suppliers(name)")
    .gte("expected_ready_date", todayIso)
    .lt("expected_ready_date", tomorrowIso)
    .order("created_at", { ascending: false });

  const { data: overdueRaw } = await supabase
    .from("orders")
    .select("id, name, expected_ready_date, order_status, suppliers(name)")
    .lt("expected_ready_date", todayIso)
    .order("expected_ready_date", { ascending: true })
    .limit(20);

  const producedStatuses = ["hazir"];
  const readyToday = (readyTodayRaw ?? []).filter(
    (o) => !producedStatuses.includes((o.order_status ?? "").toLowerCase())
  );
  const overdueOrders = (overdueRaw ?? []).filter(
    (o) => !producedStatuses.includes((o.order_status ?? "").toLowerCase())
  );

  const hasContent =
    (tasks?.length ?? 0) > 0 ||
    (alerts?.length ?? 0) > 0 ||
    (readyToday?.length ?? 0) > 0 ||
    (overdueOrders?.length ?? 0) > 0;

  return (
    <details className="fixed bottom-6 right-6 z-20 w-80 rounded-2xl border border-black/10 bg-white/90 p-4 shadow-lg backdrop-blur animate-[fade-up_700ms_ease-out]">
      <summary className="cursor-pointer list-none text-sm font-semibold">
        Gorev paneli
      </summary>
      <div className="mt-4 space-y-3 text-sm text-black/70">
        {readyToday?.length ? (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">
              Bugun hazir olacaklar
            </p>
            {readyToday.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-black/10 bg-[var(--peach)]/60 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <a
                      href={`/orders/${order.id}`}
                      className="font-semibold text-black hover:underline"
                    >
                      {order.name ?? "Siparis"}
                    </a>
                    <p className="text-[11px] text-black/60">
                      {(Array.isArray((order as any).suppliers)
                        ? (order as any).suppliers[0]?.name
                        : (order as any).suppliers?.name) ?? "Tedarikçi yok"}
                    </p>
                  </div>
                  <form action={updateOrderStatus}>
                    <input type="hidden" name="order_id" value={order.id} />
                    <input type="hidden" name="order_status" value="Hazir" />
                    <button className="rounded-full border border-black/20 bg-white px-3 py-1 text-[11px] font-semibold">
                      Uretildi
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {overdueOrders?.length ? (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">
              Geciken uretimler
            </p>
            {overdueOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-black/10 bg-[var(--peach)]/80 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <a
                      href={`/orders/${order.id}`}
                      className="font-semibold text-black hover:underline"
                    >
                      {order.name ?? "Siparis"}
                    </a>
                    <p className="text-[11px] text-black/60">
                      Hazir olma: {order.expected_ready_date ?? "-"}
                    </p>
                  </div>
                  <form action={updateOrderStatus}>
                    <input type="hidden" name="order_id" value={order.id} />
                    <input type="hidden" name="order_status" value="Hazir" />
                    <button className="rounded-full border border-black/20 bg-white px-3 py-1 text-[11px] font-semibold">
                      Uretildi
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {alerts?.length ? (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">
              Uretim uyarilari
            </p>
            {alerts.map((alert) => {
              const orderName =
                (Array.isArray((alert as any).orders)
                  ? (alert as any).orders[0]?.name
                  : (alert as any).orders?.name) ??
                (alert.payload?.order_name as string | undefined) ??
                "Siparis";
              const readyDate =
                (Array.isArray((alert as any).orders)
                  ? (alert as any).orders[0]?.expected_ready_date
                  : (alert as any).orders?.expected_ready_date) ??
                (alert.payload?.ready_date as string | undefined) ??
                "-";
              return (
                <div
                  key={alert.id}
                  className="rounded-xl border border-black/10 bg-[var(--mint)]/60 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-black">{orderName}</p>
                      <p className="text-[11px] text-black/60">
                        Durum: {alert.event_type.replaceAll("_", " ")}
                      </p>
                      <p className="text-[11px] text-black/60">
                        Hazir: {readyDate}
                      </p>
                    </div>
                    <form action={resolveAlert}>
                      <input type="hidden" name="alert_id" value={alert.id} />
                      <button className="rounded-full border border-black/20 px-3 py-1 text-[11px]">
                        Kapat
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {tasks?.length ? (
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">
              Klasik gorevler
            </p>
            {tasks.map((task) => (
              <div
                key={task.id}
                className="rounded-xl border border-black/10 bg-[var(--sand)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-black">
                      {taskLabels[task.task_type] ?? "Gorev"}
                    </p>
                    <p className="text-xs text-black/60">
                      {(Array.isArray((task as any).shipments)
                        ? (task as any).shipments[0]?.file_no
                        : (task as any).shipments?.file_no) ?? task.shipment_id}
                    </p>
                  </div>
                  <form action={closeTask}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button className="rounded-full border border-black/20 px-3 py-1 text-xs">
                      Kapat
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!hasContent ? (
          <div className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs text-black/60">
            Acik gorev bulunmuyor.
          </div>
        ) : null}
      </div>
    </details>
  );
}



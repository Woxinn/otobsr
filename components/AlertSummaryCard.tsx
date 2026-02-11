type Props = {
  pending?: number;
  sentToday?: number;
  errors?: number;
};

export default function AlertSummaryCard({
  pending = 0,
  sentToday = 0,
  errors = 0,
}: Props) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[var(--peach)]/60 p-4 text-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-black/50">
        Uyarilar
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-black/70">
          Bekleyen: {pending}
        </span>
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-black/70">
          Bugun gonderilen: {sentToday}
        </span>
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-black/70">
          Hata: {errors}
        </span>
      </div>
    </div>
  );
}

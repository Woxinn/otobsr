import { getAppVersionText } from "@/lib/app-version";

export default function AppVersionBadge({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-black/45 ${className}`.trim()}
      title="Uygulama versiyonu"
    >
      {getAppVersionText()}
    </span>
  );
}

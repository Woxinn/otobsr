"use client";

type Props = {
  filledOnly: boolean;
  needOnly: boolean;
  queryString: string; // current query part starting with ? or empty
};

const buildToggledUrl = (queryString: string, key: string, enabled: boolean) => {
  const params = new URLSearchParams(queryString.startsWith("?") ? queryString.slice(1) : queryString);
  if (enabled) params.set(key, "1");
  else params.delete(key);
  params.delete("page"); // sayfa başa dön
  const qs = params.toString();
  return qs ? `/siparis-plani?${qs}` : "/siparis-plani";
};

export default function OrderPlanFilterBar({ filledOnly, needOnly, queryString }: Props) {
  const filledUrl = buildToggledUrl(queryString, "filledOnly", !filledOnly);
  const needUrl = buildToggledUrl(queryString, "needOnly", !needOnly);

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-black/70">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-black/30"
          checked={filledOnly}
          readOnly
          onClick={() => (window.location.href = filledUrl)}
        />
        Sadece plan girilmiş ürünler
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-black/30"
          checked={needOnly}
          readOnly
          onClick={() => (window.location.href = needUrl)}
        />
        Sadece ihtiyaç &gt; 0 olanlar
      </label>
    </div>
  );
}


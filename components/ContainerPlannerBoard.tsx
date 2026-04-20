"use client";

import { useMemo, useState } from "react";

export type PlannerLoad = {
  id: string;
  orderId: string;
  orderLabel: string;
  supplierName: string;
  productCode: string;
  productName: string;
  quantity: number;
  grossKg: number;
  cbm: number | null;
  priority: "normal" | "high";
};

type ContainerType = "20GP" | "40HC" | "LCL";

type ContainerUnit = {
  id: string;
  name: string;
  type: ContainerType;
  maxGrossKg: number;
  maxCbm: number;
  loadIds: string[];
};

type OrderGroup = {
  orderId: string;
  orderLabel: string;
  supplierName: string;
  loadIds: string[];
  totalKg: number;
  totalCbm: number;
};

type Props = {
  initialLoads: PlannerLoad[];
};

const CONTAINER_PRESETS: Record<ContainerType, { maxGrossKg: number; maxCbm: number }> = {
  "20GP": { maxGrossKg: 28000, maxCbm: 33 },
  "40HC": { maxGrossKg: 28600, maxCbm: 76 },
  LCL: { maxGrossKg: 12000, maxCbm: 15 },
};

const formatNumber = (value: number, digits = 1) =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: digits });

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

const toOrderGroups = (
  loadIds: string[],
  loadMap: Map<string, PlannerLoad>,
  effectiveGrossById: Map<string, number>
) => {
  const map = new Map<string, OrderGroup>();
  loadIds.forEach((id) => {
    const load = loadMap.get(id);
    if (!load) return;
    const effectiveGross = effectiveGrossById.get(id) ?? load.grossKg;
    const existing = map.get(load.orderId);
    if (!existing) {
      map.set(load.orderId, {
        orderId: load.orderId,
        orderLabel: load.orderLabel,
        supplierName: load.supplierName,
        loadIds: [id],
        totalKg: effectiveGross,
        totalCbm: load.cbm ?? 0,
      });
      return;
    }
    existing.loadIds.push(id);
    existing.totalKg += effectiveGross;
    existing.totalCbm += load.cbm ?? 0;
  });
  return Array.from(map.values()).sort((a, b) => b.totalKg - a.totalKg);
};

const getLoadIdsByOrder = (
  orderId: string,
  source: { type: "pool" } | { type: "container"; containerId: string },
  unassignedIds: string[],
  containers: ContainerUnit[],
  loadMap: Map<string, PlannerLoad>
) => {
  if (source.type === "pool") {
    return unassignedIds.filter((id) => loadMap.get(id)?.orderId === orderId);
  }
  const container = containers.find((c) => c.id === source.containerId);
  if (!container) return [];
  return container.loadIds.filter((id) => loadMap.get(id)?.orderId === orderId);
};

export default function ContainerPlannerBoard({ initialLoads }: Props) {
  const [loads] = useState<PlannerLoad[]>(initialLoads);
  const [loadWeightOverrides, setLoadWeightOverrides] = useState<Record<string, number>>({});
  const [orderWeightOverrides, setOrderWeightOverrides] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [onlyMissingWeight, setOnlyMissingWeight] = useState(false);
  const [unassignedIds, setUnassignedIds] = useState<string[]>(() => initialLoads.map((item) => item.id));
  const [containers, setContainers] = useState<ContainerUnit[]>([
    { id: "ctr-1", name: "Konteyner #1", type: "40HC", ...CONTAINER_PRESETS["40HC"], loadIds: [] },
  ]);
  const [selectedType, setSelectedType] = useState<ContainerType>("40HC");
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());
  const [infoMessage, setInfoMessage] = useState<string>(
    "Hazir: Siparis kartini tumuyle ya da altindaki urunleri tek tek surukleyebilirsiniz."
  );

  const loadMap = useMemo(() => new Map(loads.map((item) => [item.id, item])), [loads]);
  const orderIdToLoadIds = useMemo(() => {
    const map = new Map<string, string[]>();
    loads.forEach((load) => {
      const existing = map.get(load.orderId);
      if (existing) existing.push(load.id);
      else map.set(load.orderId, [load.id]);
    });
    return map;
  }, [loads]);

  const effectiveGrossById = useMemo(() => {
    const map = new Map<string, number>();
    loads.forEach((load) => map.set(load.id, load.grossKg));

    Object.entries(orderWeightOverrides).forEach(([orderId, totalWeight]) => {
      if (!Number.isFinite(totalWeight) || totalWeight < 0) return;
      const ids = orderIdToLoadIds.get(orderId) ?? [];
      if (!ids.length) return;
      const weightBase = ids.reduce((sum, id) => {
        const qty = Math.max(loadMap.get(id)?.quantity ?? 0, 0);
        return sum + (qty > 0 ? qty : 1);
      }, 0);
      const safeBase = weightBase > 0 ? weightBase : ids.length;
      ids.forEach((id) => {
        const qty = Math.max(loadMap.get(id)?.quantity ?? 0, 0);
        const ratioBase = qty > 0 ? qty : 1;
        map.set(id, (totalWeight * ratioBase) / safeBase);
      });
    });

    Object.entries(loadWeightOverrides).forEach(([loadId, weight]) => {
      if (!Number.isFinite(weight) || weight < 0) return;
      if (map.has(loadId)) map.set(loadId, weight);
    });

    return map;
  }, [loads, loadMap, loadWeightOverrides, orderWeightOverrides, orderIdToLoadIds]);

  const poolOrderGroups = useMemo(
    () => toOrderGroups(unassignedIds, loadMap, effectiveGrossById),
    [unassignedIds, loadMap, effectiveGrossById]
  );
  const supplierOptions = useMemo(
    () =>
      Array.from(new Set(loads.map((load) => load.supplierName).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "tr")
      ),
    [loads]
  );
  const filteredPoolOrderGroups = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase("tr");
    return poolOrderGroups.filter((group) => {
      if (supplierFilter !== "all" && group.supplierName !== supplierFilter) return false;

      if (onlyMissingWeight) {
        const hasMissing = group.loadIds.some((id) => (effectiveGrossById.get(id) ?? 0) <= 0);
        if (!hasMissing) return false;
      }

      if (!q) return true;
      if (
        group.orderLabel.toLocaleLowerCase("tr").includes(q) ||
        group.supplierName.toLocaleLowerCase("tr").includes(q)
      ) {
        return true;
      }
      return group.loadIds.some((id) => {
        const load = loadMap.get(id);
        if (!load) return false;
        return (
          load.productCode.toLocaleLowerCase("tr").includes(q) ||
          load.productName.toLocaleLowerCase("tr").includes(q)
        );
      });
    });
  }, [poolOrderGroups, supplierFilter, onlyMissingWeight, searchQuery, effectiveGrossById, loadMap]);

  const askWeight = (title: string, currentValue: number) => {
    const raw = window.prompt(
      `${title}\nYeni brut kg girin.\n- Bos birakirsan manuel agirlik temizlenir.`,
      currentValue > 0 ? String(currentValue) : ""
    );
    if (raw === null) return { cancelled: true as const };
    const text = raw.trim();
    if (!text) return { clear: true as const };
    const value = Number(text.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) return { invalid: true as const };
    return { value } as const;
  };

  const handleLoadWeightOverride = (loadId: string) => {
    const load = loadMap.get(loadId);
    if (!load) return;
    const current = effectiveGrossById.get(loadId) ?? load.grossKg;
    const result = askWeight(`${load.productCode} - ${load.productName}`, current);
    if ("cancelled" in result) return;
    if ("invalid" in result) {
      setInfoMessage("Gecersiz agirlik girdiniz. Lutfen 0 veya pozitif sayi girin.");
      return;
    }
    if ("clear" in result) {
      setLoadWeightOverrides((prev) => {
        const next = { ...prev };
        delete next[loadId];
        return next;
      });
      setInfoMessage(`${load.productCode} icin manuel agirlik temizlendi.`);
      return;
    }
    setLoadWeightOverrides((prev) => ({ ...prev, [loadId]: result.value }));
    setInfoMessage(`${load.productCode} icin manuel agirlik ${formatNumber(result.value, 3)} kg olarak kaydedildi.`);
  };

  const handleOrderWeightOverride = (orderId: string, orderLabel: string) => {
    const ids = orderIdToLoadIds.get(orderId) ?? [];
    if (!ids.length) return;
    const current = ids.reduce((sum, id) => sum + (effectiveGrossById.get(id) ?? 0), 0);
    const result = askWeight(`${orderLabel} (siparis toplam brut kg)`, current);
    if ("cancelled" in result) return;
    if ("invalid" in result) {
      setInfoMessage("Gecersiz agirlik girdiniz. Lutfen 0 veya pozitif sayi girin.");
      return;
    }
    if ("clear" in result) {
      setOrderWeightOverrides((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      setInfoMessage(`${orderLabel} icin manuel siparis agirligi temizlendi.`);
      return;
    }
    setOrderWeightOverrides((prev) => ({ ...prev, [orderId]: result.value }));
    setInfoMessage(`${orderLabel} toplam agirligi ${formatNumber(result.value, 3)} kg olarak ayarlandi.`);
  };

  const moveLoadIds = (loadIds: string[], targetContainerId: string | "pool") => {
    if (!loadIds.length) return;
    const idSet = new Set(loadIds);

    if (targetContainerId !== "pool") {
      const target = containers.find((item) => item.id === targetContainerId);
      if (!target) return;
      const targetSet = new Set(target.loadIds);
      const currentGross = target.loadIds.reduce((sum, id) => sum + (effectiveGrossById.get(id) ?? 0), 0);
      const currentCbm = target.loadIds.reduce((sum, id) => sum + (loadMap.get(id)?.cbm ?? 0), 0);
      const incomingGross = loadIds.reduce((sum, id) => {
        if (targetSet.has(id)) return sum;
        return sum + (effectiveGrossById.get(id) ?? 0);
      }, 0);
      const incomingCbm = loadIds.reduce((sum, id) => {
        if (targetSet.has(id)) return sum;
        return sum + (loadMap.get(id)?.cbm ?? 0);
      }, 0);
      const nextGross = currentGross + incomingGross;
      const nextCbm = currentCbm + incomingCbm;
      if (nextGross > target.maxGrossKg) {
        setInfoMessage(
          `${target.name}: Brut kg limiti asiliyor (${formatNumber(nextGross)} / ${formatNumber(target.maxGrossKg)} kg).`
        );
        return;
      }
      if (nextCbm > target.maxCbm) {
        setInfoMessage(`${target.name}: CBM limiti asiliyor (${formatNumber(nextCbm)} / ${formatNumber(target.maxCbm)} cbm).`);
        return;
      }
    }

    setContainers((prev) =>
      prev.map((container) => {
        const cleaned = container.loadIds.filter((id) => !idSet.has(id));
        if (container.id !== targetContainerId) return { ...container, loadIds: cleaned };
        const merged = [...cleaned, ...loadIds];
        return { ...container, loadIds: Array.from(new Set(merged)) };
      })
    );

    setUnassignedIds((prev) => {
      if (targetContainerId === "pool") return Array.from(new Set([...prev, ...loadIds]));
      return prev.filter((id) => !idSet.has(id));
    });
  };

  const moveLoad = (loadId: string, targetContainerId: string | "pool") => {
    moveLoadIds([loadId], targetContainerId);
    const load = loadMap.get(loadId);
    if (!load) return;
    setInfoMessage(
      `${load.productCode} ${targetContainerId === "pool" ? "havuz" : "konteyner"} alanina tasindi.`
    );
  };

  const moveOrder = (
    orderId: string,
    source: { type: "pool" } | { type: "container"; containerId: string },
    targetContainerId: string | "pool"
  ) => {
    const orderLoadIds = getLoadIdsByOrder(orderId, source, unassignedIds, containers, loadMap);
    if (!orderLoadIds.length) return;
    moveLoadIds(orderLoadIds, targetContainerId);
    const groupSourceLabel = source.type === "pool" ? "havuz" : "konteyner";
    setInfoMessage(
      `${orderLoadIds.length} kalemlik siparis ${groupSourceLabel} alanindan ${
        targetContainerId === "pool" ? "havuz" : "konteyner"
      } alanina tasindi.`
    );
  };

  const addContainer = () => {
    const seq = containers.length + 1;
    const preset = CONTAINER_PRESETS[selectedType];
    setContainers((prev) => [
      ...prev,
      {
        id: `ctr-${Date.now()}-${seq}`,
        name: `Konteyner #${seq}`,
        type: selectedType,
        maxGrossKg: preset.maxGrossKg,
        maxCbm: preset.maxCbm,
        loadIds: [],
      },
    ]);
  };

  const autoPlan = () => {
    const sortedLoadIds = [...unassignedIds].sort(
      (a, b) => (effectiveGrossById.get(b) ?? 0) - (effectiveGrossById.get(a) ?? 0)
    );
    if (!sortedLoadIds.length) {
      setInfoMessage("Havuzda yerlestirilecek yuk kalmadi.");
      return;
    }

    const nextContainers = containers.map((container) => ({ ...container, loadIds: [...container.loadIds] }));
    const stillUnassigned: string[] = [];

    for (const loadId of sortedLoadIds) {
      const load = loadMap.get(loadId);
      if (!load) continue;
      const loadGross = effectiveGrossById.get(load.id) ?? load.grossKg;
      let placed = false;
      for (const container of nextContainers) {
        const gross = container.loadIds.reduce((sum, id) => sum + (effectiveGrossById.get(id) ?? 0), 0) + loadGross;
        const cbm = container.loadIds.reduce((sum, id) => sum + (loadMap.get(id)?.cbm ?? 0), 0) + (load.cbm ?? 0);
        if (gross <= container.maxGrossKg && cbm <= container.maxCbm) {
          container.loadIds.push(loadId);
          placed = true;
          break;
        }
      }
      if (!placed) stillUnassigned.push(loadId);
    }

    setContainers(nextContainers);
    setUnassignedIds(stillUnassigned);
    setInfoMessage(`Otomatik plan tamamlandi. Yerlesmeyen yuk: ${stillUnassigned.length}`);
  };

  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const totalAssigned = containers.reduce((sum, container) => sum + container.loadIds.length, 0);
  const overrideCount = Object.keys(loadWeightOverrides).length + Object.keys(orderWeightOverrides).length;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedType}
            onChange={(event) => setSelectedType(event.target.value as ContainerType)}
            className="rounded-full border border-black/15 bg-white px-3 py-2 text-xs font-semibold text-black/70"
          >
            <option value="20GP">20GP</option>
            <option value="40HC">40HC</option>
            <option value="LCL">LCL</option>
          </select>
          <button
            type="button"
            onClick={addContainer}
            className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white"
          >
            + Konteyner ekle
          </button>
          <button
            type="button"
            onClick={autoPlan}
            className="rounded-full border border-black/15 bg-white px-4 py-2 text-xs font-semibold text-black/75"
          >
            Otomatik plan oner
          </button>
          <span className="rounded-full border border-black/10 bg-[var(--sand)] px-3 py-1 text-[11px] font-semibold text-black/65">
            Toplam kalem: {loads.length}
          </span>
          <span className="rounded-full border border-black/10 bg-[var(--mint)] px-3 py-1 text-[11px] font-semibold text-black/65">
            Yerlesen: {totalAssigned}
          </span>
          <span className="rounded-full border border-black/10 bg-[var(--peach)] px-3 py-1 text-[11px] font-semibold text-black/65">
            Havuz: {unassignedIds.length}
          </span>
          <span className="rounded-full border border-black/10 bg-[var(--sand)] px-3 py-1 text-[11px] font-semibold text-black/65">
            Siparis: {poolOrderGroups.length}
          </span>
          {overrideCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                setLoadWeightOverrides({});
                setOrderWeightOverrides({});
                setInfoMessage("Tum manuel agirlik override degerleri temizlendi.");
              }}
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700"
            >
              Override temizle ({overrideCount})
            </button>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-black/60">{infoMessage}</p>
        <p className="mt-1 text-[11px] text-black/45">
          Ipucu: Kaleme cift tikla = kalem agirligi, siparis kartina cift tikla = siparis toplam agirligi (yalnizca bu sayfa).
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_2fr]">
        <section
          className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const loadId = event.dataTransfer.getData("text/load-id");
            const orderId = event.dataTransfer.getData("text/order-id");
            const source = event.dataTransfer.getData("text/order-source");
            if (loadId) {
              moveLoad(loadId, "pool");
              return;
            }
            if (orderId) {
              if (source === "pool") moveOrder(orderId, { type: "pool" }, "pool");
              if (source.startsWith("container:")) {
                const containerId = source.replace("container:", "");
                moveOrder(orderId, { type: "container", containerId }, "pool");
              }
            }
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-black">Siparis Havuzu</h3>
            <span className="text-xs text-black/50">
              {filteredPoolOrderGroups.length}/{poolOrderGroups.length} siparis
            </span>
          </div>
          <div className="mb-3 grid gap-2 md:grid-cols-3">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Siparis, tedarikci, urun kodu/adi ara"
              className="rounded-xl border border-black/15 bg-white px-3 py-2 text-xs text-black/75"
            />
            <select
              value={supplierFilter}
              onChange={(event) => setSupplierFilter(event.target.value)}
              className="rounded-xl border border-black/15 bg-white px-3 py-2 text-xs text-black/75"
            >
              <option value="all">Tum tedarikciler</option>
              {supplierOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-black/15 bg-white px-3 py-2 text-xs text-black/75">
              <input
                type="checkbox"
                checked={onlyMissingWeight}
                onChange={(event) => setOnlyMissingWeight(event.target.checked)}
              />
              Sadece 0 kg olanlar
            </label>
          </div>

          <div className="max-h-[64vh] space-y-2 overflow-y-auto pr-1">
            {filteredPoolOrderGroups.map((group) => {
              const isOpen = expandedOrderIds.has(group.orderId);
              const hasOrderOverride = orderWeightOverrides[group.orderId] !== undefined;
              return (
                <article key={group.orderId} className="rounded-2xl border border-black/10 bg-[var(--sand)]/25 p-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleOrderExpand(group.orderId)}
                      className="h-8 w-8 rounded-full border border-black/15 text-xs text-black/70"
                    >
                      {isOpen ? "-" : "+"}
                    </button>
                    <div
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/order-id", group.orderId);
                        event.dataTransfer.setData("text/order-source", "pool");
                      }}
                      onDoubleClick={() => handleOrderWeightOverride(group.orderId, group.orderLabel)}
                      className="flex-1 cursor-grab rounded-xl border border-black/10 bg-white px-3 py-2 active:cursor-grabbing"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-black/80">{group.orderLabel}</p>
                        <div className="flex items-center gap-1">
                          {hasOrderOverride ? (
                            <span className="rounded-full bg-amber-100 px-2 py-[2px] text-[10px] font-semibold text-amber-700">
                              manuel siparis kg
                            </span>
                          ) : null}
                          <span className="rounded-full bg-black/10 px-2 py-[2px] text-[10px] font-semibold text-black/70">
                            {group.loadIds.length} kalem
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-black/55">{group.supplierName}</p>
                      <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold text-black/70">
                        <span className="rounded-full bg-black/10 px-2 py-[2px]">{formatNumber(group.totalKg, 2)} kg</span>
                        <span className="rounded-full bg-black/10 px-2 py-[2px]">{formatNumber(group.totalCbm, 3)} cbm</span>
                      </div>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="mt-2 space-y-1.5 pl-10">
                      {group.loadIds.map((id) => {
                        const load = loadMap.get(id);
                        if (!load) return null;
                        const hasLoadOverride = loadWeightOverrides[id] !== undefined;
                        return (
                          <div
                            key={id}
                            draggable
                            onDragStart={(event) => event.dataTransfer.setData("text/load-id", id)}
                            onDoubleClick={() => handleLoadWeightOverride(id)}
                            className="cursor-grab rounded-xl border border-black/10 bg-white px-3 py-2 text-[11px] text-black/70 active:cursor-grabbing"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-black/80">
                                {load.productCode} - {load.productName}
                              </p>
                              <div className="flex items-center gap-1">
                                {hasLoadOverride ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-[2px] text-[10px] font-semibold text-amber-700">
                                    manuel
                                  </span>
                                ) : null}
                                <span className="rounded-full bg-black/10 px-2 py-[2px] text-[10px] font-semibold">
                                  {formatNumber(effectiveGrossById.get(id) ?? load.grossKg, 2)} kg
                                </span>
                              </div>
                            </div>
                            <p className="mt-1 text-[10px] text-black/55">Adet {formatNumber(load.quantity, 0)}</p>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}

            {poolOrderGroups.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-black/15 p-4 text-center text-xs text-black/50">
                Havuz bos. Tum kalemler konteynere yerlesti.
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {containers.map((container) => {
            const assignedLoads = container.loadIds.map((id) => loadMap.get(id)).filter(Boolean) as PlannerLoad[];
            const assignedGroups = toOrderGroups(container.loadIds, loadMap, effectiveGrossById);
            const gross = assignedLoads.reduce((sum, item) => sum + (effectiveGrossById.get(item.id) ?? item.grossKg), 0);
            const cbm = assignedLoads.reduce((sum, item) => sum + (item.cbm ?? 0), 0);
            const grossPct = clampPercent((gross / Math.max(container.maxGrossKg, 1)) * 100);
            const cbmPct = clampPercent((cbm / Math.max(container.maxCbm, 1)) * 100);

            return (
              <div
                key={container.id}
                className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const loadId = event.dataTransfer.getData("text/load-id");
                  const orderId = event.dataTransfer.getData("text/order-id");
                  const source = event.dataTransfer.getData("text/order-source");

                  if (loadId) {
                    moveLoad(loadId, container.id);
                    return;
                  }
                  if (orderId) {
                    if (source === "pool") moveOrder(orderId, { type: "pool" }, container.id);
                    if (source.startsWith("container:")) {
                      const sourceContainerId = source.replace("container:", "");
                      moveOrder(orderId, { type: "container", containerId: sourceContainerId }, container.id);
                    }
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-black">{container.name}</h4>
                    <p className="text-[11px] text-black/55">
                      {container.type} - max {formatNumber(container.maxGrossKg, 0)} kg - {formatNumber(container.maxCbm, 1)} cbm
                    </p>
                  </div>
                  <span className="rounded-full border border-black/10 bg-[var(--sand)] px-2 py-1 text-[10px] font-semibold text-black/70">
                    {container.loadIds.length} kalem
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-black/55">
                      <span>Brut kg</span>
                      <span>
                        {formatNumber(gross, 1)} / {formatNumber(container.maxGrossKg, 0)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-black/10">
                      <div
                        className={`h-2 rounded-full ${grossPct > 100 ? "bg-red-500" : "bg-[var(--ocean)]"}`}
                        style={{ width: `${Math.min(grossPct, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-black/55">
                      <span>CBM</span>
                      <span>
                        {formatNumber(cbm, 3)} / {formatNumber(container.maxCbm, 1)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-black/10">
                      <div
                        className={`h-2 rounded-full ${cbmPct > 100 ? "bg-red-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(cbmPct, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {assignedGroups.map((group) => (
                    <div
                      key={`${container.id}-${group.orderId}`}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/order-id", group.orderId);
                        event.dataTransfer.setData("text/order-source", `container:${container.id}`);
                      }}
                      onDoubleClick={() => handleOrderWeightOverride(group.orderId, group.orderLabel)}
                      className="cursor-grab rounded-2xl border border-black/10 bg-[var(--mint)]/20 p-3 active:cursor-grabbing"
                    >
                      {orderWeightOverrides[group.orderId] !== undefined ? (
                        <div className="mb-1">
                          <span className="rounded-full bg-amber-100 px-2 py-[2px] text-[10px] font-semibold text-amber-700">
                            manuel siparis kg
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-black/80">{group.orderLabel}</p>
                        <span className="rounded-full bg-black/10 px-2 py-[2px] text-[10px] font-semibold text-black/70">
                          {group.loadIds.length} kalem
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-black/55">{group.supplierName}</p>
                      <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold text-black/70">
                        <span className="rounded-full bg-black/10 px-2 py-[2px]">{formatNumber(group.totalKg, 2)} kg</span>
                        <span className="rounded-full bg-black/10 px-2 py-[2px]">{formatNumber(group.totalCbm, 3)} cbm</span>
                      </div>

                      <div className="mt-2 space-y-1">
                        {group.loadIds.map((id) => {
                          const load = loadMap.get(id);
                          if (!load) return null;
                          return (
                            <div
                              key={id}
                              draggable
                              onDragStart={(event) => event.dataTransfer.setData("text/load-id", id)}
                              onDoubleClick={() => handleLoadWeightOverride(id)}
                              className="rounded-lg border border-black/10 bg-white px-2 py-1 text-[10px] text-black/70"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-semibold text-black/80">{load.productCode}</p>
                                <div className="flex items-center gap-1">
                                  {loadWeightOverrides[id] !== undefined ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-[2px] text-[10px] font-semibold text-amber-700">
                                      manuel
                                    </span>
                                  ) : null}
                                  <span>{formatNumber(effectiveGrossById.get(id) ?? load.grossKg, 2)} kg</span>
                                </div>
                              </div>
                              <p className="text-black/55">{load.productName}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {assignedLoads.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-black/15 p-4 text-center text-xs text-black/50">
                      Bu konteyner bos. Havuzdan surukleyip birakin.
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

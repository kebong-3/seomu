import { useEffect, useState } from "react";
export const settlementKey = (section: string) => `seomu-settlement-v1-${section}`;
export function parseSettlement<T extends Record<string, string | Record<string, boolean>>>(raw: string | null, fallback: T): T {
  try {
    const saved = JSON.parse(raw || "null");
    if (!saved || saved.version !== 1 || !saved.data || typeof saved.data !== "object" || Array.isArray(saved.data)) return fallback;
    const data = saved.data;
    for (const [key, value] of Object.entries(fallback)) {
      if (typeof value === "string") { if (typeof data[key] !== "string" || data[key].length > 100000) return fallback; }
      else if (!data[key] || typeof data[key] !== "object" || Array.isArray(data[key]) || Object.values(data[key]).some(v => typeof v !== "boolean")) return fallback;
    }
    return Object.fromEntries(Object.keys(fallback).map(k => [k, data[k]])) as T;
  } catch { return fallback; }
}
export function useSettlementSession<T extends Record<string, string | Record<string, boolean>>>(section: string, initial: T) {
  const [data, setData] = useState<T>(() => { try { return parseSettlement(localStorage.getItem(settlementKey(section)), initial); } catch { return initial; } });
  const [saved, setSaved] = useState(false);
  useEffect(() => { try { localStorage.setItem(settlementKey(section), JSON.stringify({ version: 1, data })); setSaved(true); } catch { setSaved(false); } }, [data, section]);
  function field<K extends keyof T>(key: K) { return (value: T[K]) => setData(previous => ({ ...previous, [key]: value })); }
  return { data, field, saved, reset: () => setData(initial) };
}

import { procedureKey, validProcedure, type Procedure } from "./procedures";
import {
  parseProgress,
  progressKey,
  type ProcedureProgress,
} from "./procedure-progress";
export type ProcedureBundle = {
  kind: "seomu-procedure-bundle";
  version: 1;
  procedures: Procedure[];
  progress: ProcedureProgress;
};
export function parseProcedureBundle(raw: string): ProcedureBundle {
  if (raw.length > 2000000) throw Error("2MB 이하 파일을 선택하세요.");
  const d = JSON.parse(raw);
  if (
    !d?.progress ||
    d?.kind !== "seomu-procedure-bundle" ||
    d.version !== 1 ||
    !Array.isArray(d.procedures) ||
    d.procedures.length > 100 ||
    !d.procedures.every(validProcedure)
  )
    throw Error("기관 절차 묶음 형식이 올바르지 않습니다.");
  if (
    new Set(d.procedures.map((p: Procedure) => p.id)).size !==
    d.procedures.length
  )
    throw Error("파일에 중복 절차 ID가 있습니다.");
  const progress = parseProgress(JSON.stringify(d.progress));
  if (
    Object.keys(progress.records).some(
      (id) => !d.procedures.some((p: Procedure) => p.id === id),
    )
  )
    throw Error("절차가 없는 처리 기록이 있습니다.");
  return { kind: d.kind, version: 1, procedures: d.procedures, progress };
}
export function procedureBundle(
  items: Procedure[],
  progress: ProcedureProgress,
) {
  return parseProcedureBundle(
    JSON.stringify({
      kind: "seomu-procedure-bundle",
      version: 1,
      procedures: items,
      progress: {
        ...progress,
        records: Object.fromEntries(
          Object.entries(progress.records).filter(([id]) =>
            items.some((p) => p.id === id),
          ),
        ),
      },
    }),
  );
}
const titleKey = (title: string) =>
  title.trim().normalize("NFKC").toLocaleLowerCase();
export function planProcedureImport(
  bundle: ProcedureBundle,
  items: Procedure[],
  progress: ProcedureProgress,
) {
  const ids = new Set(items.map((p) => p.id)),
    titles = new Set(items.map((p) => titleKey(p.title)));
  const accepted: Procedure[] = [],
    excluded: Procedure[] = [];
  for (const p of bundle.procedures) {
    if (
      ids.has(p.id) ||
      titles.has(titleKey(p.title)) ||
      items.length + accepted.length >= 100
    ) {
      excluded.push(p);
      continue;
    }
    const { sourceDocument: previousServerDocument, ...portable } = p;
    void previousServerDocument;
    accepted.push(portable);
    ids.add(p.id);
    titles.add(titleKey(p.title));
  }
  const next: ProcedureProgress = {
    ...progress,
    records: Object.fromEntries(
      Object.entries(progress.records).filter(([id]) =>
        items.some((p) => p.id === id),
      ),
    ),
  };
  for (const p of accepted) {
    const r = bundle.progress.records[p.id];
    if (r)
      next.records[p.id] = { snapshot: r.snapshot, checks: [], note: r.note };
  }
  return { items: [...items, ...accepted], progress: next, accepted, excluded };
}
export function persistProcedureImport(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  items: Procedure[],
  progress: ProcedureProgress,
): { ok: boolean; rollbackFailed: boolean } {
  try {
    parseProgress(JSON.stringify(progress));
    if (
      items.length > 100 ||
      !items.every(validProcedure) ||
      new Set(items.map((p) => p.id)).size !== items.length
    )
      throw Error("invalid templates");
  } catch {
    return { ok: false, rollbackFailed: false };
  }
  let beforeItems: string | null, beforeProgress: string | null;
  try {
    beforeItems = storage.getItem(procedureKey);
    beforeProgress = storage.getItem(progressKey);
  } catch {
    return { ok: false, rollbackFailed: false };
  }
  try {
    storage.setItem(procedureKey, JSON.stringify(items));
    storage.setItem(progressKey, JSON.stringify(progress));
    return { ok: true, rollbackFailed: false };
  } catch {
    let rollbackFailed = false;
    for (const [key, value] of [
      [procedureKey, beforeItems],
      [progressKey, beforeProgress],
    ]) {
      try {
        if (value === null) storage.removeItem(key!);
        else storage.setItem(key!, value!);
      } catch {
        rollbackFailed = true;
      }
    }
    return { ok: false, rollbackFailed };
  }
}

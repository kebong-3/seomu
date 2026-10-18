import type { SituationCase } from "./situation-engine";
import { documentValues, stepPlan, outputIssues } from "./situation-engine";
import type { Procedure } from "./procedures";
import { exportWorkbook, workbookBlob } from "./excel-io";

const token = /\{\{([^{}\n]{1,100})\}\}/g;
export type InstitutionTemplate = {
  id: string;
  procedureId: string;
  name: string;
  data: ArrayBuffer;
  fields: string[];
};
function names(text: string) {
  return [...text.matchAll(token)].map((m) => m[1].trim());
}
function replace(text: string, values: Record<string, string>) {
  return text.replace(token, (_, k: string) => values[k.trim()] || `{{${k}}}`);
}
function checkArchive(buffer: ArrayBuffer) {
  if (buffer.byteLength > 8 * 1024 * 1024)
    throw Error("서식 파일은 8MB 이하로 선택하세요.");
  const v = new DataView(buffer);
  let entries = 0,
    total = 0;
  for (let i = 0; i + 46 <= v.byteLength; i++) {
    if (v.getUint32(i, true) !== 0x02014b50) continue;
    const size = v.getUint32(i + 24, true),
      n = v.getUint16(i + 28, true),
      e = v.getUint16(i + 30, true),
      c = v.getUint16(i + 32, true);
    if (i + 46 + n + e + c > v.byteLength)
      throw Error("서식 압축 구조가 손상되었습니다.");
    const name = new TextDecoder().decode(new Uint8Array(buffer, i + 46, n));
    if (/vbaProject|externalLinks|embeddings/i.test(name))
      throw Error("매크로·외부 연결·포함 개체를 제거한 서식을 사용하세요.");
    total += size;
    entries++;
    if (total > 32 * 1024 * 1024 || entries > 2000)
      throw Error("서식 압축 해제 크기가 너무 큽니다.");
    i += 45 + n + e + c;
  }
  if (!entries) throw Error("HWPX·XLSX 서식을 선택하세요.");
}
async function hwpxArchive(buffer: ArrayBuffer) {
  checkArchive(buffer);
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  if (
    !zip.file("mimetype") ||
    !(await zip.file("mimetype")!.async("string")).includes(
      "application/hwp+zip",
    )
  )
    throw Error("HWPX 형식을 확인하세요.");
  const files = Object.values(zip.files).filter((f) =>
    /^Contents\/section\d+\.xml$/.test(f.name),
  );
  if (!files.length) throw Error("HWPX 본문이 없습니다.");
  const sections = [];
  for (const file of files) {
    const xml = await file.async("string");
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw Error("서식 XML 선언을 확인하세요.");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length)
      throw Error("HWPX XML 본문이 손상되었습니다.");
    sections.push({ name: file.name, doc });
  }
  return { zip, sections };
}
function paragraphs(doc: Document) {
  return Array.from(doc.getElementsByTagNameNS("*", "p")).map((p) =>
    Array.from(p.getElementsByTagNameNS("*", "t")).filter((t) => {
      let parent = t.parentElement;
      while (parent && parent !== p) {
        if (parent.localName === "p") return false;
        parent = parent.parentElement;
      }
      return parent === p;
    }),
  );
}
export async function inspectTemplate(
  file: File,
  procedureId: string,
): Promise<InstitutionTemplate> {
  if (!/\.(hwpx|xlsx)$/i.test(file.name))
    throw Error("HWPX·XLSX 서식을 선택하세요.");
  const data = await file.arrayBuffer();
  checkArchive(data);
  let fields: string[] = [];
  if (/\.hwpx$/i.test(file.name)) {
    const { sections } = await hwpxArchive(data);
    for (const s of sections)
      for (const nodes of paragraphs(s.doc))
        fields.push(...names(nodes.map((n) => n.textContent || "").join("")));
  } else {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data);
    if (wb.worksheets.length > 20)
      throw Error("서식 시트는 20개 이하로 나누세요.");
    for (const s of wb.worksheets) {
      if (s.rowCount > 10000 || s.columnCount > 100)
        throw Error("서식 범위가 너무 큽니다.");
      s.eachRow((r) =>
        r.eachCell((c) => {
          if (c.type === ExcelJS.ValueType.Formula) return;
          fields.push(...names(c.text));
        }),
      );
    }
  }
  fields = [...new Set(fields)];
  if (!fields.length)
    throw Error(
      "채울 칸에 {{기관명}}, {{담당자}} 같은 표시를 넣은 서식을 선택하세요. 원본 서식을 복사해 한 번 준비하면 됩니다.",
    );
  if (
    fields.length > 100 ||
    fields.some(
      (f) => !f || ["__proto__", "constructor", "prototype"].includes(f),
    )
  )
    throw Error("서식 입력 항목을 확인하세요.");
  return {
    id: crypto.randomUUID(),
    procedureId,
    name: file.name,
    data,
    fields,
  };
}
export function templateMissing(
  t: InstitutionTemplate,
  values: Record<string, string>,
) {
  return t.fields.filter((k) => !values[k]?.trim());
}
export async function renderTemplate(
  t: InstitutionTemplate,
  values: Record<string, string>,
): Promise<Blob> {
  if (templateMissing(t, values).length)
    throw Error("비어 있는 서식 항목을 먼저 입력하세요.");
  if (Object.values(values).some((v) => v.length > 32000))
    throw Error(
      "한 서식 항목의 내용이 너무 깁니다. 기관 절차를 업무별로 나누어 주세요.",
    );
  if (/\.xlsx$/i.test(t.name)) {
    checkArchive(t.data);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(t.data);
    for (const s of wb.worksheets)
      s.eachRow((r) =>
        r.eachCell((c) => {
          if (
            c.type === ExcelJS.ValueType.Formula ||
            (c.isMerged && c.master.address !== c.address)
          )
            return;
          if (names(c.text).length) {
            if (
              c.value &&
              typeof c.value === "object" &&
              "richText" in c.value
            ) {
              const parts = c.value.richText;
              const original = parts.map((v) => v.text).join("");
              const replaced = replace(original, values);
              c.value = { richText: [{ ...(parts[0] || {}), text: replaced }] };
            } else c.value = replace(c.text, values);
          }
        }),
      );
    const bytes = await wb.xlsx.writeBuffer();
    return new Blob([new Uint8Array(bytes)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }
  const { zip, sections } = await hwpxArchive(t.data);
  for (const { name, doc } of sections) {
    for (const nodes of paragraphs(doc)) {
      const all = nodes.map((n) => n.textContent || "").join("");
      const matches = [...all.matchAll(token)].reverse();
      for (const m of matches) {
        const start = m.index!,
          end = start + m[0].length;
        let offset = 0;
        for (const node of nodes) {
          const content = node.textContent || "",
            next = offset + content.length;
          if (next > start && offset < end) {
            const left = content.slice(0, Math.max(0, start - offset)),
              right = content.slice(Math.max(0, end - offset));
            node.textContent =
              left +
              (offset <= start
                ? values[m[1].trim()].replace(/\r?\n/g, " / ")
                : "") +
              right;
          }
          offset = next;
        }
      }
    }
    zip.file(name, new XMLSerializer().serializeToString(doc));
  }
  // A stale preview must not display old names after the editable body was filled.
  for (const name of Object.keys(zip.files))
    if (/^Preview\//.test(name)) zip.remove(name);
  for (const name of Object.keys(zip.files))
    if (/^Scripts\//i.test(name) && !zip.files[name].dir) zip.file(name, "");
  const JSZip = (await import("jszip")).default;
  const ordered = new JSZip();
  ordered.file("mimetype", "application/hwp+zip", { compression: "STORE" });
  for (const file of Object.values(zip.files))
    if (file.name !== "mimetype" && !file.dir)
      ordered.file(file.name, await file.async("uint8array"));
  return ordered.generateAsync({
    type: "blob",
    mimeType: "application/hwp+zip",
    compression: "DEFLATE",
  });
}
export function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function sampleTemplate() {
  return workbookBlob([
    {
      name: "업무준비서",
      rows: [
        ["항목", "내용"],
        ["기관명", "{{기관명}}"],
        ["업무명", "{{업무명}}"],
        ["담당자", "{{담당자}}"],
        ["업무상황", "{{업무상황}}"],
        ["처리순서", "{{처리순서}}"],
        ["필요서류", "{{필요서류}}"],
        ["근거문서", "{{근거문서}}"],
        ["규정버전", "{{규정버전}}"],
      ],
    },
  ]);
}
export async function exportCase(c: SituationCase, p: Procedure) {
  const issues = outputIssues(c, p);
  if (issues.length) throw Error(issues.join(" / "));
  const plan = stepPlan(p, c.answers);
  const values = documentValues(c, p);
  const rows = Object.entries(values).flatMap(([k, v]) =>
    Array.from({ length: Math.max(1, Math.ceil(v.length / 30000)) }, (_, i) => [
      i ? k + ` (계속 ${i + 1})` : k,
      v.slice(i * 30000, (i + 1) * 30000),
    ]),
  );
  await exportWorkbook(p.title + "-업무준비", [
    {
      name: "업무준비",
      rows: [
        ["항목", "내용"],
        ["문서 상태", "담당자 검토용 초안 · 공식 결재·지급 확정과 별개"],
        ...rows,
      ],
    },
    {
      name: "처리순서",
      rows: [
        ["순서", "할 일", "기한 원문", "필요서류", "처리상태", "근거 발췌"],
        ...plan
          .filter((s) => s.applies === true)
          .map((s) => [
            s.index + 1,
            s.step.action,
            s.step.deadline || "원문에 없음 · 확인 필요",
            s.step.form || "원문에서 확인 필요",
            c.done.includes(s.index) ? "처리함" : "남은 일",
            s.step.quote,
          ]),
      ],
    },
    {
      name: "조건과제외",
      rows: [
        ["질문", "답", "확인 방식", "상황 근거"],
        ...(p.questions || []).map((q) => [
          q.label,
          q.options.find((o) => o.value === c.answers[q.id]?.value)?.label ||
            "미확인",
          c.answers[q.id]?.origin === "ai"
            ? "AI 제안 · 의미 확인 필요"
            : c.answers[q.id]?.origin === "literal"
              ? "명시 문구 일치"
              : "직접 확인",
          c.answers[q.id]?.quote || "",
        ]),
      ],
    },
    {
      name: "근거원문",
      rows: [
        ["출처", "버전", "원문"],
        ...Array.from(
          { length: Math.max(1, Math.ceil(p.text.length / 30000)) },
          (_, i) => [
            p.source,
            p.version,
            p.text.slice(i * 30000, (i + 1) * 30000),
          ],
        ),
      ],
    },
  ]);
}
function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("seomu-institution-templates", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("templates", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(Error("기관 서식 저장소를 열지 못했습니다."));
  });
}
export async function listTemplates(procedureId: string) {
  const store = await db();
  try {
    return await new Promise<InstitutionTemplate[]>((resolve, reject) => {
      const req = store
        .transaction("templates", "readonly")
        .objectStore("templates")
        .getAll();
      req.onsuccess = () =>
        resolve(
          (req.result as InstitutionTemplate[]).filter(
            (t) => t.procedureId === procedureId,
          ),
        );
      req.onerror = () => reject(Error("기관 서식을 읽지 못했습니다."));
    });
  } finally {
    store.close();
  }
}
export async function persistTemplate(t: InstitutionTemplate, remove = false) {
  const store = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = store.transaction("templates", "readwrite");
      if (remove) tx.objectStore("templates").delete(t.id);
      else tx.objectStore("templates").put(t);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(Error("기관 서식 저장에 실패했습니다."));
      tx.onabort = () => reject(Error("기관 서식 저장이 취소되었습니다."));
    });
  } finally {
    store.close();
  }
}

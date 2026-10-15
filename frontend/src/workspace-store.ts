export type Employee = {
  id: string;
  name: string;
  team: string;
  duty: string;
  backup: string;
};
export type Submission = {
  employeeId: string;
  values: Record<string, string>;
  state: "pending" | "submitted" | "revision" | "approved";
  note: string;
};
export type Request = {
  id: string;
  title: string;
  category: string;
  deadline: string;
  reference: string;
  fields: string[];
  rows: Submission[];
  created: string;
};
export type Work = {
  id: string;
  title: string;
  category: string;
  deadline: string;
  owner: string;
  repeat: string;
  checks: string[];
  done: boolean[];
};
export type Workspace = {
  version: 1;
  department: string;
  institution: string;
  employees: Employee[];
  requests: Request[];
  works: Work[];
};
export const emptyWorkspace: Workspace = {
  version: 1,
  department: "내 부서",
  institution: "지방자치단체",
  employees: [],
  requests: [],
  works: [],
};
export const storageKey = "seomu-workspace-v1";
export function validWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object") return false;
  const s = value as Workspace;
  return (
    s.version === 1 &&
    typeof s.department === "string" &&
    typeof s.institution === "string" &&
    Array.isArray(s.employees) &&
    s.employees.every(
      (e) =>
        e &&
        ["id", "name", "team", "duty", "backup"].every(
          (k) =>
            typeof (e as unknown as Record<string, unknown>)[k] === "string",
        ),
    ) &&
    Array.isArray(s.requests) &&
    s.requests.every(
      (r) =>
        r &&
        ["id", "title", "category", "deadline", "reference", "created"].every(
          (k) =>
            typeof (r as unknown as Record<string, unknown>)[k] === "string",
        ) &&
        Array.isArray(r.fields) &&
        r.fields.every((f) => typeof f === "string") &&
        Array.isArray(r.rows) &&
        r.rows.every(
          (x) =>
            x &&
            typeof x.employeeId === "string" &&
            ["pending", "submitted", "revision", "approved"].includes(
              x.state,
            ) &&
            typeof x.note === "string" &&
            x.values &&
            typeof x.values === "object" &&
            !Array.isArray(x.values) &&
            Object.values(x.values).every((v) => typeof v === "string"),
        ),
    ) &&
    Array.isArray(s.works) &&
    s.works.every(
      (w) =>
        w &&
        ["id", "title", "category", "deadline", "owner", "repeat"].every(
          (k) =>
            typeof (w as unknown as Record<string, unknown>)[k] === "string",
        ) &&
        Array.isArray(w.checks) &&
        w.checks.every((c) => typeof c === "string") &&
        Array.isArray(w.done) &&
        w.done.length === w.checks.length &&
        w.done.every((d) => typeof d === "boolean"),
    )
  );
}
export function loadWorkspace(): Workspace {
  try {
    const s = JSON.parse(localStorage.getItem(storageKey) || "null");
    return validWorkspace(s) ? s : emptyWorkspace;
  } catch {
    return emptyWorkspace;
  }
}
export function csvCell(value: string) {
  const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function csv(rows: string[][]) {
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
export function rowIssues(row: Submission, fields: string[]) {
  return fields.filter((f) => !row.values[f]?.trim()).map((f) => f + " 미입력");
}
export function saveFile(
  name: string,
  content: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type FollowupKind = "all" | "pending" | "missing" | "revision";
export function followupTargets(request: Request, kind: FollowupKind) {
  return request.rows.filter((row) => row.state !== "approved" && (
    kind === "all" ? row.state === "pending" || row.state === "revision" || rowIssues(row, request.fields).length > 0 :
    kind === "missing" ? rowIssues(row, request.fields).length > 0 : row.state === kind
  ));
}
export function followupFingerprint(request: Request, employees: Employee[]) {
  return JSON.stringify([request, employees.map(({id, name, team}) => ({id, name, team}))]);
}
export function buildFollowupText(request: Request, employees: Employee[], kind: FollowupKind) {
  const targets = followupTargets(request, kind);
  if (!targets.length) return "";
  return `${request.title} — 후속 안내 초안\n제출기한: ${request.deadline.trim() || "미입력 · 안내 전 확인 필요"}\n${request.reference.trim() ? `공문번호(사용자 입력): ${request.reference}` : "공문번호 미입력"}\n아래 내용은 담당자 검토용이며 자동 전송되지 않습니다.\n\n` + targets.map((row) => {
    const employee = employees.find((item) => item.id === row.employeeId);
    const missing = rowIssues(row, request.fields);
    const reasons = [row.state === "pending" ? "미제출" : "", missing.length ? "누락 항목 있음" : "", row.state === "revision" ? "보완 요청" : ""].filter(Boolean);
    return `받는 분: ${employee?.name || "직원 확인 필요"} (${employee?.team || "팀 미지정"})\n확인 사유: ${reasons.join(" · ")}\n필요 항목: ${missing.length ? missing.join(" / ") : row.state === "pending" ? request.fields.join(" / ") || "제출항목 확인 필요" : "검토 메모에 따른 보완"}\n서무 검토 메모: ${row.note.trim() || "없음 · 추가 보완사항 확인"}\n제출기한: ${request.deadline.trim() || "확인 필요"}\n요청드린 자료의 해당 항목을 확인해 담당자에게 제출해 주세요.`;
  }).join("\n\n────────────────\n\n");
}

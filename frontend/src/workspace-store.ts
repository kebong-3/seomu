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

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
  return fields.filter((f) => typeof row.values[f] !== "string" || !row.values[f].trim()).map((f) => f + " 미입력");
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

export function validQueueDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value;
}
export function requestQueue(requests: Request[], asOf: string) {
  if (!validQueueDate(asOf)) return [];
  return requests.flatMap(request => {
    const active = request.rows.filter(row => row.state !== "approved" || rowIssues(row, request.fields).length > 0);
    if (!active.length && request.rows.length) return [];
    const pending = active.filter(row => row.state === "pending").length;
    const revision = active.filter(row => row.state === "revision").length;
    const missing = active.filter(row => rowIssues(row, request.fields).length > 0).length;
    const review = active.filter(row => row.state === "submitted" && !rowIssues(row, request.fields).length).length;
    const timing = !validQueueDate(request.deadline) ? "unknown" : request.deadline < asOf ? "overdue" : request.deadline === asOf ? "today" : "upcoming";
    return [{id:request.id,title:request.title,deadline:request.deadline,timing,pending,revision,missing,review,active:active.length,unassigned:!request.rows.length,
      next:!request.rows.length ? "제출 대상 직원 설정" : revision ? "보완 메모 확인 후 후속 안내" : pending || missing ? "미제출·누락 항목 확인 후 안내" : "제출자료 검토 후 확인 처리"}];
  }).sort((a,b) => {
    const rank: Record<string,number> = {overdue:0,today:1,unknown:2,upcoming:3};
    return rank[a.timing]-rank[b.timing] || a.deadline.localeCompare(b.deadline) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
}
export function requestQueueCsv(requests: Request[], asOf: string) {
  const labels: Record<string,string>={overdue:"기한 경과",today:"오늘 마감",unknown:"기한 확인",upcoming:"예정"};
  return csv([["기준일","요청명","입력 기한","기한 상태","미제출","보완","누락 포함","검토 대기","다음 행동"],
    ...requestQueue(requests,asOf).map(item=>[asOf,item.title,item.deadline,labels[item.timing],String(item.pending),String(item.revision),String(item.missing),String(item.review),item.next])]);
}

export const collectionIssueLabels = {
  title: "요청명 미입력", deadline: "기한 확인 필요", fields: "제출항목 미설정",
  blank_field: "빈 제출항목 이름", duplicate_field: "중복 제출항목 이름", targets: "제출 대상 미설정",
  pending: "미제출", revision: "보완 요청", review: "검토 대기",
  missing: "필수 항목 미입력", approved_missing: "확인 완료인데 필수 항목 미입력",
  employee: "직원 연결 확인 필요", duplicate_target: "중복 제출 대상",
} as const;
export type CollectionIssueKind = keyof typeof collectionIssueLabels;
export type CollectionIssue = {kind: CollectionIssueKind; detail: string; rowIndex?: number; employeeId?: string; name?: string; team?: string};
/** Checks only recorded state and blank fields; never certifies submitted content or evidence. */
export function collectionReadiness(request: Request, employees: Employee[]) {
  const issues: CollectionIssue[] = [];
  const add = (kind: CollectionIssueKind, detail: string) => issues.push({kind, detail});
  if (!request.title.trim()) add("title", "요청 제목을 입력하세요.");
  if (!validQueueDate(request.deadline)) add("deadline", "제출기한을 YYYY-MM-DD의 실제 날짜로 확인하세요.");
  if (!request.fields.length) add("fields", "필요한 제출항목을 설정하세요.");
  const names = request.fields.map(field => field.trim());
  if (names.some(name => !name)) add("blank_field", "이름이 빈 제출항목을 수정하세요.");
  const repeated = [...new Set(names.filter((name, index) => name && names.indexOf(name) !== index))];
  if (repeated.length) add("duplicate_field", `항목 이름을 구분하세요: ${repeated.join(" / ")}`);
  if (!request.rows.length) add("targets", "제출 대상 직원을 설정하세요.");
  const targets = new Map<string, number>();
  for (const row of request.rows) targets.set(row.employeeId, (targets.get(row.employeeId) || 0) + 1);
  request.rows.forEach((row, rowIndex) => {
    const matches = employees.filter(employee => employee.id === row.employeeId && row.employeeId.trim());
    const employee = matches.length === 1 ? matches[0] : undefined;
    const rowIssue = (kind: CollectionIssueKind, detail: string) => issues.push({kind, detail, rowIndex, employeeId: row.employeeId, name: employee?.name || "직원 확인 필요", team: employee?.team || "팀 확인 필요"});
    if (matches.length !== 1) rowIssue("employee", "부서 설정의 직원 연결을 확인하세요. 직원 정보가 없거나 식별자가 중복되었습니다.");
    else if (!employee?.name.trim()) rowIssue("employee", "연결된 직원 이름이 비어 있습니다. 부서 설정에서 직원 정보를 확인하세요.");
    if ((targets.get(row.employeeId) || 0) > 1) rowIssue("duplicate_target", "같은 직원 식별자의 제출 행이 여러 개입니다. 원본 자료와 대조해 대상을 정리하세요.");
    if (row.state === "pending") rowIssue("pending", "제출자료를 확인한 뒤 입력·저장하세요.");
    if (row.state === "revision") rowIssue("revision", "보완사항을 확인하고 다시 검토하세요.");
    if (row.state === "submitted") rowIssue("review", "담당자가 제출자료를 검토하세요.");
    const missing = [...new Set(request.fields.filter(field => field.trim() && (typeof row.values[field] !== "string" || !row.values[field].trim())))];
    if (missing.length) rowIssue(row.state === "approved" ? "approved_missing" : "missing", `입력이 필요한 항목: ${missing.join(" / ")}`);
  });
  const affectedRows = new Set(issues.flatMap(issue => issue.rowIndex === undefined ? [] : [issue.rowIndex])).size;
  return {issues, affectedRows, totalRows: request.rows.length, settingsIssues: issues.filter(issue => issue.rowIndex === undefined).length, ready: !issues.length};
}
export function collectionReadinessText(request: Request, employees: Employee[]) {
  const result = collectionReadiness(request, employees);
  return `취합 전 점검 기록\n요청: ${request.title.trim() || "요청명 미입력"}\n요청 식별자: ${request.id}\n입력 기한: ${request.deadline || "미입력"}\n${result.ready ? "기록상 확인할 항목 없음" : "확인할 항목 있음"}\n대상 ${result.totalRows}행 · 확인 필요 ${result.affectedRows}행(행 중복 제외) · 요청 설정 ${result.settingsIssues}건\n유형별 건수는 같은 행이 겹칠 수 있어 합계가 인원 수가 아닙니다.\n입력 상태와 빈칸만 점검합니다. 내용 정확성·증빙 진위·실제 제출 여부는 별도로 확인하세요.\n제출한 상세 값과 검토 메모는 이 기록에 포함하지 않습니다.\n\n` +
    (result.issues.map(issue => `[${collectionIssueLabels[issue.kind]}] ${issue.rowIndex === undefined ? "요청 설정" : `${issue.rowIndex + 1}행 · 직원 ID ${issue.employeeId || "미입력"} · ${issue.name} / ${issue.team}`}\n${issue.detail}`).join("\n\n") || "추가 점검 항목 없음 · 최종 판단은 담당자가 수행합니다.");
}
export function updateRequestRow(request: Request, rowIndex: number, row: Submission): Request {
  if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= request.rows.length) return request;
  return {...request, rows: request.rows.map((current, index) => index === rowIndex ? row : current)};
}

export type ProcedureQuestion = {
  id: string;
  label: string;
  quote: string;
  options: { value: string; label: string; phrases?: string[] }[];
};
export type ProcedureStep = {
  action: string;
  deadline: string;
  form: string;
  quote: string;
  condition?: { questionId: string; value: string } | null;
};
export type Procedure = {
  id: string;
  title: string;
  keywords: string;
  institution: string;
  source: string;
  version: string;
  text: string;
  steps: ProcedureStep[];
  questions?: ProcedureQuestion[];
  sourceDocument?: { id: string; version: number };
};
export const procedureKey = "seomu-procedures-v1";
export const procedureChanged = "seomu-procedures-changed";
const bounded = (v: unknown, max = 3000): v is string =>
  typeof v === "string" && v.length <= max;
const safeId = (v: unknown): v is string =>
  bounded(v, 60) &&
  /^[a-z][a-z0-9_]*$/.test(v) &&
  !["constructor", "prototype", "__proto__"].includes(v);
export function validProcedure(p: unknown): p is Procedure {
  if (!p || typeof p !== "object") return false;
  const v = p as Procedure;
  if (
    ![
      "id",
      "title",
      "keywords",
      "institution",
      "source",
      "version",
      "text",
    ].every((k) =>
      bounded((v as unknown as Record<string, unknown>)[k], 50000),
    ) ||
    !v.id.trim() ||
    !v.title.trim() ||
    !Array.isArray(v.steps) ||
    v.steps.length > 30
  )
    return false;
  if (
    v.questions !== undefined &&
    (!Array.isArray(v.questions) ||
      v.questions.length > 8 ||
      !v.questions.every(
        (q) =>
          q &&
          safeId(q.id) &&
          bounded(q.label, 300) &&
          !!q.label.trim() &&
          bounded(q.quote) &&
          Array.isArray(q.options) &&
          q.options.length >= 2 &&
          q.options.length <= 6 &&
          q.options.every(
            (o) =>
              o &&
              safeId(o.value) &&
              bounded(o.label, 200) &&
              !!o.label.trim() &&
              (o.phrases === undefined ||
                (Array.isArray(o.phrases) &&
                  o.phrases.length <= 10 &&
                  o.phrases.every((s) => bounded(s, 100) && !!s.trim()))),
          ) &&
          new Set(q.options.map((o) => o.value)).size === q.options.length,
      ) ||
      new Set(v.questions.map((q) => q.id)).size !== v.questions.length)
  )
    return false;
  if (
    v.sourceDocument !== undefined &&
    (!v.sourceDocument ||
      !bounded(v.sourceDocument.id, 100) ||
      !Number.isSafeInteger(v.sourceDocument.version) ||
      v.sourceDocument.version < 1)
  )
    return false;
  return v.steps.every(
    (s) =>
      s &&
      ["action", "deadline", "form", "quote"].every((k) =>
        bounded((s as unknown as Record<string, unknown>)[k]),
      ) &&
      (s.condition === undefined ||
        s.condition === null ||
        (typeof s.condition === "object" &&
          Object.keys(s.condition).length === 2 &&
          v.questions?.some(
            (q) =>
              q.id === s.condition!.questionId &&
              q.options.some((o) => o.value === s.condition!.value),
          ))),
  );
}
export function procedureIssues(p: Procedure) {
  return [
    ...p.steps.flatMap((s, i) => [
      ...(!s.action.trim() ? [`${i + 1}단계: 할 일 미입력`] : []),
      ...(!s.quote.trim() || !p.text.includes(s.quote)
        ? [`${i + 1}단계: 원문과 일치하는 근거 발췌 필요`]
        : []),
    ]),
    ...(p.questions || [])
      .filter((q) => !q.quote.trim() || !p.text.includes(q.quote))
      .map((q) => `${q.label}: 조건의 원문 근거 확인 필요`),
  ];
}
export function readProcedures(): Procedure[] {
  const raw = localStorage.getItem(procedureKey);
  if (!raw) return [];
  if (raw.length > 20000000) throw Error("기관 절차 저장 크기를 확인하세요.");
  const a: unknown = JSON.parse(raw);
  if (
    !Array.isArray(a) ||
    a.length > 100 ||
    !a.every(validProcedure) ||
    new Set(a.map((p) => p.id)).size !== a.length
  )
    throw Error("저장된 기관 절차를 읽지 못했습니다. 백업을 확인하세요.");
  return a;
}
export function notifyProcedures() {
  window.dispatchEvent(new Event(procedureChanged));
}
export function findProcedures(items: Procedure[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items
    .map((p) => ({
      p,
      score: terms.reduce(
        (n, t) =>
          n +
          ([p.title, p.keywords, p.text].some((x) =>
            x.toLowerCase().includes(t),
          )
            ? 1
            : 0),
        0,
      ),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}
export const sampleProcedure: Procedure = {
  id: "synthetic-education",
  title: "교육자료 취합 절차 · 가상 예시",
  keywords: "교육 수료증 취합 제출 요청",
  institution: "가상 푸른시",
  source: "합성 시연자료 · 실제 규정 아님",
  version: "2026-10-15",
  text: "가상 교육자료 취합 지침\n제1조 담당자는 교육자료 제출을 요청하고 대상자와 제출기한을 지정한다.\n제2조 제출항목은 교육명과 교육시간으로 한다.\n제3조 담당자는 누락을 확인하고 보완 요청 후 취합표를 작성한다.",
  steps: [
    {
      action: "대상자와 제출기한을 정해 자료 요청",
      deadline: "원문에 고정 기한 없음 · 담당자 지정",
      form: "교육자료 제출 요청 안내문",
      quote: "담당자는 교육자료 제출을 요청하고 대상자와 제출기한을 지정한다.",
    },
    {
      action: "교육명·교육시간 제출 여부 확인",
      deadline: "지정한 제출기한",
      form: "직원별 제출내용",
      quote: "제출항목은 교육명과 교육시간으로 한다.",
    },
    {
      action: "누락 확인 → 보완 요청 → 취합표 작성",
      deadline: "원문에 없음 · 확인 필요",
      form: "취합표",
      quote: "담당자는 누락을 확인하고 보완 요청 후 취합표를 작성한다.",
    },
  ],
};

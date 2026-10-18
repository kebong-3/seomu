import { procedureIssues, validProcedure, type Procedure } from "./procedures";
export type SituationFact = {
  value: string;
  quote: string;
  origin: "user" | "literal" | "ai";
};
export type SituationCase = {
  id: string;
  procedureId: string;
  basis: Procedure;
  situation: string;
  answers: Record<string, SituationFact>;
  fields: Record<string, string>;
  done: number[];
  updatedAt: string;
};
export type SituationCases = {
  version: 1;
  selected: string;
  items: SituationCase[];
};
export const caseKey = "seomu-situation-cases-v1";
export const derivedFields = [
  "기관명",
  "업무명",
  "업무상황",
  "근거문서",
  "규정버전",
  "작성일",
  "처리순서",
  "필요서류",
];
export const emptyCases = (): SituationCases => ({
  version: 1,
  selected: "",
  items: [],
});
export function parseCases(raw: string | null): SituationCases {
  if (!raw) return emptyCases();
  if (raw.length > 3000000) throw Error("업무건 저장 크기를 확인하세요.");
  const d = JSON.parse(raw);
  if (
    !d ||
    d.version !== 1 ||
    typeof d.selected !== "string" ||
    !Array.isArray(d.items) ||
    d.items.length > 20
  )
    throw Error("저장된 업무건 형식이 올바르지 않습니다.");
  const str = (v: unknown, n: number) => typeof v === "string" && v.length <= n;
  for (const c of d.items as SituationCase[]) {
    if (
      !c ||
      !str(c.id, 100) ||
      !c.id ||
      !str(c.procedureId, 100) ||
      !validProcedure(c.basis) ||
      c.basis.id !== c.procedureId ||
      !str(c.situation, 4000) ||
      !str(c.updatedAt, 100) ||
      !c.answers ||
      typeof c.answers !== "object" ||
      Array.isArray(c.answers) ||
      Object.keys(c.answers).length > 8 ||
      !c.fields ||
      typeof c.fields !== "object" ||
      Array.isArray(c.fields) ||
      Object.keys(c.fields).length > 100 ||
      !Object.entries(c.fields).every(
        ([k, v]) =>
          str(k, 100) &&
          !["__proto__", "constructor", "prototype"].includes(k) &&
          str(v, 4000),
      ) ||
      !Array.isArray(c.done) ||
      c.done.length > 30 ||
      new Set(c.done).size !== c.done.length ||
      c.done.some(
        (i) => !Number.isInteger(i) || i < 0 || i >= c.basis.steps.length,
      )
    )
      throw Error("저장된 업무건 항목이 올바르지 않습니다.");
    for (const [id, f] of Object.entries(c.answers)) {
      const q = c.basis.questions?.find((q) => q.id === id);
      if (
        !f ||
        !q ||
        !q.options.some((o) => o.value === f.value) ||
        !str(f.quote, 4000) ||
        !["user", "literal", "ai"].includes(f.origin)
      )
        throw Error("저장된 상황 조건이 올바르지 않습니다.");
    }
  }
  if (
    new Set(d.items.map((c: SituationCase) => c.id)).size !== d.items.length ||
    (d.selected && !d.items.some((c: SituationCase) => c.id === d.selected))
  )
    throw Error("업무건 선택 기록을 확인하세요.");
  return d;
}
export function sameBasis(a: Procedure, b: Procedure) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function stepPlan(p: Procedure, answers: Record<string, SituationFact>) {
  return p.steps.map((step, index) => ({
    step,
    index,
    applies: !step.condition
      ? true
      : !answers[step.condition.questionId]
        ? null
        : answers[step.condition.questionId].value === step.condition.value,
  }));
}
export function pendingQuestions(
  p: Procedure,
  answers: Record<string, SituationFact>,
) {
  return (p.questions || []).filter(
    (q) =>
      p.steps.some((s) => s.condition?.questionId === q.id) && !answers[q.id],
  );
}
export function literalFacts(
  p: Procedure,
  situation: string,
): Record<string, SituationFact> {
  const facts: Record<string, SituationFact> = {};
  for (const q of p.questions || []) {
    const hits = q.options.flatMap((o) =>
      (o.phrases?.length ? o.phrases : [o.label])
        .filter((phrase) => situation.includes(phrase))
        .map((quote) => ({
          value: o.value,
          quote,
          origin: "literal" as const,
        })),
    );
    if (new Set(hits.map((h) => h.value)).size === 1 && hits.length) {
      const hit = hits[0];
      const end = situation.indexOf(hit.quote) + hit.quote.length;
      const surrounding = situation.slice(
        Math.max(0, end - hit.quote.length - 6),
        end + 12,
      );
      if (!/않|아니|안\s|예정|계획|가정|라면|거짓|취소/.test(surrounding))
        facts[q.id] = hit;
    }
  }
  return facts;
}
export function makeCase(p: Procedure, situation: string): SituationCase {
  return {
    id: crypto.randomUUID(),
    procedureId: p.id,
    basis: structuredClone(p),
    situation,
    answers: literalFacts(p, situation),
    fields: {},
    done: [],
    updatedAt: new Date().toISOString(),
  };
}
export function rebaseCase(c: SituationCase, p: Procedure): SituationCase {
  const sameInstitution = c.basis.institution === p.institution;
  const answers = Object.fromEntries(
    Object.entries(c.answers).filter(
      ([id, f]) =>
        sameInstitution &&
        p.questions?.some(
          (q) =>
            q.id === id &&
            JSON.stringify(q) ===
              JSON.stringify(c.basis.questions?.find((old) => old.id === id)) &&
            q.options.some((o) => o.value === f.value),
        ),
    ),
  );
  const done = p.steps.flatMap((step, index) => {
    const matches = c.basis.steps.flatMap((old, i) =>
      JSON.stringify(old) === JSON.stringify(step) && c.done.includes(i)
        ? [i]
        : [],
    );
    const applies = stepPlan(p, answers)[index].applies;
    return sameInstitution && matches.length === 1 && applies === true
      ? [index]
      : [];
  });
  return {
    ...c,
    basis: structuredClone(p),
    answers,
    done,
    updatedAt: new Date().toISOString(),
  };
}
export function documentValues(
  c: SituationCase,
  p: Procedure,
): Record<string, string> {
  const applied = stepPlan(p, c.answers).filter((s) => s.applies === true);
  return Object.fromEntries(
    Object.entries({
      기관명: p.institution,
      업무명: p.title,
      업무상황: c.situation,
      근거문서: p.source,
      규정버전: p.version,
      작성일: new Date().toLocaleDateString("sv-SE"),
      처리순서: applied.map((s) => s.step.action).join("\n"),
      필요서류: [
        ...new Set(applied.map((s) => s.step.form).filter(Boolean)),
      ].join("\n"),
      ...Object.fromEntries(
        (p.questions || [])
          .filter((q) => c.answers[q.id])
          .map((q) => [
            q.label,
            q.options.find((o) => o.value === c.answers[q.id].value)?.label ||
              "",
          ]),
      ),
      ...Object.fromEntries(
        Object.entries(c.fields).filter(
          ([k]) =>
            !derivedFields.includes(k) &&
            !p.questions?.some((q) => q.label === k),
        ),
      ),
    }).filter(([, v]) => v !== undefined),
  );
}
export function outputIssues(c: SituationCase, p: Procedure) {
  return [
    ...procedureIssues(p),
    ...(!sameBasis(c.basis, p)
      ? ["기관 규정이 변경되었습니다. 변경 사항을 먼저 확인하세요."]
      : []),
    ...pendingQuestions(p, c.answers).map((q) => q.label),
  ];
}

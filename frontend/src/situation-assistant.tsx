import { useEffect, useState } from "react";
import {
  ArrowRight,
  FileCheck,
  FolderOpen,
  MessageSquareText,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { api, key } from "./api";
import { AISelector } from "./ai-settings";
import {
  findProcedures,
  procedureChanged,
  procedureIssues,
  procedureKey,
  readProcedures,
  notifyProcedures,
  type Procedure,
} from "./procedures";
import { travelProcedure, purchaseProcedure } from "./procedure-samples";
import {
  caseKey,
  derivedFields,
  documentValues,
  emptyCases,
  literalFacts,
  makeCase,
  outputIssues,
  parseCases,
  pendingQuestions,
  rebaseCase,
  sameBasis,
  stepPlan,
  type SituationCase,
  type SituationCases,
  type SituationFact,
} from "./situation-engine";
import {
  exportCase,
  inspectTemplate,
  listTemplates,
  persistTemplate,
  renderTemplate,
  sampleTemplate,
  saveBlob,
  templateMissing,
  type InstitutionTemplate,
} from "./procedure-template";
import type { Status } from "./types";
import { saveFile } from "./workspace-store";
import EffectEvidence from "./effect-evidence";
import "./situation.css";

function initial() {
  try {
    return { data: parseCases(localStorage.getItem(caseKey)), error: "" };
  } catch {
    return {
      data: emptyCases(),
      error:
        "이전 업무건을 읽지 못했습니다. 기존 저장값을 보호하기 위해 자동 저장을 멈췄습니다.",
    };
  }
}
export function SituationAssistant({
  institution,
  onManage,
  onDocuments,
  onTool,
}: {
  institution: string;
  onManage: () => void;
  onDocuments: () => void;
  onTool: (tool: "merge" | "settlement") => void;
}) {
  const [loaded, setLoaded] = useState(initial);
  const [cases, setCases] = useState(loaded.data);
  const [storageError, setStorageError] = useState(loaded.error);
  const [items, setItems] = useState<Procedure[]>([]);
  const [procedureError, setProcedureError] = useState("");
  const [situation, setSituation] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [provider, setProvider] = useState("evidence");
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<InstitutionTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [remoteChanged, setRemoteChanged] = useState("");
  const [remoteNote, setRemoteNote] = useState("");
  function refresh() {
    try {
      setItems(readProcedures());
      setProcedureError("");
    } catch (e) {
      setProcedureError(
        e instanceof Error ? e.message : "기관 절차를 읽지 못했습니다.",
      );
    }
  }
  useEffect(() => {
    refresh();
    window.addEventListener(procedureChanged, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(procedureChanged, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  useEffect(() => {
    if (key())
      void api<Status>("/api/status")
        .then(setStatus)
        .catch(() => {});
  }, []);
  const current = cases.items.find((c) => c.id === cases.selected);
  const procedure = items.find((p) => p.id === current?.procedureId);
  const stale =
    !!current && !!procedure && !sameBasis(current.basis, procedure);
  useEffect(() => {
    setTemplates([]);
    setTemplateId("");
    if (!procedure) return;
    let active = true;
    void listTemplates(procedure.id)
      .then((list) => {
        if (active) {
          setTemplates(list);
          setTemplateId(list[0]?.id || "");
        }
      })
      .catch(() => {
        if (active)
          setMessage(
            "기관 서식을 읽지 못했습니다. 브라우저 저장소 설정을 확인하세요.",
          );
      });
    return () => {
      active = false;
    };
  }, [procedure?.id]);
  useEffect(() => {
    setRemoteChanged("");
    setRemoteNote("");
    if (!procedure?.sourceDocument) return;
    let active = true;
    const source = procedure.sourceDocument;
    if (!key()) {
      setRemoteNote(
        "문서 서버의 최신 버전은 확인하지 못했습니다. 저장된 규정 버전으로 준비합니다.",
      );
      return;
    }
    void api<{ version: number }>("/api/documents/" + source.id)
      .then((d) => {
        if (active && d.version !== source.version)
          setRemoteChanged(
            "문서함 원문이 v" +
              d.version +
              "로 바뀌었습니다. 기관 절차를 최신 원문으로 갱신한 뒤 문서를 준비하세요.",
          );
      })
      .catch(() => {
        if (active)
          setRemoteNote(
            "연결된 원문의 최신 버전을 확인하지 못했습니다. 문서함에서 확인하세요.",
          );
      });
    return () => {
      active = false;
    };
  }, [procedure]);
  function commit(next: SituationCases) {
    setCases(next);
    if (loaded.error) {
      setStorageError(loaded.error);
      return;
    }
    try {
      const raw = JSON.stringify(next);
      parseCases(raw);
      localStorage.setItem(caseKey, raw);
      setStorageError("");
    } catch {
      setStorageError(
        "업무건을 기기에 저장하지 못했습니다. 현재 화면에서는 사용할 수 있습니다. 업무건 백업을 내려받아 주세요.",
      );
    }
  }
  function update(c: SituationCase) {
    commit({
      ...cases,
      items: cases.items.map((old) =>
        old.id === c.id ? { ...c, updatedAt: new Date().toISOString() } : old,
      ),
    });
  }
  function choose(id: string) {
    const c = cases.items.find((c) => c.id === id);
    commit({ ...cases, selected: id });
    if (c) {
      setSituation(c.situation);
      setProcedureId(c.procedureId);
    }
    setMessage("");
  }
  function addCase(c: SituationCase) {
    if (cases.items.length >= 20) {
      setMessage(
        "업무건은 20개까지 보관합니다. 백업 후 끝난 업무건을 정리하세요.",
      );
      return false;
    }
    commit({ ...cases, selected: c.id, items: [c, ...cases.items] });
    return true;
  }
  async function readSituation(p: Procedure, c: SituationCase) {
    if (!p.questions?.length) return c;
    const response = await api<{
      facts: { questionId: string; value: string; quote: string }[];
      model_run: { provider: string; model: string };
    }>("/api/procedures/situation", {
      method: "POST",
      body: JSON.stringify({
        provider,
        situation: c.situation,
        questions: p.questions.map((q) => ({
          id: q.id,
          label: q.label,
          options: q.options.map((o) => ({ value: o.value, label: o.label })),
        })),
      }),
    });
    const answers: Record<string, SituationFact> = {
      ...literalFacts(p, c.situation),
    };
    for (const f of response.facts) {
      if (
        !p.questions.some(
          (q) =>
            q.id === f.questionId && q.options.some((o) => o.value === f.value),
        ) ||
        !c.situation.includes(f.quote)
      )
        throw Error("상황 분석 결과를 원문과 연결하지 못했습니다.");
      answers[f.questionId] = { value: f.value, quote: f.quote, origin: "ai" };
    }
    setMessage(
      `${response.model_run.provider} · ${response.model_run.model}이 명시된 조건을 읽었습니다. 표시된 답의 의미를 확인하고 부족한 조건만 답해 주세요.`,
    );
    return { ...c, answers };
  }
  async function start() {
    const p = items.find((p) => p.id === procedureId);
    if (!p) {
      setMessage("적용할 기관 절차를 선택하세요.");
      return;
    }
    if (situation.trim().length < 2) {
      setMessage("현재 상황을 한 문장으로 알려 주세요.");
      return;
    }
    if (cases.items.length >= 20) {
      setMessage("끝난 업무건을 백업·정리한 뒤 시작하세요.");
      return;
    }
    if (procedureIssues(p).length) {
      setMessage("기관 절차의 근거를 먼저 보완하세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    let c = makeCase(p, situation.trim());
    try {
      if (provider !== "evidence") c = await readSituation(p, c);
      else
        setMessage(
          Object.keys(c.answers).length
            ? "상황의 명시 문구와 일치한 답을 가져왔습니다. AI 분석은 아닙니다."
            : "절차가 달라지는 조건만 확인하면 됩니다.",
        );
    } catch (e) {
      setMessage(
        (e instanceof Error ? e.message : "AI 분석 실패") +
          " 직접 답을 선택해 이어갈 수 있습니다.",
      );
    } finally {
      addCase(c);
      setBusy(false);
    }
  }
  function sample(p: Procedure, text: string) {
    if (procedureError) {
      setMessage("기관 절차 저장 오류를 먼저 확인하세요.");
      return;
    }
    const existing = items.find((x) => x.id === p.id);
    const next = existing ? items : [...items, p];
    if (next.length > 100) {
      setMessage("기관 절차는 최대 100개입니다.");
      return;
    }
    try {
      localStorage.setItem(procedureKey, JSON.stringify(next));
      setItems(next);
      notifyProcedures();
      const selected = existing || p;
      setProcedureId(selected.id);
      setSituation(text);
      addCase(makeCase(selected, text));
      setMessage(
        "합성 지침으로 만든 연습입니다. 실제 기관 규정과 기한으로 사용하지 마세요.",
      );
    } catch {
      setMessage("가상 절차를 저장하지 못했습니다. 저장 공간을 확인하세요.");
    }
  }
  function answer(id: string, value: string) {
    if (!current || !procedure || stale) return;
    const answers = { ...current.answers };
    if (value)
      answers[id] = { value, quote: "담당자가 직접 확인", origin: "user" };
    else delete answers[id];
    const before = stepPlan(procedure, current.answers),
      after = stepPlan(procedure, answers);
    update({
      ...current,
      answers,
      done: current.done.filter(
        (i) => before[i]?.applies === true && after[i]?.applies === true,
      ),
    });
  }
  const template = templates.find((t) => t.id === templateId);
  const values = current && procedure ? documentValues(current, procedure) : {};
  const missing = template ? templateMissing(template, values) : [];
  const issues = current && procedure ? outputIssues(current, procedure) : [];
  const blocked =
    !current || !procedure || !!issues.length || !!remoteChanged || busy;
  const candidates = findProcedures(items, situation);
  const pending =
    procedure && current ? pendingQuestions(procedure, current.answers) : [];
  async function output(kind: "case" | "template") {
    if (blocked || !current || !procedure) return;
    setBusy(true);
    try {
      if (kind === "case") await exportCase(current, procedure);
      else if (template)
        saveBlob(
          template.name.replace(/\.(hwpx|xlsx)$/i, "-초안.$1"),
          await renderTemplate(template, values),
        );
      setMessage(
        "편집 가능한 초안을 준비했습니다. 제출 전에 내용과 기관 서식을 확인하세요.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "문서 준비 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="situation-assistant">
      <div className="portal-heading">
        <div>
          <span className="kicker">기관 규정으로 준비하는 내 업무</span>
          <h1>상황을 말하면, 다음 할 일과 서류까지.</h1>
          <p>
            이미 알려준 내용은 다시 묻지 않고, 처리에 필요한 조건만 확인합니다.
          </p>
        </div>
        <button className="secondary" onClick={onManage}>
          기관 규정·절차 관리
        </button>
      </div>
      <section className="portal-panel situation-start">
        <div className="assistant-section-title">
          <MessageSquareText size={22} />
          <h2>지금 어떤 상황인가요?</h2>
        </div>
        <label>
          업무 상황
          <textarea
            maxLength={4000}
            rows={3}
            disabled={busy}
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
            placeholder="예: 어제 현장점검 출장을 다녀왔어요. 공용차를 탔고 점심을 제공받았어요. 정산 준비해 주세요."
          />
        </label>
        <label>
          적용할 기관 절차
          <select
            value={procedureId}
            disabled={busy}
            onChange={(e) => setProcedureId(e.target.value)}
          >
            <option value="">기관 절차 선택</option>
            {items.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} · {p.institution}
              </option>
            ))}
          </select>
        </label>
        {!!situation && candidates.length > 0 && !procedureId && (
          <div className="ai-links">
            관련 절차:
            {candidates.slice(0, 3).map((p) => (
              <button
                className="secondary"
                key={p.id}
                onClick={() => setProcedureId(p.id)}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}
        <details>
          <summary>AI로 상황 읽기 설정</summary>
          <AISelector
            options={status?.ai_providers}
            value={provider}
            onChange={setProvider}
          />
          {!status && (
            <p>
              문서 서버에 연결된 AI를 사용할 수 있습니다. 연결 없이도 조건을
              직접 선택해 준비할 수 있습니다.
            </p>
          )}
        </details>
        <div className="ai-links">
          <button
            className="primary"
            disabled={busy || !items.length}
            onClick={() => void start()}
          >
            <Sparkles size={17} />
            {busy ? "준비 중…" : "이 상황으로 새 업무 시작"}
          </button>
          <button className="secondary" onClick={onManage}>
            규정에서 절차 만들기
          </button>
        </div>
        {!items.length && (
          <p>
            기관 직원 명단 등록 없이 시작합니다. 기관 지침을 준비하거나 아래
            가상 업무로 흐름을 체험하세요.
          </p>
        )}
        <div className="assistant-samples">
          <span>합성 지침 체험</span>
          <button
            disabled={busy}
            onClick={() =>
              sample(
                travelProcedure,
                "현장점검 출장을 다녀왔어요. 공용차를 탔고 점심을 제공받았어요. 정산을 준비해 주세요.",
              )
            }
          >
            출장 정산
          </button>
          <button
            disabled={busy}
            onClick={() =>
              sample(
                purchaseProcedure,
                "물품을 받았는데 검수 전이에요. 다음 할 일과 필요한 서류를 준비해 주세요.",
              )
            }
          >
            물품 구매·검수
          </button>
        </div>
      </section>
      {(storageError || procedureError) && (
        <div role="alert" className="local-note">
          {storageError || procedureError}
          {loaded.error && (
            <button
              className="secondary"
              onClick={() => {
                try {
                  saveFile(
                    "복구용-업무건-원본.txt",
                    localStorage.getItem(caseKey) || "",
                    "text/plain;charset=utf-8",
                  );
                } catch {
                  setMessage("기존 저장값을 읽지 못했습니다.");
                }
              }}
            >
              기존 저장값 내려받기
            </button>
          )}
          {loaded.error && (
            <button
              className="secondary"
              onClick={() => {
                if (
                  !confirm(
                    "기존 저장값을 파일로 내려받고, 현재 화면의 업무건으로 기기 저장값을 교체할까요?",
                  )
                )
                  return;
                try {
                  saveFile(
                    "복구용-업무건-원본.txt",
                    localStorage.getItem(caseKey) || "",
                    "text/plain;charset=utf-8",
                  );
                  const raw = JSON.stringify(cases);
                  parseCases(raw);
                  localStorage.setItem(caseKey, raw);
                  setLoaded({ data: cases, error: "" });
                  setStorageError("");
                } catch {
                  setMessage(
                    "저장값을 교체하지 못했습니다. 현재 업무건 백업을 따로 보관하세요.",
                  );
                }
              }}
            >
              백업 후 현재 업무건으로 복구
            </button>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="local-note">
          {message}
        </p>
      )}
      {
        <section className="portal-panel">
          <div className="panel-title">
            <h2>
              <RotateCcw size={18} /> 하던 일 계속
            </h2>
            <button
              className="secondary"
              onClick={() =>
                saveFile(
                  "상황별-업무건-백업.json",
                  JSON.stringify(cases, null, 2),
                  "application/json",
                )
              }
            >
              업무건 백업
            </button>
          </div>
          <div className="assistant-case-list">
            {cases.items.map((c) => (
              <button
                key={c.id}
                className={c.id === cases.selected ? "selected" : ""}
                disabled={busy}
                onClick={() => choose(c.id)}
              >
                <b>{c.basis.title}</b>
                <span>{c.situation.slice(0, 65)}</span>
                <small>{new Date(c.updatedAt).toLocaleString("ko-KR")}</small>
              </button>
            ))}
          </div>
          <details>
            <summary>이 기기의 업무건 백업 복원</summary>
            <p>
              같은 기관 절차가 있는 기기에서 이어서 처리합니다. 현재 업무건은
              덮어쓰지 않습니다.
            </p>
            <input
              aria-label="상황별 업무건 백업 선택"
              type="file"
              accept=".json"
              disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  if (f.size > 3000000)
                    throw Error("3MB 이하의 백업을 선택하세요.");
                  const incoming = parseCases(await f.text());
                  const ids = new Set(cases.items.map((c) => c.id));
                  const fresh = incoming.items.filter((c) => !ids.has(c.id));
                  if (cases.items.length + fresh.length > 20)
                    throw Error("합계 20개 이하로 정리하세요.");
                  commit({
                    ...cases,
                    items: [...fresh, ...cases.items],
                    selected: cases.selected || fresh[0]?.id || "",
                  });
                  setMessage(
                    `${fresh.length}개 업무건을 복원했습니다. 기관 절차·버전이 다르면 확인 후 진행하세요.`,
                  );
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : "복원 실패");
                }
              }}
            />
          </details>
        </section>
      }
      {current && !procedure && (
        <section className="portal-panel">
          <h2>이 업무건의 기관 절차를 찾지 못했습니다.</h2>
          <p>업무건은 보존했습니다. 기관 절차 묶음을 먼저 가져오세요.</p>
          <button className="secondary" onClick={onManage}>
            기관 절차 가져오기
          </button>
        </section>
      )}
      {current && procedure && (
        <>
          <section
            className="portal-panel assistant-case"
            aria-label="현재 상황별 업무"
          >
            <div className="panel-title">
              <div>
                <span className="kicker">현재 업무건</span>
                <h2>{procedure.title}</h2>
              </div>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "이 업무건의 상황·입력값·처리 기록을 삭제할까요? 기관 절차와 서식은 유지됩니다.",
                    )
                  ) {
                    const remaining = cases.items.filter(
                      (c) => c.id !== current.id,
                    );
                    commit({
                      ...cases,
                      items: remaining,
                      selected: remaining[0]?.id || "",
                    });
                  }
                }}
              >
                업무건 삭제
              </button>
            </div>
            <p>{current.situation}</p>
            <p className="small muted">
              {procedure.institution} · {procedure.source} · {procedure.version}
            </p>
            {(procedure.id.startsWith("synthetic-") ||
              procedure.source.includes("합성")) && (
              <p className="assistant-demo-note">
                가상 연습 자료입니다. 실제 적용 규정·지급 기준이 아닙니다.
              </p>
            )}
            {remoteNote && <p className="small muted">{remoteNote}</p>}
            {remoteChanged && (
              <p role="alert" className="local-note">
                {remoteChanged}
              </p>
            )}
            {stale && (
              <div role="alert" className="local-note">
                <b>기관 규정·절차가 변경되었습니다.</b>
                <p>
                  변경 전 처리 확인을 그대로 완료로 표시하지 않습니다. 변경
                  내용을 확인하면 동일한 단계의 처리 기록{" "}
                  {rebaseCase(current, procedure).done.length}개를 유지하고
                  나머지는 다시 확인합니다.
                </p>
                <details>
                  <summary>이전 기준과 현재 기준 비교</summary>
                  <p>
                    이전: {current.basis.source} · {current.basis.version}
                  </p>
                  <p>
                    현재: {procedure.source} · {procedure.version}
                  </p>
                  {procedure.steps.map((s, i) => (
                    <p key={i}>
                      {current.basis.steps.some(
                        (old) => JSON.stringify(old) === JSON.stringify(s),
                      )
                        ? "유지"
                        : "변경·추가"}
                      : {s.action}
                    </p>
                  ))}
                </details>
                <button
                  className="secondary"
                  onClick={() => update(rebaseCase(current, procedure))}
                >
                  변경 내용을 확인하고 이어하기
                </button>
              </div>
            )}
            {Object.keys(current.answers).length > 0 && (
              <div className="assistant-facts">
                <h3>이미 알려준 내용</h3>
                {(procedure.questions || [])
                  .filter((q) => current.answers[q.id])
                  .map((q) => {
                    const f = current.answers[q.id];
                    return (
                      <article key={q.id}>
                        <div>
                          <b>{q.label}</b>
                          <span>
                            {q.options.find((o) => o.value === f.value)
                              ?.label || "조건 재확인 필요"}
                          </span>
                          <small>
                            {f.origin === "ai"
                              ? "AI 제안"
                              : f.origin === "literal"
                                ? "명시 문구 일치"
                                : "직접 확인"}{" "}
                            · {f.quote}
                          </small>
                        </div>
                        <button
                          className="secondary"
                          disabled={stale || busy}
                          onClick={() => answer(q.id, "")}
                        >
                          답 수정
                        </button>
                      </article>
                    );
                  })}
              </div>
            )}
            {pending.length > 0 && (
              <div className="assistant-questions">
                <h3>이것만 더 알려 주세요</h3>
                {pending.map((q) => (
                  <label key={q.id}>
                    {q.label}
                    <select
                      disabled={stale || busy}
                      value=""
                      onChange={(e) => answer(q.id, e.target.value)}
                    >
                      <option value="">확인할 답 선택</option>
                      {q.options.map((o) => (
                        <option value={o.value} key={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <small>절차가 달라지는 근거: {q.quote}</small>
                  </label>
                ))}
              </div>
            )}
            <div className="assistant-next">
              <FileCheck size={20} />
              <div>
                <small>다음 할 일</small>
                <b>
                  {stale
                    ? "변경된 기관 규정 확인"
                    : pending.length
                      ? "적용 조건 " + pending.length + "개 확인"
                      : stepPlan(procedure, current.answers).find(
                          (s) =>
                            s.applies === true &&
                            !current.done.includes(s.index),
                        )?.step.action || "처리 기록 완료 · 제출 전 서류 확인"}
                </b>
              </div>
            </div>
            <div className="assistant-steps">
              {stepPlan(procedure, current.answers)
                .filter((s) => s.applies !== false)
                .map(({ step, index, applies }, n) => (
                  <article
                    key={index}
                    className={applies === null ? "pending" : ""}
                  >
                    <span className="assistant-step-number">{n + 1}</span>
                    <div>
                      <h3>{step.action}</h3>
                      <p>
                        {applies === null
                          ? "조건 답변 후 적용 여부 결정"
                          : step.form || "필요 서류는 원문에서 확인"}{" "}
                        · {step.deadline || "기한은 원문에서 확인 필요"}
                      </p>
                      <details>
                        <summary>근거 확인</summary>
                        <blockquote>{step.quote}</blockquote>
                      </details>
                      <label className="assistant-complete">
                        <input
                          type="checkbox"
                          checked={!stale && current.done.includes(index)}
                          disabled={
                            stale || applies !== true || busy || !!remoteChanged
                          }
                          onChange={(e) =>
                            update({
                              ...current,
                              done: e.target.checked
                                ? [...current.done, index]
                                : current.done.filter((i) => i !== index),
                            })
                          }
                        />
                        이 단계 처리함
                      </label>
                    </div>
                  </article>
                ))}
            </div>
            {stepPlan(procedure, current.answers).some(
              (s) => s.applies === false,
            ) && (
              <details>
                <summary>현재 조건에서 제외된 단계</summary>
                {stepPlan(procedure, current.answers)
                  .filter((s) => s.applies === false)
                  .map((s) => (
                    <p key={s.index}>
                      {s.step.action} · 조건:{" "}
                      {
                        procedure.questions
                          ?.find((q) => q.id === s.step.condition?.questionId)
                          ?.options.find(
                            (o) => o.value === s.step.condition?.value,
                          )?.label
                      }
                    </p>
                  ))}
              </details>
            )}
          </section>
          <section className="portal-panel" aria-label="필요한 문서 준비">
            <div className="assistant-section-title">
              <FolderOpen size={22} />
              <h2>필요한 문서 준비</h2>
            </div>
            <p>
              상황·확인한 조건·처리순서·근거를 다시 입력하지 않고 초안에
              담습니다.
            </p>
            <button
              className="primary"
              disabled={blocked}
              onClick={() => void output("case")}
            >
              업무준비서 XLSX 저장 <ArrowRight size={16} />
            </button>
            {issues.length > 0 && (
              <p className="small muted">먼저 확인: {issues.join(" / ")}</p>
            )}
            <hr />
            <h3>기관 서식에 바로 채우기</h3>
            <p className="small muted">
              채울 칸에 {"{{기관명}}"}, {"{{담당자}}"}처럼 항목을 표시한
              HWPX·XLSX 서식을 한 번 등록하세요. 서식은 이 브라우저에 보관하며
              서버로 보내지 않습니다. HWPX의 여러 줄 값은 /로 구분하고
              스크립트는 제외합니다. 기관 절차 묶음과 별도이므로 다른 기기로
              옮길 때 원본 서식도 함께 준비하세요.
            </p>
            <div className="ai-links">
              <label>
                기관 HWPX·XLSX 서식 등록
                <input
                  aria-label="기관 서식 파일 선택"
                  type="file"
                  accept=".hwpx,.xlsx"
                  disabled={busy || templates.length >= 10}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setBusy(true);
                    try {
                      const t = await inspectTemplate(file, procedure.id);
                      await persistTemplate(t);
                      setTemplates([...templates, t]);
                      setTemplateId(t.id);
                      setMessage(
                        "기관 서식을 보관했습니다. 다음 업무건에도 다시 사용할 수 있습니다.",
                      );
                    } catch (err) {
                      setMessage(
                        err instanceof Error ? err.message : "서식 등록 실패",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </label>
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  try {
                    saveBlob(
                      "연습-업무준비서-서식.xlsx",
                      await sampleTemplate(),
                    );
                  } catch {
                    setMessage("연습 서식을 만들지 못했습니다.");
                  }
                }}
              >
                연습용 XLSX 서식 받기
              </button>
            </div>
            {templates.length > 0 && (
              <>
                <label>
                  사용할 기관 서식
                  <select
                    value={templateId}
                    disabled={busy}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                {template && (
                  <>
                    <div className="assistant-fields">
                      {template.fields.map((k) => (
                        <label key={k}>
                          {k}
                          {missing.includes(k)
                            ? " · 입력 필요"
                            : " · 가져온 값"}
                          <textarea
                            rows={k === "처리순서" || k === "필요서류" ? 3 : 1}
                            maxLength={4000}
                            disabled={stale || busy}
                            readOnly={
                              derivedFields.includes(k) ||
                              procedure.questions?.some((q) => q.label === k)
                            }
                            value={values[k] || ""}
                            onChange={(e) =>
                              update({
                                ...current,
                                fields: {
                                  ...current.fields,
                                  [k]: e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <div className="ai-links">
                      <button
                        className="primary"
                        disabled={blocked || missing.length > 0}
                        onClick={() => void output("template")}
                      >
                        기관 서식 초안 저장
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            !confirm(
                              "이 기기에 보관한 서식을 삭제할까요? 원본 파일은 유지됩니다.",
                            )
                          )
                            return;
                          try {
                            await persistTemplate(template, true);
                            const next = templates.filter(
                              (t) => t.id !== template.id,
                            );
                            setTemplates(next);
                            setTemplateId(next[0]?.id || "");
                          } catch {
                            setMessage("서식을 삭제하지 못했습니다.");
                          }
                        }}
                      >
                        보관한 서식 삭제
                      </button>
                    </div>
                    {missing.length > 0 && (
                      <p>
                        비어 있는 항목 {missing.length}개만 입력하면 됩니다.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
            <details>
              <summary>취합·계산 도구가 필요한가요?</summary>
              <div className="ai-links">
                <button className="secondary" onClick={() => onTool("merge")}>
                  엑셀 취합·누락 대조
                </button>
                <button
                  className="secondary"
                  onClick={() => onTool("settlement")}
                >
                  기관 단가로 정산 계산
                </button>
                <button className="secondary" onClick={onDocuments}>
                  문서함에서 증빙 찾기
                </button>
              </div>
            </details>
          </section>
          <EffectEvidence app="seomu" task="상황 입력부터 업무·문서 준비까지" />
        </>
      )}
      <p className="small muted">
        업무건은 현재 브라우저에 최대 20개 보관합니다. 공식 결재·직원 전송·여비
        지급을 수행하지 않습니다. 현재 기관: {institution || "미지정"}.
      </p>
    </div>
  );
}

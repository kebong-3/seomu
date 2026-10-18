import {
  parseProcedureBundle,
  procedureBundle,
  planProcedureImport,
  persistProcedureImport,
  type ProcedureBundle,
} from "./procedure-transfer";
import {
  ProcedureDraftBuilder,
  type ProcedureSeed,
} from "./procedure-draft-builder";
import EffectEvidence from "./effect-evidence";
import { useState } from "react";
import {
  findProcedures,
  notifyProcedures,
  procedureIssues,
  procedureKey,
  sampleProcedure,
  validProcedure,
  type Procedure,
} from "./procedures";
import {
  currentRecord,
  emptyProgress,
  parseProgress,
  persistProgress,
  procedureRecordText,
  procedureSnapshot,
  progressKey,
  type ProcedureProgress,
} from "./procedure-progress";
import { saveFile } from "./workspace-store";
export function ProcedureGuide({
  institution,
  seed,
  onConnect,
}: {
  institution: string;
  seed?: ProcedureSeed;
  onConnect: () => void;
}) {
  const [items, setItems] = useState<Procedure[]>(() => {
    try {
      const a = JSON.parse(localStorage.getItem(procedureKey) || "[]");
      return Array.isArray(a) && a.length <= 100 && a.every(validProcedure)
        ? a
        : [];
    } catch {
      return [];
    }
  });
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Procedure | null>(null);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<ProcedureProgress>(() => {
    try {
      return parseProgress(localStorage.getItem(progressKey));
    } catch {
      return emptyProgress();
    }
  });
  const [storageWarning, setStorageWarning] = useState(() => {
    try {
      parseProgress(localStorage.getItem(progressKey));
      return "";
    } catch {
      return "이전 처리 기록을 읽지 못했습니다. 현재 화면에서 다시 확인하세요.";
    }
  });
  const [incoming, setIncoming] = useState<{
    bundle: ProcedureBundle;
    name: string;
  } | null>(null);
  const importPlan = incoming
    ? planProcedureImport(incoming.bundle, items, progress)
    : null;
  const selected = progress.selected;
  const updateProgress = (next: ProcedureProgress) => {
    setProgress(next);
    let saved = false;
    try {
      saved = persistProgress(localStorage, next);
    } catch {
      /* Storage access can be blocked by browser settings. */
    }
    setStorageWarning(
      saved
        ? ""
        : "처리 기록 저장에 실패했습니다. 현재 화면에서만 유지되며 새로고침하면 사라질 수 있습니다.",
    );
  };
  const setSelected = (id: string) =>
    updateProgress({ ...progress, selected: id });
  const commit = (next: Procedure[]) => {
    try {
      localStorage.setItem(procedureKey, JSON.stringify(next));
      setItems(next);
      notifyProcedures();
      setMessage(
        "기관 절차를 저장했습니다. 변경된 원문과 기한을 다시 확인하세요.",
      );
      return true;
    } catch {
      setMessage("기기 저장에 실패했습니다. 기존 절차는 유지됩니다.");
      return false;
    }
  };
  const current = items.find((p) => p.id === selected);
  const state = current
    ? currentRecord(current, progress.records[current.id])
    : { stale: false, checks: [], note: "" };
  const checks = state.checks;
  const updateRecord = (patch: { checks?: number[]; note?: string }) => {
    if (!current) return;
    updateProgress({
      ...progress,
      records: {
        ...Object.fromEntries(
          Object.entries(progress.records)
            .filter(
              ([id]) => id !== current.id && items.some((p) => p.id === id),
            )
            .slice(0, 99),
        ),
        [current.id]: {
          snapshot: procedureSnapshot(current),
          checks: state.checks,
          note: state.note,
          ...patch,
        },
      },
    });
  };
  const results = findProcedures(items, query);
  const newDraft = (): Procedure => ({
    id: crypto.randomUUID(),
    title: "",
    keywords: "",
    institution,
    source: "",
    version: "",
    text: "",
    steps: [{ action: "", deadline: "", form: "", quote: "" }],
  });
  return (
    <>
      <EffectEvidence app="seomu" task="규정 확인·업무 절차 처리" />
      <div className="portal-heading">
        <div>
          <h1>기관 규정·절차 관리</h1>
          <p>
            규정에서 절차 후보를 만들고 검토해 두면, 직원은 상황만 말해 업무를
            시작할 수 있습니다.
          </p>
        </div>
        <button className="primary" onClick={() => setDraft(newDraft())}>
          기관 절차 등록
        </button>
      </div>
      <section className="portal-panel">
        <p className="small muted">
          AI가 만든 절차는 저장 전 초안입니다. 관리자가 원문·적용 조건·누락을
          검토한 뒤 저장합니다. 원본 파일은 수정하지 않으며 현재 브라우저에 별도
          저장합니다.
        </p>
        <label>
          지금 어떤 일을 해야 하나요?
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 교육자료 취합, 출장 정산"
          />
        </label>
        <div className="ai-links">
          <button
            className="secondary"
            onClick={() => {
              if (items.some((p) => p.id === sampleProcedure.id)) {
                setSelected(sampleProcedure.id);
                return;
              }
              if (commit([...items, sampleProcedure]))
                setSelected(sampleProcedure.id);
            }}
          >
            가상 절차 체험
          </button>
          <button
            className="secondary"
            onClick={() => {
              try {
                saveFile(
                  "기관절차-처리기록.json",
                  JSON.stringify(procedureBundle(items, progress), null, 2),
                  "application/json",
                );
              } catch (err) {
                setMessage(
                  err instanceof Error ? err.message : "묶음 저장 실패",
                );
              }
            }}
          >
            절차·처리기록 묶음 저장
          </button>
          <label>
            절차·처리기록 묶음 가져오기
            <input
              type="file"
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setIncoming(null);
                try {
                  if (f.size > 2000000)
                    throw Error("2MB 이하 파일을 선택하세요.");
                  setIncoming({
                    bundle: parseProcedureBundle(await f.text()),
                    name: f.name,
                  });
                } catch (err) {
                  setMessage(
                    err instanceof Error ? err.message : "불러오기 실패",
                  );
                }
              }}
            />
          </label>
          <p>
            묶음은 근거 원문과 업무건 메모가 포함된 평문 파일입니다. 공유 전에
            내용을 검토하세요. 파일은 서버로 전송하지 않습니다.
          </p>
        </div>
      </section>
      {incoming && importPlan && (
        <section
          className="portal-panel"
          aria-label="기관 절차 가져오기 미리보기"
        >
          <h2>가져오기 미리보기</h2>
          <p>파일: {incoming.name}</p>
          <p>
            전체 {incoming.bundle.procedures.length}개 · 새로 추가{" "}
            {importPlan.accepted.length}개 · ID·이름 충돌 또는 100개 제한으로
            제외 {importPlan.excluded.length}개
          </p>
          <p>
            기존 절차와 기록은 덮어쓰지 않습니다. 가져온 처리 확인은 모두
            해제되며 받는 담당자가 다시 확인해야 합니다. 메모와 원래 근거 버전은
            보존합니다. 이전 기관의 문서 서버 연결은 해제하므로 받는 기관의
            원문과 다시 연결하세요.
          </p>
          {importPlan.accepted.map((p) => (
            <p key={p.id}>
              추가: {p.title} · {p.institution} · {p.source}
            </p>
          ))}
          {importPlan.excluded.map((p) => (
            <p key={p.id}>제외: {p.title}</p>
          ))}
          <button
            className="primary"
            disabled={!importPlan.accepted.length}
            onClick={() => {
              let result;
              try {
                result = persistProcedureImport(
                  localStorage,
                  importPlan.items,
                  importPlan.progress,
                );
              } catch {
                setMessage(
                  "기기 저장소에 접근할 수 없어 가져오기를 적용하지 않았습니다.",
                );
                return;
              }
              if (!result.ok) {
                setMessage(
                  result.rollbackFailed
                    ? "저장과 원복에 실패했습니다. 성공 처리하지 않았습니다. 새로고침 전에 기존 묶음을 따로 저장하고 기기 저장공간을 확인하세요."
                    : "저장에 실패하여 기존 저장값으로 원복했습니다. 가져오기를 적용하지 않았습니다.",
                );
                return;
              }
              setItems(importPlan.items);
              notifyProcedures();
              setProgress(importPlan.progress);
              setStorageWarning("");
              setIncoming(null);
              setMessage(
                "새 절차를 추가했습니다. 가져온 처리 확인은 0개이며 원문을 다시 확인하세요.",
              );
            }}
          >
            새 절차만 추가
          </button>
          <button className="secondary" onClick={() => setIncoming(null)}>
            가져오기 취소
          </button>
        </section>
      )}
      {storageWarning && (
        <p role="alert" className="local-note">
          {storageWarning}
        </p>
      )}
      {message && (
        <p role="status" className="local-note">
          {message}
        </p>
      )}
      <ProcedureDraftBuilder
        institution={institution}
        seed={seed}
        onDraft={setDraft}
        onConnect={onConnect}
      />
      {draft && (
        <section className="portal-panel">
          <h2>규정과 절차 편집</h2>
          {(
            ["title", "keywords", "institution", "source", "version"] as const
          ).map((k, i) => (
            <label key={k}>
              {
                [
                  "절차 이름",
                  "검색어",
                  "적용 기관",
                  "근거 문서명·출처",
                  "시행일·문서 버전",
                ][i]
              }
              <input
                maxLength={1000}
                value={draft[k]}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
              />
            </label>
          ))}
          <label>
            근거 원문
            <textarea
              rows={6}
              maxLength={50000}
              value={draft.text}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  text: e.target.value,
                  sourceDocument: undefined,
                })
              }
            />
          </label>
          <details open={!!draft.questions?.length}>
            <summary>
              상황에 따라 달라지는 조건 질문 {draft.questions?.length || 0}개
            </summary>
            <p>필요한 조건만 질문합니다. 각 단계에 적용할 답을 연결하세요.</p>
            {(draft.questions || []).map((q) => (
              <fieldset key={q.id}>
                <legend>조건 질문</legend>
                <label>
                  질문
                  <input
                    value={q.label}
                    maxLength={300}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        questions: draft.questions?.map((x) =>
                          x.id === q.id ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  조건의 원문 근거
                  <textarea
                    value={q.quote}
                    maxLength={3000}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        questions: draft.questions?.map((x) =>
                          x.id === q.id ? { ...x, quote: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                {q.options.map((o) => (
                  <label key={o.value}>
                    선택지 · {o.value}
                    <input
                      value={o.label}
                      maxLength={200}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          questions: draft.questions?.map((x) =>
                            x.id === q.id
                              ? {
                                  ...x,
                                  options: x.options.map((v) =>
                                    v.value === o.value
                                      ? {
                                          ...v,
                                          label: e.target.value,
                                          phrases: undefined,
                                        }
                                      : v,
                                  ),
                                }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                <button
                  className="secondary"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      questions: draft.questions?.filter((x) => x.id !== q.id),
                      steps: draft.steps.map((s) =>
                        s.condition?.questionId === q.id
                          ? { ...s, condition: null }
                          : s,
                      ),
                    })
                  }
                >
                  조건 질문 제거
                </button>
              </fieldset>
            ))}
            <button
              className="secondary"
              disabled={(draft.questions?.length || 0) >= 8}
              onClick={() =>
                setDraft({
                  ...draft,
                  questions: [
                    ...(draft.questions || []),
                    {
                      id: "q_" + crypto.randomUUID().replaceAll("-", ""),
                      label: "",
                      quote: "",
                      options: [
                        { value: "yes", label: "해당함" },
                        { value: "no", label: "해당하지 않음" },
                      ],
                    },
                  ],
                })
              }
            >
              조건 질문 추가
            </button>
          </details>
          {draft.steps.map((s, i) => (
            <fieldset key={i}>
              <legend>{i + 1}단계</legend>
              {(["action", "deadline", "form", "quote"] as const).map(
                (k, n) => (
                  <label key={k}>
                    {
                      [
                        "할 일",
                        "기한 · 미확인은 그대로 표시",
                        "필요 서류·서식",
                        "원문에서 그대로 발췌한 근거",
                      ][n]
                    }
                    <input
                      maxLength={3000}
                      value={s[k]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          steps: draft.steps.map((v, j) =>
                            j === i ? { ...v, [k]: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  </label>
                ),
              )}
              <label>
                이 단계의 적용 조건
                <select
                  value={
                    s.condition
                      ? `${s.condition.questionId}:${s.condition.value}`
                      : ""
                  }
                  onChange={(e) => {
                    const [questionId, value] = e.target.value.split(":");
                    setDraft({
                      ...draft,
                      steps: draft.steps.map((v, j) =>
                        j === i
                          ? {
                              ...v,
                              condition: questionId
                                ? { questionId, value }
                                : null,
                            }
                          : v,
                      ),
                    });
                  }}
                >
                  <option value="">모든 상황에 적용</option>
                  {(draft.questions || []).flatMap((q) =>
                    q.options.map((o) => (
                      <option
                        key={`${q.id}:${o.value}`}
                        value={`${q.id}:${o.value}`}
                      >
                        {q.label} → {o.label}
                      </option>
                    )),
                  )}
                </select>
              </label>
              <button
                className="secondary"
                onClick={() =>
                  setDraft({
                    ...draft,
                    steps: draft.steps.filter((_, j) => j !== i),
                  })
                }
              >
                이 단계 제거
              </button>
            </fieldset>
          ))}
          <div className="ai-links">
            <button
              className="secondary"
              disabled={draft.steps.length >= 30}
              onClick={() =>
                setDraft({
                  ...draft,
                  steps: [
                    ...draft.steps,
                    { action: "", deadline: "", form: "", quote: "" },
                  ],
                })
              }
            >
              단계 추가
            </button>
            <button
              className="primary"
              onClick={() => {
                if (
                  !validProcedure(draft) ||
                  !draft.text.trim() ||
                  !draft.source.trim() ||
                  !draft.version.trim() ||
                  !draft.steps.length
                ) {
                  setMessage(
                    "이름·근거 원문·출처·버전과 한 단계 이상을 입력하세요.",
                  );
                  return;
                }
                const issues = procedureIssues(draft);
                if (issues.length) {
                  setMessage(issues.join(" / "));
                  return;
                }
                if (
                  items.length >= 100 &&
                  !items.some((p) => p.id === draft.id)
                ) {
                  setMessage("절차는 최대 100개입니다.");
                  return;
                }
                if (
                  commit([...items.filter((p) => p.id !== draft.id), draft])
                ) {
                  setSelected(draft.id);
                  setDraft(null);
                }
              }}
            >
              원문과 대조하여 저장
            </button>
            <button className="secondary" onClick={() => setDraft(null)}>
              편집 취소
            </button>
          </div>
        </section>
      )}
      <section className="portal-panel">
        <h2>찾은 절차 {results.length}개</h2>
        {!results.length && (
          <p>
            일치하는 등록 절차가 없습니다. 기관 지침을 등록하거나 검색어를
            줄여주세요.
          </p>
        )}
        {results.map((p) => (
          <button
            className="secondary"
            key={p.id}
            onClick={() => setSelected(p.id)}
          >
            {p.title} · {p.institution}
          </button>
        ))}
      </section>
      {current && (
        <section className="portal-panel">
          <h2>{current.title}</h2>
          <p>
            적용 기관: {current.institution} · 버전: {current.version}
          </p>
          <p>출처: {current.source}</p>
          <section aria-label="현재 처리 기록">
            <h3>현재 처리 기록</h3>
            <p>
              이 브라우저에 절차별 현재 업무건 하나를 보관합니다. 공식 결재·지급
              확정과 별개입니다.
            </p>
            <label>
              업무건·대상 메모 (선택)
              <input
                maxLength={1000}
                value={state.note}
                disabled={state.stale}
                onChange={(e) => updateRecord({ note: e.target.value })}
              />
            </label>
            {state.stale ? (
              <p role="alert">
                근거·버전·단계가 변경되었습니다. 이전 처리 확인은 완료에
                포함하지 않습니다. 원문을 다시 확인하고 시작하세요.
              </p>
            ) : (
              <p>
                {checks.length}/{current.steps.length}단계 처리 확인 · 이 화면의
                기록을 이어서 처리할 수 있습니다.
              </p>
            )}
            <button
              className="secondary"
              onClick={() => {
                if (
                  window.confirm(
                    "현재 처리 확인과 메모를 지우고 새 업무건을 시작할까요?",
                  )
                )
                  updateRecord({ checks: [], note: "" });
              }}
            >
              새 업무건 시작 · 기록 초기화
            </button>
            {state.stale && (
              <button
                className="secondary"
                onClick={() => updateRecord({ checks: [] })}
              >
                변경 원문 재확인 후 처리 기록 시작
              </button>
            )}
          </section>
          <button
            className="secondary"
            onClick={() => setDraft(structuredClone(current))}
          >
            규정·절차 수정
          </button>
          <button
            className="secondary"
            onClick={() => {
              if (commit(items.filter((p) => p.id !== current.id)))
                setSelected("");
            }}
          >
            등록 절차 삭제 · 원본 파일 유지
          </button>
          {procedureIssues(current).length > 0 && (
            <p role="alert">
              등록 근거를 다시 대조하세요:{" "}
              {procedureIssues(current).join(" / ")}
            </p>
          )}
          {current.steps.map((s, i) => (
            <article key={i}>
              <h3>
                {i + 1}. {s.action}
              </h3>
              <p>
                기한: {s.deadline || "미확인"} / 필요 서류: {s.form || "미확인"}
              </p>
              <blockquote>{s.quote || "근거 미입력"}</blockquote>
              <label>
                <input
                  type="checkbox"
                  checked={checks.includes(i)}
                  disabled={state.stale}
                  onChange={(e) =>
                    updateRecord({
                      checks: e.target.checked
                        ? [...checks, i]
                        : checks.filter((x) => x !== i),
                    })
                  }
                />
                원문과 조건을 확인하고 이 단계를 처리함
              </label>
            </article>
          ))}
          <p>
            다음 할 일:{" "}
            {current.steps.find((_, i) => !checks.includes(i))?.action ||
              "모든 단계 처리 확인 · 공식 결재·지급 확정과 별개"}
          </p>
          <button
            className="secondary"
            onClick={() =>
              saveFile(
                "업무절차-확인기록.txt",
                procedureRecordText(current, progress.records[current.id]),
                "text/plain;charset=utf-8",
              )
            }
          >
            절차·근거·현재 확인기록 저장
          </button>
          <details>
            <summary>근거 원문 펼치기</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>{current.text}</pre>
          </details>
        </section>
      )}
    </>
  );
}

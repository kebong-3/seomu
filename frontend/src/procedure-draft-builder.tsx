import { useEffect, useState } from "react";
import { api, key } from "./api";
import { AISelector } from "./ai-settings";
import type { Doc, Status } from "./types";
import type { Procedure } from "./procedures";

export type ProcedureSeed = { doc: Doc };
export function ProcedureDraftBuilder({
  institution,
  seed,
  onDraft,
  onConnect,
}: {
  institution: string;
  seed?: ProcedureSeed;
  onDraft: (p: Procedure) => void;
  onConnect: () => void;
}) {
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [provider, setProvider] = useState("evidence");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [bound, setBound] = useState<Procedure["sourceDocument"]>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh() {
    if (!key()) return;
    try {
      const s = await api<Status>("/api/status");
      setStatus(s);
    } catch {
      setMessage(
        "문서 서버 연결을 확인해 주세요. 원문 붙여넣기와 문단 나누기는 서버 없이 사용할 수 있습니다.",
      );
    }
  }
  function useDoc(d: Doc) {
    const body = (d.blocks || []).map((b) => b.text).join("\n");
    if (body.length > 24000) {
      setMessage(
        "원문이 24,000자를 넘습니다. 업무별로 나눈 원문을 붙여넣어 주세요.",
      );
      return;
    }
    setText(body);
    setSource(d.path);
    setVersion("문서 v" + d.version);
    setBound({ id: d.id, version: d.version });
    setMessage(
      "인식된 원문을 가져왔습니다. 문서의 시행일·적용범위를 확인하세요.",
    );
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (seed) useDoc(seed.doc);
  }, [seed]);
  async function loadDocs() {
    setBusy(true);
    try {
      setDocs(await api<Doc[]>("/api/documents"));
      setMessage("인식 완료된 문서를 선택하세요.");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "문서 목록을 읽지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function create(ai: boolean) {
    if (!text.trim() || !source.trim() || !version.trim()) {
      setMessage("출처·버전·근거 원문을 먼저 넣어 주세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      let p: Procedure;
      if (ai) {
        const r = await api<{
          procedure: Procedure;
          warnings: string[];
          model_run: { provider: string; model: string };
        }>("/api/procedures/draft", {
          method: "POST",
          body: JSON.stringify({
            provider,
            text,
            source,
            version,
            institution: institution || "적용 기관 확인 필요",
          }),
        });
        p = r.procedure;
        setMessage(
          `${r.model_run.provider} · ${r.model_run.model} 초안입니다. ${r.warnings.join(" ")}`,
        );
      } else {
        const lines = text
          .split(/\n+/)
          .map((x) => x.trim())
          .filter((x) => x.length > 4);
        if (lines.length > 30)
          throw Error("문단이 30개를 넘습니다. 업무별로 나누어 주세요.");
        p = {
          id: crypto.randomUUID(),
          title: source.replace(/\.[^.]+$/, ""),
          keywords: "",
          institution: institution || "적용 기관 확인 필요",
          source,
          version,
          text,
          steps: lines.map((line) => ({
            action: line.slice(0, 250),
            deadline: "",
            form: "",
            quote: line,
          })),
        };
        setMessage(
          "원문을 문단으로 나눴습니다. AI 분석이 아니며, 필요한 단계·조건·서식을 편집해 저장하세요.",
        );
      }
      if (bound) p.sourceDocument = bound;
      onDraft(p);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "절차 초안을 만들지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="portal-panel procedure-builder"
      aria-label="규정에서 절차 초안 만들기"
    >
      <h2>규정을 넣고 절차 초안 만들기</h2>
      <p>
        기관 관리자가 한 번 확인해 두면 직원은 상황만 말해 시작할 수 있습니다.
      </p>
      <div className="ai-links">
        <label>
          원문 TXT·MD 가져오기
          <input
            type="file"
            accept=".txt,.md"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                if (f.size > 100000)
                  throw Error("100KB 이하의 원문을 선택하세요.");
                const content = await f.text();
                if (content.length > 24000)
                  throw Error("원문을 24,000자 이하로 나누어 주세요.");
                setText(content);
                setSource(f.name);
                setBound(undefined);
                setMessage("파일을 읽었습니다. 시행일·문서 버전을 지정하세요.");
              } catch (err) {
                setMessage(
                  err instanceof Error ? err.message : "파일 읽기 실패",
                );
              }
            }}
          />
        </label>
        <button
          className="secondary"
          disabled={busy || !key()}
          onClick={() => void loadDocs()}
        >
          문서함의 규정 가져오기
        </button>
        <button className="secondary" onClick={onConnect}>
          PDF·HWP·HWPX 문서 인식
        </button>
      </div>
      {docs.length > 0 && (
        <label>
          인식된 규정 선택
          <select
            defaultValue=""
            disabled={busy}
            onChange={async (e) => {
              if (!e.target.value) return;
              setBusy(true);
              try {
                useDoc(await api<Doc>("/api/documents/" + e.target.value));
              } catch (err) {
                setMessage(
                  err instanceof Error ? err.message : "문서 읽기 실패",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <option value="">문서 선택</option>
            {docs
              .filter((d) => d.block_count > 0)
              .map((d) => (
                <option value={d.id} key={d.id}>
                  {d.path} · v{d.version}
                </option>
              ))}
          </select>
        </label>
      )}
      <div className="assistant-fields">
        <label>
          근거 문서명·출처
          <input
            value={source}
            maxLength={1000}
            disabled={busy}
            onChange={(e) => {
              setSource(e.target.value);
              setBound(undefined);
            }}
          />
        </label>
        <label>
          시행일·문서 버전
          <input
            value={version}
            maxLength={1000}
            disabled={busy}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="예: 2026.10.01 시행"
          />
        </label>
      </div>
      <label>
        근거 원문
        <textarea
          rows={6}
          value={text}
          maxLength={24000}
          disabled={busy}
          onChange={(e) => {
            setText(e.target.value);
            setBound(undefined);
          }}
          placeholder="기관 규정·지침을 붙여넣으세요. 원문에 없는 기한과 서식은 만들지 않습니다."
        />
      </label>
      <AISelector
        options={status?.ai_providers}
        value={provider}
        onChange={setProvider}
      />
      <div className="ai-links">
        <button
          className="primary"
          disabled={busy || provider === "evidence"}
          onClick={() => void create(true)}
        >
          {busy ? "원문을 읽는 중…" : "AI로 절차 초안 정리"}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void create(false)}
        >
          AI 없이 원문 문단 나누기
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          AI 연결 상태 새로 확인
        </button>
      </div>
      <p role="status">{message}</p>
    </section>
  );
}

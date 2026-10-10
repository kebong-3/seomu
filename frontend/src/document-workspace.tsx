import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  FolderOpen,
  Files,
  Search,
  LayoutDashboard,
  CheckCheck,
  Settings as SettingsIcon,
  ArrowUpRight,
  Upload,
  FolderPlus,
  Sparkles,
  ChevronRight,
  RefreshCw,
  X,
  Download,
  FileText,
  AlertTriangle,
  Link,
  CalendarDays,
  Plus,
  LogOut,
  Trash2,
  Check,
  LoaderCircle,
  ShieldCheck,
  BookOpen,
} from "lucide-react";
import { api, base, download, key } from "./api";
import type {
  Doc,
  Answer,
  Job,
  Task,
  Proposal,
  Status,
  Evidence,
} from "./types";
import "./styles.css";

type View = "home" | "documents" | "ask" | "tasks" | "settings";
const statusLabel: Record<string, string> = {
  ready: "인식 완료",
  needs_review: "원본 확인",
  failed: "인식 실패",
  unsupported: "형식 미지원",
  pending: "재인식 대기",
  queued: "대기",
  processing: "인식 중",
  unchanged: "변경 없음",
  completed: "완료",
  completed_with_issues: "완료 · 보완 필요",
};
const fmt = (n: number) =>
  n >= 1024 * 1024
    ? (n / (1024 * 1024)).toFixed(1) + " MB"
    : Math.ceil(n / 1024) + " KB";
function Badge({ status }: { status: string }) {
  return (
    <span className={"badge " + status}>{statusLabel[status] || status}</span>
  );
}

export function DocumentWorkspace({
  initialView = "documents",
  onRequest,
}: {
  initialView?: View;
  onRequest?: (source: { title: string; reference: string }) => void;
}) {
  const [view, setView] = useState<View>(initialView);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [server, setServer] = useState(base());
  const [access, setAccess] = useState(key());
  const [docs, setDocs] = useState<Doc[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [folder, setFolder] = useState("");
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState("all");
  const [selected, setSelected] = useState<Doc | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [uploading, setUploading] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [owner, setOwner] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null),
    fileInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  async function refresh() {
    const [d, t, s] = await Promise.all([
      api<Doc[]>("/api/documents"),
      api<Task[]>("/api/tasks"),
      api<Status>("/api/status"),
    ]);
    setDocs(d);
    setTasks(t);
    setStatus(s);
  }
  async function connect(e?: React.FormEvent) {
    e?.preventDefault();
    setConnecting(true);
    try {
      const u = server.trim();
      if (u && !/^https?:\/\//.test(u))
        throw new Error("서버 주소는 http:// 또는 https://로 입력해 주세요.");
      localStorage.setItem("seomu-api", u);
      sessionStorage.setItem("seomu-key", access.trim());
      await refresh();
      setConnected(true);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setConnecting(false);
    }
  }
  useEffect(() => {
    if (key()) void connect();
  }, []);
  useEffect(() => setView(initialView), [initialView]);
  useEffect(() => {
    if (message) {
      const id = setTimeout(() => setMessage(""), 6500);
      return () => clearTimeout(id);
    }
  }, [message]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setProposal(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!job || ["completed", "completed_with_issues"].includes(job.state))
      return;
    let stopped = false;
    const tick = async () => {
      try {
        const j = await api<Job>("/api/imports/" + job.id);
        if (stopped) return;
        setJob(j);
        if (["completed", "completed_with_issues"].includes(j.state))
          await refresh();
      } catch (e) {
        if (!stopped) setMessage((e as Error).message);
      }
    };
    const id = setInterval(() => void tick(), 1200);
    void tick();
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [job?.id, job?.state]);
  const folders = useMemo(() => {
    const f = new Set<string>();
    for (const d of docs) {
      const parts = d.path.split("/");
      for (let i = 1; i < parts.length; i++) f.add(parts.slice(0, i).join("/"));
    }
    return [...f].sort();
  }, [docs]);
  const filtered = docs.filter(
    (d) =>
      (!folder || d.path.startsWith(folder + "/") || d.path === folder) &&
      (docFilter === "all" ||
        (docFilter === "issues" && d.status !== "ready") ||
        docFilter === d.status) &&
      (!query ||
        d.name.toLowerCase().includes(query.toLowerCase()) ||
        d.path.includes(query)),
  );
  const issues = docs.filter((d) =>
    ["failed", "unsupported", "needs_review"].includes(d.status),
  );
  const ready = docs.filter((d) =>
    ["ready", "needs_review"].includes(d.status),
  );
  const active = tasks.filter((t) => t.status !== "done");
  const today = new Date().toLocaleDateString("sv-SE");
  async function runJob(id: string) {
    setJob(await api<Job>("/api/imports/" + id));
    setView("documents");
  }
  async function upload(list: FileList | File[] | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    if (files.length > 500) {
      setMessage(
        "한 번에 500개까지 가져올 수 있습니다. 하위 폴더로 나누어 주세요.",
      );
      return;
    }
    if (
      files.some((f) => f.size > 30 * 1024 * 1024) ||
      files.reduce((n, f) => n + f.size, 0) > 200 * 1024 * 1024
    ) {
      setMessage("파일당 30MB, 전체 200MB까지 가져올 수 있습니다.");
      return;
    }
    setUploading(true);
    const data = new FormData();
    files.forEach((f) => data.append("files", f));
    data.append(
      "paths",
      JSON.stringify(files.map((f) => f.webkitRelativePath || f.name)),
    );
    try {
      const r = await api<{ job_id: string }>("/api/imports", {
        method: "POST",
        body: data,
      });
      await runJob(r.job_id);
      setMessage("문서를 가져왔습니다. 인식 결과를 확인해 주세요.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setUploading(false);
      if (folderInput.current) folderInput.current.value = "";
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function openDoc(id: string) {
    try {
      setSelected(await api<Doc>("/api/documents/" + id));
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function ask(text = query) {
    if (text.trim().length < 2) return;
    setQuery(text);
    setAsking(true);
    setAnswer(null);
    setView("ask");
    try {
      setAnswer(
        await api<Answer>("/api/ask", {
          method: "POST",
          body: JSON.stringify({ question: text, folder }),
        }),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setAsking(false);
    }
  }
  async function propose(id: string) {
    try {
      const p = await api<Proposal>("/api/documents/" + id + "/task-proposal");
      setProposal(p);
      setOwner("");
      setConfirmed(false);
      setSelected(null);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function saveTask() {
    if (!proposal) return;
    setSaving(true);
    try {
      await api("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: proposal.title,
          deadline: proposal.deadline,
          owner,
          source_id: proposal.source_id,
          source_version: proposal.source_version,
          source_locator: proposal.evidence[0]?.locator || "",
          confirmed,
        }),
      });
      setProposal(null);
      await refresh();
      setView("tasks");
      setMessage("확인한 업무를 등록했습니다.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function changeTask(t: Task, value: string) {
    try {
      await api("/api/tasks/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({ status: value }),
      });
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function reprocess(id: string) {
    try {
      const r = await api<{ job_id: string }>(
        "/api/documents/" + id + "/reprocess",
        { method: "POST" },
      );
      setSelected(null);
      await runJob(r.job_id);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function demo() {
    try {
      const r = await api<{ job_id: string }>("/api/demo", { method: "POST" });
      await runJob(r.job_id);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  async function scan(root: string) {
    try {
      const r = await api<{ job_id: string }>("/api/local-scan", {
        method: "POST",
        body: JSON.stringify({ root }),
      });
      await runJob(r.job_id);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const nav: [View, string, React.ElementType][] = [
    ["home", "오늘의 서무", LayoutDashboard],
    ["documents", "우리 부서 문서함", FolderOpen],
    ["ask", "근거 찾아보기", Sparkles],
    ["tasks", "업무·마감 관리", CheckCheck],
    ["settings", "연결·인식 설정", SettingsIcon],
  ];
  function evidenceCard(e: Evidence) {
    return (
      <button
        className="evidence"
        key={e.id}
        onClick={() => void openDoc(e.document_id)}
      >
        <span className="evidence-title">
          <span className="citation">{e.citation || "근거"}</span>
          {e.name}
          <ArrowUpRight size={16} />
        </span>
        <span className="muted small">
          {e.path} · v{e.version} · {e.locator}
        </span>
        <span className="excerpt">{e.text.slice(0, 450)}</span>
      </button>
    );
  }
  if (!connected)
    return (
      <div className="connect-page">
        <div className="connect-art">
          <div className="logo big">
            <Files size={32} />
          </div>
          <span className="eyebrow">YOUR DEPARTMENT, CONNECTED</span>
          <h1>
            문서가 쌓여도,
            <br />
            업무는 가볍게.
          </h1>
          <p>
            폴더 속 문서를 읽고, 근거를 찾고,
            <br />
            놓치기 쉬운 마감까지 함께 정리해요.
          </p>
          <div className="art-stack">
            <div>
              <FolderOpen />
              우리 부서의 문서 폴더
              <Check className="green" />
            </div>
            <div>
              <Search />
              파일명 너머, 본문과 표까지
              <Check className="green" />
            </div>
            <div>
              <CalendarDays />
              확인한 기한을 업무로
              <Check className="green" />
            </div>
          </div>
          <span className="art-foot">서무비서 · Document Workspace 0.2</span>
        </div>
        <form className="connect-form" onSubmit={connect}>
          <span className="eyebrow purple">WORKSPACE CONNECTION</span>
          <h2>문서 인식 서버 연결</h2>
          <p className="muted">내 문서를 보관할 서버와 연결해 주세요.</p>
          <label>
            서버 주소
            <input
              placeholder="같은 서버면 빈칸 / https://내서버주소"
              value={server}
              onChange={(e) => setServer(e.target.value)}
            />
          </label>
          <label>
            연결 키
            <input
              type="password"
              autoComplete="off"
              placeholder="서버에서 발급한 연결 키"
              required
              value={access}
              onChange={(e) => setAccess(e.target.value)}
            />
          </label>
          <button className="primary wide" disabled={connecting}>
            {connecting ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <Link size={18} />
            )}{" "}
            {connecting ? "연결 확인 중" : "문서 서버 연결"}
          </button>
          <div className="inline-note">
            <ShieldCheck size={20} />
            <span>
              문서는 연결한 서버에 저장됩니다.
              <br />
              연결 키는 이 탭을 사용하는 동안만 보관합니다.
            </span>
          </div>
          <details>
            <summary>처음 실행하는 경우</summary>
            <p>
              실행 안내에 따라 서버를 시작하고,{" "}
              <code>python -m app.cli token</code>으로 연결 키를 확인하세요.
              폴더 자동 확인은 PC에서 로컬 연결기를 실행해야 합니다.
            </p>
          </details>
          {message && <div className="alert">{message}</div>}
        </form>
      </div>
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("home")}>
          <span className="logo">
            <Files size={23} />
          </span>
          <span>
            서무비서<small>DEPARTMENT WORKSPACE</small>
          </span>
        </button>
        <div className="workspace">
          <span className="dot" />내 부서 문서공간
          <span className="private">PRIVATE</span>
        </div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={view === id ? "nav active" : "nav"}
              onClick={() => {
                setView(id);
                setQuery("");
              }}
            >
              <Icon size={20} />
              {label}
              {id === "documents" && (
                <span className="nav-count">{docs.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="side-folder">
          <div className="section-label">
            문서 폴더{" "}
            <button
              title="폴더 가져오기"
              aria-label="폴더 가져오기"
              onClick={() => folderInput.current?.click()}
            >
              <Plus size={17} />
            </button>
          </div>
          <button
            className={!folder ? "folder active" : "folder"}
            onClick={() => {
              setFolder("");
              setView("documents");
              setQuery("");
            }}
          >
            <FolderOpen size={16} />
            전체 문서
          </button>
          {folders.slice(0, 18).map((f) => (
            <button
              key={f}
              title={f}
              style={{
                paddingLeft: 14 + Math.min(f.split("/").length - 1, 3) * 12,
              }}
              className={folder === f ? "folder active" : "folder"}
              onClick={() => {
                setFolder(f);
                setView("documents");
                setQuery("");
              }}
            >
              <ChevronRight size={13} />
              <FolderOpen size={15} />
              <span>{f.split("/").at(-1)}</span>
            </button>
          ))}
        </div>
        <div className="sidebar-foot">
          <span className="dot" />
          서버 연결됨
          <button
            aria-label="연결 종료"
            title="연결 종료"
            onClick={() => {
              sessionStorage.removeItem("seomu-key");
              setConnected(false);
              setAccess("");
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            내 업무공간
            <ChevronRight size={14} />
            <b>{nav.find((n) => n[0] === view)?.[1]}</b>
          </div>
          <div className="header-right">
            <span>
              <ShieldCheck size={15} />
              개인 업무공간
            </span>
            <button
              className="icon-button"
              title="새로고침"
              aria-label="새로고침"
              onClick={() => void refresh().catch((e) => setMessage(e.message))}
            >
              <RefreshCw size={17} />
            </button>
            <span className="avatar">서</span>
          </div>
        </header>
        <section className="content">
          <input
            hidden
            ref={folderInput}
            type="file"
            multiple
            {...{ webkitdirectory: "", directory: "" }}
            onChange={(e) => void upload(e.target.files)}
          />
          <input
            hidden
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.hwpx,.hwp,.docx,.xlsx,.pptx,.txt,.md,.csv,.tsv,.png,.jpg,.jpeg,.tif,.tiff,.zip"
            onChange={(e) => void upload(e.target.files)}
          />
          {view === "home" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">A LITTLE LESS BUSY</span>
                  <h1>오늘도, 차근차근 정리해요.</h1>
                  <p className="muted">
                    흩어진 문서를 연결하고 확인할 일만 모아두었어요.
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={uploading}
                  onClick={() => folderInput.current?.click()}
                >
                  <FolderPlus size={18} />
                  폴더 가져오기
                </button>
              </div>
              <div className="stats">
                <div className="stat">
                  <span className="stat-icon blue">
                    <Files />
                  </span>
                  <span>
                    우리 부서 문서
                    <b>
                      {docs.length}
                      <small>개</small>
                    </b>
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-icon mint">
                    <CheckCheck />
                  </span>
                  <span>
                    검색 가능한 문서
                    <b>
                      {ready.length}
                      <small>개</small>
                    </b>
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-icon amber">
                    <AlertTriangle />
                  </span>
                  <span>
                    원본·인식 확인
                    <b>
                      {issues.length}
                      <small>개</small>
                    </b>
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-icon violet">
                    <CalendarDays />
                  </span>
                  <span>
                    진행할 업무
                    <b>
                      {active.length}
                      <small>건</small>
                    </b>
                  </span>
                </div>
              </div>
              <div className="hero-search">
                <span className="hero-icon">
                  <Sparkles />
                </span>
                <h2>그 문서, 어디 있었더라?</h2>
                <p>폴더 속 본문과 표에서 필요한 내용을 찾아보세요.</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask();
                  }}
                >
                  <Search size={20} />
                  <input
                    aria-label="문서 질문"
                    placeholder="예: 교육 이수현황 제출기한이 언제인가요?"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={asking || !ready.length}
                  >
                    근거 찾기
                    <ArrowUpRight size={17} />
                  </button>
                </form>
                <div className="suggestions">
                  {[
                    "교육 이수현황 제출기한",
                    "출장 정산 제출서류",
                    "특근매식비 확인사항",
                  ].map((q) => (
                    <button key={q} onClick={() => void ask(q)}>
                      {q}
                      <ChevronRight size={13} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="two-cols">
                <div className="panel">
                  <div className="panel-heading">
                    <h2>확인하면 좋을 문서</h2>
                    <button
                      onClick={() => {
                        setDocFilter("issues");
                        setView("documents");
                      }}
                    >
                      전체 보기
                      <ChevronRight size={15} />
                    </button>
                  </div>
                  {issues.length ? (
                    issues.slice(0, 4).map((d) => (
                      <button
                        className="list-row"
                        key={d.id}
                        onClick={() => void openDoc(d.id)}
                      >
                        <span className="file-icon">
                          <FileText size={20} />
                        </span>
                        <span>
                          <b>{d.name}</b>
                          <small>
                            {d.warnings[0] || "인식 결과를 확인해 주세요."}
                          </small>
                        </span>
                        <Badge status={d.status} />
                      </button>
                    ))
                  ) : (
                    <div className="empty compact">
                      <CheckCheck />
                      <b>
                        {docs.length
                          ? "보완할 문서가 없습니다"
                          : "첫 폴더를 연결해 보세요"}
                      </b>
                      <p>
                        {docs.length
                          ? "추출 결과는 중요한 값부터 원본과 대조하세요."
                          : "문서 인식 상태와 근거를 여기에서 확인해요."}
                      </p>
                    </div>
                  )}
                </div>
                <div className="panel">
                  <div className="panel-heading">
                    <h2>다가오는 마감</h2>
                    <button onClick={() => setView("tasks")}>
                      업무 보기
                      <ChevronRight size={15} />
                    </button>
                  </div>
                  {active.length ? (
                    active.slice(0, 4).map((t) => (
                      <div className="list-row" key={t.id}>
                        <span className="date-icon">
                          <CalendarDays size={20} />
                        </span>
                        <span>
                          <b>{t.title}</b>
                          <small>
                            {t.owner || "담당 미지정"} ·{" "}
                            {t.deadline || "기한 미지정"}
                          </small>
                        </span>
                        {t.deadline && t.deadline < today ? (
                          <span className="badge failed">기한 경과</span>
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="empty compact">
                      <CalendarDays />
                      <b>아직 등록된 업무가 없어요</b>
                      <p>문서를 열고 ‘업무로 만들기’를 선택해 보세요.</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="bottom-banner">
                <BookOpen size={22} />
                <div>
                  <b>먼저 샘플 문서로 살펴볼까요?</b>
                  <span>
                    가상의 교육 요청·출장 안내·취합자료를 실제로 인식합니다.
                  </span>
                </div>
                <button className="secondary" onClick={() => void demo()}>
                  샘플 가져오기
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </>
          )}
          {view === "documents" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">DOCUMENT LIBRARY</span>
                  <h1>
                    {folder ? folder.split("/").at(-1) : "우리 부서 문서함"}
                  </h1>
                  <p className="muted">
                    폴더 구조와 원문 위치를 그대로 유지하며 인식해요.
                  </p>
                </div>
                <div className="actions">
                  <button
                    className="secondary"
                    onClick={() =>
                      void download(
                        "/api/export/documents.csv",
                        "seomu-documents.csv",
                      ).catch((e) => setMessage(e.message))
                    }
                  >
                    <Download size={17} />
                    목록 저장
                  </button>
                  <button
                    className="secondary"
                    disabled={uploading}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload size={17} />
                    파일·ZIP
                  </button>
                  <button
                    className="primary"
                    disabled={uploading}
                    onClick={() => folderInput.current?.click()}
                  >
                    <FolderPlus size={17} />
                    {uploading ? "가져오는 중" : "폴더 가져오기"}
                  </button>
                </div>
              </div>
              {job && (
                <div className="job-panel">
                  <div>
                    <LoaderCircle
                      className={
                        ["queued", "processing"].includes(job.state)
                          ? "spin"
                          : ""
                      }
                      size={20}
                    />
                    <b>{statusLabel[job.state]}</b>
                    <span>
                      {job.done} / {job.total} 파일
                    </span>
                    <button
                      className="icon-button"
                      aria-label="가져오기 현황 닫기"
                      onClick={() => setJob(null)}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <progress value={job.done} max={Math.max(1, job.total)} />
                  <details>
                    <summary>파일별 인식 결과 보기</summary>
                    {job.items?.map((i, n) => (
                      <div className="job-item" key={n}>
                        <span>{i.path}</span>
                        <Badge status={i.state} />
                        <small>{i.message}</small>
                      </div>
                    ))}
                  </details>
                </div>
              )}
              <div className="document-tools">
                <div className="filter-tabs">
                  {[
                    ["all", "전체"],
                    ["ready", "인식 완료"],
                    ["issues", "확인 필요"],
                  ].map(([v, t]) => (
                    <button
                      key={v}
                      className={docFilter === v ? "selected" : ""}
                      onClick={() => setDocFilter(v)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <label className="search-small">
                  <Search size={17} />
                  <input
                    placeholder="파일명·경로 찾기"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="document-table">
                <div className="table-head">
                  <span>문서 이름 / 폴더 경로</span>
                  <span>인식 상태</span>
                  <span>추출 정보</span>
                  <span>버전 · 크기</span>
                  <span />
                </div>
                {filtered.map((d) => (
                  <button
                    className="table-row"
                    key={d.id}
                    onClick={() => void openDoc(d.id)}
                  >
                    <span className="doc-name">
                      <span
                        className={
                          "file-type " + d.name.split(".").at(-1)?.toLowerCase()
                        }
                      >
                        {d.name.split(".").at(-1)?.toUpperCase()}
                      </span>
                      <span>
                        <b>{d.name}</b>
                        <small>{d.path}</small>
                      </span>
                    </span>
                    <span>
                      <Badge status={d.status} />
                      {d.duplicate_count > 1 && (
                        <small className="duplicate">
                          동일 내용 {d.duplicate_count}개
                        </small>
                      )}
                    </span>
                    <span>
                      <b>{d.block_count.toLocaleString()} 블록</b>
                      <small>
                        {d.char_count.toLocaleString()}자 ·{" "}
                        {d.engine || "추출 안 됨"}
                      </small>
                    </span>
                    <span>
                      <b>v{d.version}</b>
                      <small>{fmt(d.size)}</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
                {!filtered.length && (
                  <div className="empty">
                    <FolderOpen size={38} />
                    <h3>
                      {docs.length
                        ? "조건에 맞는 문서가 없어요"
                        : "폴더 속 문서를 한 번에 가져오세요"}
                    </h3>
                    <p>
                      하위 폴더 경로를 유지하고 파일마다 인식 결과를 보여드려요.
                    </p>
                    <button
                      className="primary"
                      onClick={() => folderInput.current?.click()}
                    >
                      <FolderPlus size={17} />
                      폴더 선택
                    </button>
                  </div>
                )}
              </div>
              <p className="caption">
                폴더 선택은 현재 파일을 가져오는 방식입니다. 지속적인 변경
                확인은 연결·인식 설정의 로컬 폴더 연결을 사용하세요.
              </p>
            </>
          )}
          {view === "ask" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">ANSWERS WITH EVIDENCE</span>
                  <h1>답변의 근거부터 확인해요.</h1>
                  <p className="muted">
                    파일명, 원문 위치, 문서 버전을 함께 보여드려요.
                  </p>
                </div>
                <span className="mode-chip">
                  <span className="dot" />
                  {status?.ai_configured ? "AI 답변 연결" : "원문 근거 모드"}
                </span>
              </div>
              <div className="ask-layout">
                <div>
                  <form
                    className="ask-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void ask();
                    }}
                  >
                    <label>
                      질문할 문서 범위
                      <select
                        value={folder}
                        onChange={(e) => setFolder(e.target.value)}
                      >
                        <option value="">전체 문서</option>
                        {folders.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </label>
                    <textarea
                      aria-label="질문"
                      placeholder="예: 교육 이수현황 제출기한과 필요한 자료를 알려줘."
                      rows={4}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <button
                      className="primary wide"
                      disabled={asking || query.trim().length < 2}
                    >
                      {asking ? (
                        <LoaderCircle className="spin" size={18} />
                      ) : (
                        <Sparkles size={18} />
                      )}{" "}
                      {asking ? "문서 근거를 찾는 중" : "문서에 질문하기"}
                    </button>
                  </form>
                  <div className="panel answer-panel">
                    {asking ? (
                      <div className="empty">
                        <LoaderCircle className="spin" />
                        <b>선택한 범위의 문서를 확인하고 있어요.</b>
                      </div>
                    ) : answer ? (
                      <>
                        <div className="panel-heading">
                          <h2>
                            {answer.mode === "ai"
                              ? "문서 기반 AI 답변"
                              : "찾아낸 원문 근거"}
                          </h2>
                          <span className="badge ready">
                            {answer.evidence.length}개 근거
                          </span>
                        </div>
                        <div className="answer-text">{answer.answer}</div>
                        {answer.warnings.map((w, i) => (
                          <div className="inline-alert" key={i}>
                            <AlertTriangle size={16} />
                            {w}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="empty">
                        <Sparkles size={35} />
                        <h3>우리 부서 문서가 답변의 출발점입니다.</h3>
                        <p>
                          관련 내용이 없으면 근거 부족을 표시해요.
                          <br />
                          기한·금액처럼 중요한 값은 원문을 함께 확인하세요.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <aside className="evidence-column">
                  <div className="panel-heading">
                    <h2>원문 근거</h2>
                    <span className="muted small">클릭해서 문서 열기</span>
                  </div>
                  {answer?.evidence.map(evidenceCard)}
                  {!answer?.evidence.length && (
                    <div className="evidence-placeholder">
                      <FileText size={30} />
                      <p>
                        답변에 사용한 문서의
                        <br />
                        실제 추출 위치가 표시됩니다.
                      </p>
                    </div>
                  )}
                </aside>
              </div>
              <div ref={endRef} />
            </>
          )}
          {view === "tasks" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">FOLLOW THROUGH</span>
                  <h1>확인한 내용을, 할 일로.</h1>
                  <p className="muted">
                    원문과 기한을 확인한 업무만 등록합니다.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setView("documents");
                    setMessage("문서를 열고 ‘업무로 만들기’를 선택해 주세요.");
                  }}
                >
                  <Plus size={17} />
                  문서로 업무 만들기
                </button>
              </div>
              <div className="kanban">
                {[
                  ["todo", "할 일"],
                  ["doing", "진행 중"],
                  ["done", "완료"],
                ].map(([state, label]) => (
                  <section key={state} className="kanban-col">
                    <h2>
                      <span className={"state-dot " + state} />
                      {label}
                      <small>
                        {tasks.filter((t) => t.status === state).length}
                      </small>
                    </h2>
                    {tasks
                      .filter((t) => t.status === state)
                      .map((t) => (
                        <article className="task-card" key={t.id}>
                          <span className="task-source">
                            <FileText size={13} />
                            {t.source_name || "원문 삭제됨"}
                          </span>
                          <h3>{t.title}</h3>
                          <div className="task-meta">
                            <CalendarDays size={15} />
                            {t.deadline || "기한 미지정"}
                            <span>{t.owner || "담당 미지정"}</span>
                          </div>
                          {t.source_version !== t.current_source_version && (
                            <div className="inline-alert">
                              원문이 변경·삭제되었습니다. 재확인하세요.
                            </div>
                          )}
                          <div className="task-actions">
                            <button
                              disabled={!t.source_id}
                              onClick={() =>
                                t.source_id && void openDoc(t.source_id)
                              }
                            >
                              원문 보기
                            </button>
                            <select
                              aria-label={t.title + " 상태"}
                              value={t.status}
                              onChange={(e) =>
                                void changeTask(t, e.target.value)
                              }
                            >
                              <option value="todo">할 일</option>
                              <option value="doing">진행 중</option>
                              <option value="done">완료</option>
                            </select>
                          </div>
                        </article>
                      ))}
                    {!tasks.some((t) => t.status === state) && (
                      <div className="kanban-empty">등록된 업무가 없어요</div>
                    )}
                  </section>
                ))}
              </div>
            </>
          )}
          {view === "settings" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">CONNECTED, YOUR WAY</span>
                  <h1>문서를 읽는 방법을 확인해요.</h1>
                  <p className="muted">
                    실제 연결 상태를 표시합니다. 모델 설정은 서버에서 변경해요.
                  </p>
                </div>
              </div>
              <div className="two-cols">
                <section className="panel settings-panel">
                  <h2>인식·검색 상태</h2>
                  {[
                    ["기본 인식기", status?.parser || "-"],
                    [
                      "한국어 OCR",
                      status?.ocr_languages.includes("kor")
                        ? "한국어 언어팩 준비됨"
                        : "한국어 언어팩 설치 필요",
                    ],
                    [
                      "스캔 PDF 렌더링",
                      status?.pdf_ocr_available
                        ? "준비됨"
                        : "pdftoppm 설치 필요",
                    ],
                    [
                      "HWP 파서",
                      status?.hwp_available ? "설치됨" : "설치 필요",
                    ],
                    [
                      "Docling 선택 모듈",
                      status?.docling_available
                        ? "설치됨"
                        : "미설치 · 기본 인식 사용",
                    ],
                    [
                      "의미검색 모델",
                      status?.semantic_configured
                        ? "설정됨 · 인덱싱 상태 확인"
                        : "미연결 · 한국어 키워드 검색",
                    ],
                    [
                      "생성형 AI",
                      status?.ai_configured
                        ? "연결 설정됨 · 질문으로 검증"
                        : "미연결 · 원문 근거 모드",
                    ],
                  ].map(([k, v]) => (
                    <div className="setting-row" key={k}>
                      <span>{k}</span>
                      <b>{v}</b>
                    </div>
                  ))}
                  {status?.semantic_error && (
                    <div className="alert">
                      의미검색 오류: {status.semantic_error}
                    </div>
                  )}
                  <p className="caption">
                    Docling·의미검색은 별도 설치·모델 준비가 필요한 선택
                    기능입니다. 공개 Hugging Face 데모로 문서를 전송하지
                    않습니다.
                  </p>
                </section>
                <section className="panel settings-panel">
                  <h2>등록한 로컬 폴더</h2>
                  {status?.roots.length ? (
                    status.roots.map((root) => (
                      <div className="root-row" key={root}>
                        <FolderOpen size={21} />
                        <b>{root}</b>
                        <button
                          className="secondary"
                          onClick={() => void scan(root)}
                        >
                          <RefreshCw size={16} />
                          변경 확인
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="empty compact">
                      <FolderOpen />
                      <b>서버에 등록한 폴더가 없습니다.</b>
                      <p>
                        PC에서 서버를 실행할 때 문서 폴더를 등록하면
                        <br />
                        원본을 수정하지 않고 변경 문서를 가져옵니다.
                      </p>
                    </div>
                  )}
                  <div className="inline-note">
                    <BookOpen size={18} />
                    <span>
                      웹에서 고른 PC 폴더는 자동으로 계속 읽을 수 없어요. 로컬
                      실행의 <b>폴더 연결기</b>는 지정한 폴더를 주기적으로
                      확인합니다. 삭제한 원본의 색인은 자동 삭제하지 않으며
                      문서함에서 정리할 수 있습니다.
                    </span>
                  </div>
                </section>
              </div>
              <div className="panel settings-panel">
                <h2>지금 사용할 수 있는 문서</h2>
                <div className="format-tags">
                  {[
                    "HWPX",
                    "HWP",
                    "PDF",
                    "DOCX",
                    "XLSX",
                    "PPTX",
                    "TXT",
                    "MD",
                    "CSV",
                    "TSV",
                    "PNG",
                    "JPEG",
                    "TIFF",
                    "ZIP",
                  ].map((f) => (
                    <span key={f}>{f}</span>
                  ))}
                </div>
                <p className="muted">
                  PDF는 페이지, Excel은 시트·행·셀, HWPX는 섹션·문단·표 위치를
                  보존합니다. 스캔·복잡한 표는 원본 확인이 필요하며, HWP
                  구형·암호화 파일은 인식에 제한이 있습니다.
                </p>
                <p className="caption">
                  단일 개인 업무공간 버전입니다. 직원별 계정·기관 SSO·공식
                  결재·부서별 접근권한은 추가 구현 대상입니다.
                </p>
              </div>
            </>
          )}
        </section>
      </main>
      {message && (
        <div role="status" className="toast">
          <AlertTriangle size={18} />
          {message}
          <button aria-label="알림 닫기" onClick={() => setMessage("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <section
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="문서 인식 결과"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-heading">
              <span className="eyebrow">DOCUMENT INSPECTOR</span>
              <button
                className="icon-button"
                aria-label="문서 닫기"
                onClick={() => setSelected(null)}
              >
                <X />
              </button>
            </div>
            <h2>{selected.name}</h2>
            <p className="muted path">{selected.path}</p>
            <div className="drawer-meta">
              <Badge status={selected.status} />
              <span>v{selected.version}</span>
              <span>{selected.char_count.toLocaleString()}자</span>
            </div>
            <div className="drawer-actions">
              {onRequest && (
                <button
                  className="primary"
                  onClick={() =>
                    onRequest({
                      title: selected.name + " 자료 제출",
                      reference: selected.path + " · v" + selected.version,
                    })
                  }
                >
                  <Send size={16} />
                  자료 요청 만들기
                </button>
              )}
              <button
                className="primary"
                disabled={!selected.block_count}
                onClick={() => void propose(selected.id)}
              >
                <Plus size={16} />
                업무로 만들기
              </button>
              <button
                className="secondary"
                onClick={() =>
                  void download(
                    "/api/documents/" + selected.id + "/original",
                    selected.name,
                  ).catch((e) => setMessage(e.message))
                }
              >
                <Download size={16} />
                원본 받기
              </button>
              <button
                className="secondary"
                onClick={() => void reprocess(selected.id)}
              >
                <RefreshCw size={16} />
                재인식
              </button>
            </div>
            {selected.warnings.map((w, i) => (
              <div className="inline-alert" key={i}>
                <AlertTriangle size={16} />
                {w}
              </div>
            ))}
            <div className="extract-heading">
              <h3>추출 본문·표</h3>
              <small>
                {selected.engine} · {selected.block_count}개 블록
              </small>
            </div>
            {selected.blocks?.map((b) => (
              <article className="text-block" key={b.id}>
                <span>
                  {b.locator}
                  <b>{b.kind === "table" ? "표" : "본문"}</b>
                </span>
                {b.cells.length ? (
                  <div className="table-scroll">
                    <table>
                      <tbody>
                        {b.cells.map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, j) => (
                              <td key={j}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="small muted">{b.text}</p>
                  </div>
                ) : (
                  <pre>{b.text}</pre>
                )}
              </article>
            ))}
            {!selected.block_count && (
              <div className="empty">
                <AlertTriangle />
                <h3>본문을 추출하지 못했습니다.</h3>
                <p>위의 사유를 확인한 후 변환하거나 재인식해 주세요.</p>
              </div>
            )}
            <details className="delete-section">
              <summary>문서 정리</summary>
              <p>
                원본과 검색 색인을 삭제합니다. 등록한 업무는 남으며 원문 연결이
                해제됩니다.
              </p>
              <button
                className="danger"
                onClick={() =>
                  void api("/api/documents/" + selected.id, {
                    method: "DELETE",
                  })
                    .then(async () => {
                      setSelected(null);
                      await refresh();
                    })
                    .catch((e) => setMessage(e.message))
                }
              >
                <Trash2 size={15} />이 문서 삭제
              </button>
            </details>
          </section>
        </div>
      )}
      {proposal && (
        <div className="overlay" onClick={() => setProposal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="업무 등록"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-heading">
              <h2>문서를 업무로 만들기</h2>
              <button
                className="icon-button"
                aria-label="업무 등록 닫기"
                onClick={() => setProposal(null)}
              >
                <X />
              </button>
            </div>
            <p className="muted">기한 후보를 원문과 대조한 후 저장해 주세요.</p>
            <label>
              업무 제목
              <input
                value={proposal.title}
                onChange={(e) =>
                  setProposal({ ...proposal, title: e.target.value })
                }
              />
            </label>
            <div className="two-cols">
              <label>
                제출기한
                <input
                  type="date"
                  value={proposal.deadline}
                  onChange={(e) =>
                    setProposal({ ...proposal, deadline: e.target.value })
                  }
                />
              </label>
              <label>
                담당자
                <input
                  placeholder="담당자를 입력하세요"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                />
              </label>
            </div>
            {proposal.warnings.map((w, i) => (
              <div className="inline-alert" key={i}>
                <AlertTriangle size={16} />
                {w}
              </div>
            ))}
            <div className="proposal-evidence">
              {proposal.date_candidates.map((c, i) => (
                <div key={i}>
                  <b>{c.value}</b>
                  <small>
                    {c.locator} · {c.explicit ? "기한 표현 포함" : "일반 날짜"}
                  </small>
                  <p>{c.quote}</p>
                </div>
              ))}
              {!proposal.date_candidates.length &&
                proposal.evidence.map((e, i) => (
                  <div key={i}>
                    <small>{e.locator}</small>
                    <p>{e.text}</p>
                  </div>
                ))}
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              원문과 업무 제목·기한을 확인했습니다.
            </label>
            <button
              className="primary wide"
              disabled={!confirmed || !proposal.title.trim() || saving}
              onClick={() => void saveTask()}
            >
              {saving ? "저장 중" : "확인한 업무 저장"}
              <Check size={17} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

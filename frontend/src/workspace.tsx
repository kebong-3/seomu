import { ProcedureGuide } from "./procedure-guide";
import { RequestFollowup } from "./request-followup";
import { useSettlementSession, settlementKey } from "./settlement-session";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Send,
  GraduationCap,
  Calculator,
  BookOpen,
  Settings,
  FolderOpen,
  Search,
  Plus,
  Download,
  ChevronRight,
  CheckCircle2,
  Clock,
  ClipboardList,
  ArrowRight,
  X,
  Users,
  CalendarDays,
  Files,
} from "lucide-react";
import { categories, sources } from "./catalog";
import type { Category } from "./catalog";
import {
  loadWorkspace,
  storageKey,
  validWorkspace,
  csv,
  rowIssues,
  saveFile,
} from "./workspace-store";
import type { Workspace, Request, Work, Submission } from "./workspace-store";
import { DocumentWorkspace } from "./document-workspace";
import "./workspace.css";
import { SettlementDraft } from "./settlement-draft";
import {AISettings} from './ai-settings';
import type {SourceRequest} from './types';

type Page =
  | "procedures"
  | "ai"
  | "today"
  | "requests"
  | "education"
  | "settlement"
  | "knowledge"
  | "department"
  | "documents"
  | "search"
  | "calendar"
  | "tools";
const menus = [
  { id: "procedures", label: "규정·업무 절차", icon: BookOpen },
  { id: "today", label: "오늘", icon: LayoutDashboard },
  { id: "requests", label: "요청·취합", icon: Send },
  { id: "education", label: "교육·증빙", icon: GraduationCap },
  { id: "settlement", label: "정산 도우미", icon: Calculator },
  { id: "knowledge", label: "서무 지식", icon: BookOpen },
  { id: "department", label: "부서 설정", icon: Settings },
] as const;
const states = {
  pending: "미제출",
  submitted: "검토 대기",
  revision: "보완 요청",
  approved: "확인 완료",
};
const uid = () => crypto.randomUUID();
const date = () => new Date().toLocaleDateString("sv-SE");
export function WorkspaceApp() {
  const [data, setData] = useState<Workspace>(loadWorkspace);
  const [page, setPage] = useState<Page>("today");
  const [category, setCategory] = useState("collection");
  const [term, setTerm] = useState("");
  const [notice, setNotice] = useState("");
  const [requestSeed, setRequestSeed] = useState<
    SourceRequest | undefined
  >();
  const [docMode, setDocMode] = useState<
    "documents" | "ask" | "settings" | "tasks"
  >("documents");
  const [requestId, setRequestId] = useState("");
  const [newRequest, setNewRequest] = useState(false);
  const [workId, setWorkId] = useState("");
  const [showTools, setShowTools] = useState(false);
  const backupInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      setNotice(
        "저장 공간이 부족하거나 브라우저 저장이 차단되었습니다. 백업을 내려받아 주세요.",
      );
    }
  }, [data]);
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 8000);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  const cat = categories.find((c) => c.id === category) || categories[0];
  const request = data.requests.find((r) => r.id === requestId);
  const work = data.works.find((w) => w.id === workId);
  const outstanding = data.requests
    .flatMap((r) => r.rows.map((row) => ({ r, row })))
    .filter((x) => x.row.state !== "approved");
  const openWorks = data.works.filter((w) => !w.done.every(Boolean));
  const due = [
    ...data.requests
      .filter((r) => r.rows.some((s) => s.state !== "approved"))
      .map((r) => ({
        id: r.id,
        title: r.title,
        deadline: r.deadline,
        type: "request",
      })),
    ...openWorks.map((w) => ({
      id: w.id,
      title: w.title,
      deadline: w.deadline,
      type: "work",
    })),
  ]
    .filter((x) => x.deadline)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  function navigate(next: Page) {
    if (next === "documents") setDocMode("documents");
    if (next === "search") setDocMode("ask");
    setPage(next);
    setRequestId("");
    setTerm("");
  }
  function startRequest(c: string) {
    setRequestSeed(undefined);
    setCategory(c);
    setNewRequest(true);
  }
  function addWork(c: Category, title: string) {
    const w: Work = {
      id: uid(),
      title,
      category: c.id,
      deadline: "",
      owner: "",
      repeat: "없음",
      checks: c.checks,
      done: c.checks.map(() => false),
    };
    setData({ ...data, works: [...data.works, w] });
    setWorkId(w.id);
  }
  function updateRequest(r: Request) {
    setData({
      ...data,
      requests: data.requests.map((x) => (x.id === r.id ? r : x)),
    });
  }
  function exportRequest(r: Request) {
    saveFile(
      r.title + ".csv",
      csv([
        [
          "요청명",
          "공문번호",
          "마감",
          "직원",
          "팀",
          "상태",
          ...r.fields,
          "보완 메모",
        ],
        ...r.rows.map((s) => {
          const e = data.employees.find((x) => x.id === s.employeeId);
          return [
            r.title,
            r.reference,
            r.deadline,
            e?.name || "직원",
            e?.team || "",
            states[s.state],
            ...r.fields.map((f) => s.values[f] || ""),
            s.note,
          ];
        }),
      ]),
    );
    setNotice("취합표를 내려받았습니다. Excel에서 열 수 있습니다.");
  }
  return (
    <div className="seomu-shell">
      <aside className="portal-sidebar">
        <button className="portal-brand" onClick={() => navigate("today")}>
          <span>
            <Files size={23} />
          </span>
          <div>
            서무비서<small>일을 연결하고, 수고를 덜다</small>
          </div>
        </button>
        <div className="department-chip">
          <span className="dot" />
          {data.department}
          <small>{data.institution}</small>
        </div>
        <p className="nav-section">내 업무공간</p>
        <nav>
          {menus.map((m) => (
            <button
              className={page === m.id ? "active" : ""}
              key={m.id}
              onClick={() => navigate(m.id)}
            >
              <m.icon size={19} />
              {m.label}
              {m.id === "requests" && data.requests.length > 0 && (
                <small>{data.requests.length}</small>
              )}
            </button>
          ))}
        </nav>
        <p className="nav-section">문서와 일정</p>
        <nav>
          {(
            [
              { id: "documents", label: "공문·폴더 문서함", icon: FolderOpen },
              { id: "search", label: "문서 근거 검색", icon: Search },
              { id: "calendar", label: "업무·반복 일정", icon: CalendarDays },
              { id: "ai", label: "AI 연결 · Gemma / GPT", icon: Settings },
            ] as const
          ).map((m) => (
            <button
              className={page === m.id ? "active" : ""}
              key={m.id}
              onClick={() => navigate(m.id)}
            >
              <m.icon size={18} />
              {m.label}
            </button>
          ))}
        </nav>
        <button
          className="tools-toggle"
          aria-expanded={showTools}
          onClick={() => setShowTools(!showTools)}
        >
          업무별 도구 <ChevronRight size={16} />
        </button>
        {showTools && (
          <nav className="category-nav">
            {categories.map((c) => (
              <button
                key={c.id}
                className={
                  page === "tools" && category === c.id ? "active" : ""
                }
                onClick={() => {
                  setCategory(c.id);
                  navigate("tools");
                }}
              >
                <span>{c.icon}</span>
                {c.name}
              </button>
            ))}
          </nav>
        )}
        <div className="portal-sidebar-foot">
          <span>브라우저에 저장되는 업무공간</span>
          <button onClick={() => navigate("department")}>
            백업·부서 관리 <ArrowRight size={14} />
          </button>
        </div>
      </aside>
      <main className="portal-main">
        <header className="portal-header">
          <div>
            {data.department}
            <ChevronRight size={14} />
            <b>
              {menus.find((m) => m.id === page)?.label ||
                {
                  documents: "공문·폴더 문서함",
                  search: "문서 근거 검색",
                  calendar: "업무·반복 일정",
                  tools: cat.name,
                  ai: 'AI 연결 · Gemma / GPT',
                }[page as "documents" | "search" | "calendar" | "tools" | 'ai']}
            </b>
          </div>
          <span className="storage-pill">내 브라우저 저장</span>
        </header>
        <div className="portal-content">
          {page === "today" && (
            <>
              <div className="portal-heading">
                <div>
                  <span className="kicker">오늘의 서무</span>
                  <h1>오늘 확인할 일, 한눈에.</h1>
                  <p>공문에서 시작해 자료 요청, 취합, 제출까지 이어가세요.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => startRequest("collection")}
                >
                  <Plus size={18} />
                  자료 요청 만들기
                </button>
              </div>
              <div className="welcome-strip">
                <div>
                  <span className="welcome-icon">✦</span>
                  <div>
                    <b>서무의 모든 일이 모이는 곳</b>
                    <p>
                      교육·복무·회계·물품부터 기록물·감사까지, 필요한 업무를
                      골라 시작하세요.
                    </p>
                  </div>
                </div>
                <button onClick={() => navigate("knowledge")}>
                  업무 둘러보기 <ArrowRight size={17} />
                </button>
              </div>
              <div className="portal-stats">
                {[
                  {
                    label: "진행 중인 요청",
                    value: data.requests.filter((r) =>
                      r.rows.some((x) => x.state !== "approved"),
                    ).length,
                    icon: Send,
                    color: "indigo",
                    go: "requests",
                  },
                  {
                    label: "검토할 제출자료",
                    value: outstanding.filter(
                      (x) => x.row.state === "submitted",
                    ).length,
                    icon: ClipboardList,
                    color: "amber",
                    go: "requests",
                  },
                  {
                    label: "미제출·보완",
                    value: outstanding.filter((x) =>
                      ["pending", "revision"].includes(x.row.state),
                    ).length,
                    icon: Clock,
                    color: "rose",
                    go: "requests",
                  },
                  {
                    label: "남은 체크리스트",
                    value: openWorks.length,
                    icon: CheckCircle2,
                    color: "mint",
                    go: "calendar",
                  },
                ].map((s) => (
                  <button key={s.label} onClick={() => navigate(s.go as Page)}>
                    <span className={"metric-icon " + s.color}>
                      <s.icon size={21} />
                    </span>
                    <span>
                      {s.label}
                      <b>
                        {s.value}
                        <small>건</small>
                      </b>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
              <div className="workflow-bar">
                {[
                  "공문 등록",
                  "직원별 자료 요청",
                  "취합·오류 확인",
                  "제출자료 생성",
                ].map((s, i) => (
                  <button
                    key={s}
                    onClick={() =>
                      i === 0
                        ? navigate("documents")
                        : i === 1
                          ? startRequest("collection")
                          : navigate("requests")
                    }
                  >
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {s}
                    <ArrowRight size={17} />
                  </button>
                ))}
              </div>
              <div className="dashboard-grid">
                <section className="portal-panel">
                  <div className="panel-title">
                    <h2>다가오는 마감</h2>
                    <button onClick={() => navigate("calendar")}>
                      전체 보기 <ChevronRight size={14} />
                    </button>
                  </div>
                  {due.slice(0, 5).map((d) => (
                    <button
                      className="deadline-row"
                      key={d.id}
                      onClick={() => {
                        if (d.type === "request") {
                          navigate("requests");
                          setRequestId(d.id);
                        } else setWorkId(d.id);
                      }}
                    >
                      <span className="deadline-date">
                        {d.deadline.slice(5)}
                      </span>
                      <b>{d.title}</b>
                      <span
                        className={
                          "status-tag " +
                          (d.deadline < date() ? "revision" : "pending")
                        }
                      >
                        {d.deadline < date()
                          ? "기한 경과"
                          : d.deadline === date()
                            ? "오늘 마감"
                            : "진행 중"}
                      </span>
                    </button>
                  ))}
                  {!due.length && (
                    <div className="portal-empty">
                      <CalendarDays size={30} />
                      <b>등록된 마감이 없습니다</b>
                      <p>자료 요청이나 업무 체크리스트에 기한을 넣어보세요.</p>
                      <button
                        className="secondary"
                        onClick={() => startRequest("collection")}
                      >
                        첫 요청 만들기
                      </button>
                    </div>
                  )}
                </section>
                <section className="portal-panel">
                  <div className="panel-title">
                    <h2>자주 하는 업무</h2>
                    <span className="muted small">클릭하면 요청 양식 생성</span>
                  </div>
                  <div className="quick-grid">
                    {[
                      "education",
                      "travel",
                      "attendance",
                      "accounting",
                      "meetings",
                      "assets",
                    ].map((id) => {
                      const c = categories.find((x) => x.id === id)!;
                      return (
                        <button key={id} onClick={() => startRequest(id)}>
                          <span>{c.icon}</span>
                          <b>{c.name}</b>
                          <small>{c.summary}</small>
                        </button>
                      );
                    })}
                  </div>
                </section>
              </div>
              <div className="section-heading">
                <h2>업무별 도구</h2>
                <span>
                  14개 분야 ·{" "}
                  {categories.reduce((n, c) => n + c.tasks.length, 0)}개 업무
                </span>
              </div>
              <div className="category-grid">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCategory(c.id);
                      navigate("tools");
                    }}
                  >
                    <span>{c.icon}</span>
                    <div>
                      <b>{c.name}</b>
                      <p>{c.summary}</p>
                    </div>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>
            </>
          )}
          {(page === "requests" || page === "education") && (
            <>
              <div className="portal-heading">
                <div>
                  <span className="kicker">
                    {page === "education"
                      ? "교육을 빠짐없이"
                      : "공문에서 제출까지"}
                  </span>
                  <h1>
                    {page === "education"
                      ? "교육·증빙 관리"
                      : "요청하고, 확인하고, 취합해요."}
                  </h1>
                  <p>
                    {page === "education"
                      ? "교육기간·시간·수료증 자료명을 직원별로 정리하세요."
                      : "직원별 제출내용과 보완 메모를 한 곳에서 관리하세요."}
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    startRequest(
                      page === "education" ? "education" : "collection",
                    )
                  }
                >
                  <Plus size={18} />
                  {page === "education" ? "교육자료 요청" : "새 자료 요청"}
                </button>
              </div>
              <div className="local-note">
                <span>
                  이 업무공간의 제출내용은 현재 브라우저에 저장됩니다. 직원에게
                  자동 전송되거나 다른 기기와 공유되지 않습니다.
                </span>
              </div>
              {request ? (
                <RequestDetail
                  request={request}
                  employees={data.employees}
                  onChange={updateRequest}
                  onBack={() => setRequestId("")}
                  onExport={() => exportRequest(request)}
                />
              ) : (
                <>
                  <div className="request-toolbar">
                    <label>
                      <Search size={17} />
                      <input
                        aria-label="요청 검색"
                        placeholder="요청명·공문번호 검색"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                      />
                    </label>
                    <span>
                      {
                        data.requests.filter(
                          (r) =>
                            page !== "education" || r.category === "education",
                        ).length
                      }
                      개 요청
                    </span>
                  </div>
                  <div className="request-list">
                    {data.requests
                      .filter(
                        (r) =>
                          (page !== "education" ||
                            r.category === "education") &&
                          (r.title + r.reference).includes(term),
                      )
                      .map((r) => (
                        <button
                          className="request-card"
                          key={r.id}
                          onClick={() => setRequestId(r.id)}
                        >
                          <span className="request-category">
                            {categories.find((c) => c.id === r.category)?.name}
                          </span>
                          <h2>{r.title}</h2>
                          <p>
                            {r.reference || "공문번호 미입력"} · 마감{" "}
                            {r.deadline || "미지정"}
                          </p>
                          <progress
                            value={
                              r.rows.filter((x) => x.state === "approved")
                                .length
                            }
                            max={Math.max(1, r.rows.length)}
                          />
                          <div>
                            <span>
                              확인 완료{" "}
                              {
                                r.rows.filter((x) => x.state === "approved")
                                  .length
                              }{" "}
                              / {r.rows.length}명
                            </span>
                            <ChevronRight size={18} />
                          </div>
                        </button>
                      ))}
                  </div>
                  {!data.requests.some(
                    (r) => page !== "education" || r.category === "education",
                  ) && (
                    <div className="portal-panel portal-empty">
                      <Send size={34} />
                      <h2>첫 자료 요청을 만들어 보세요.</h2>
                      <p>
                        부서 설정에서 직원을 등록한 뒤, 필요한 제출항목과 기한을
                        정하면 됩니다.
                      </p>
                      <div className="actions">
                        <button
                          className="secondary"
                          onClick={() => navigate("department")}
                        >
                          직원 등록
                        </button>
                        <button
                          className="primary"
                          onClick={() =>
                            startRequest(
                              page === "education" ? "education" : "collection",
                            )
                          }
                        >
                          자료 요청 만들기
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {page === "tools" && (
            <>
              <div className="portal-heading">
                <div>
                  <span className="kicker">업무별 도구</span>
                  <h1>
                    {cat.icon} {cat.name}
                  </h1>
                  <p>{cat.summary} · 기관의 업무분장에 맞게 선택하세요.</p>
                </div>
                <button
                  className="primary"
                  onClick={() => startRequest(cat.id)}
                >
                  <Send size={18} />이 분야 자료 요청
                </button>
              </div>
              <div className="dashboard-grid">
                <section className="portal-panel">
                  <div className="panel-title">
                    <h2>처리할 업무 선택</h2>
                    <span className="small muted">체크리스트로 등록</span>
                  </div>
                  {cat.tasks.map((t) => (
                    <button
                      className="task-choice"
                      key={t}
                      onClick={() => addWork(cat, t)}
                    >
                      <ClipboardList size={18} />
                      <b>{t}</b>
                      <Plus size={17} />
                    </button>
                  ))}
                </section>
                <section className="portal-panel">
                  <h2>기본 확인 순서</h2>
                  <div className="check-guide">
                    {cat.checks.map((c, i) => (
                      <div key={c}>
                        <span>{i + 1}</span>
                        <p>{c}</p>
                      </div>
                    ))}
                  </div>
                  <div className="local-note">
                    업무처리 보조용 체크리스트입니다. 승인·지급·인정·공개 여부는
                    기관 담당자가 판단합니다.
                  </div>
                  <h3>제출항목 기본 양식</h3>
                  <div className="field-chips">
                    {cat.items.map((i) => (
                      <span key={i}>{i}</span>
                    ))}
                  </div>
                </section>
              </div>
              <WorkList
                works={data.works.filter((w) => w.category === cat.id)}
                onOpen={setWorkId}
              />
            </>
          )}
          {page === "calendar" && (
            <>
              <div className="portal-heading">
                <div>
                  <span className="kicker">놓치지 않는 업무</span>
                  <h1>업무·반복 일정</h1>
                  <p>마감순으로 확인하고, 반복업무의 처리단계를 기록하세요.</p>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    addWork(
                      categories.find((c) => c.id === "meetings")!,
                      "새 업무",
                    )
                  }
                >
                  <Plus size={18} />
                  업무 등록
                </button>
              </div>
              <section className="portal-panel">
                <div className="panel-title">
                  <h2>자료 요청 마감</h2>
                </div>
                {due
                  .filter((d) => d.type === "request")
                  .map((d) => (
                    <button
                      key={d.id}
                      className="deadline-row"
                      onClick={() => {
                        navigate("requests");
                        setRequestId(d.id);
                      }}
                    >
                      <span className="deadline-date">{d.deadline}</span>
                      <b>{d.title}</b>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                {!due.some((d) => d.type === "request") && (
                  <p className="muted">진행 중인 자료 요청 마감이 없습니다.</p>
                )}
              </section>
              <WorkList
                works={[...data.works].sort((a, b) =>
                  (a.deadline || "9999").localeCompare(b.deadline || "9999"),
                )}
                onOpen={setWorkId}
              />
            </>
          )}
          {page === "settlement" && (
            <Settlement department={data.department} onRequest={() => startRequest("travel")} />
          )}
          {page === "knowledge" && (
            <>
              <div className="portal-heading">
                <div>
                  <span className="kicker">처리순서와 근거를 함께</span>
                  <h1>서무 지식·업무편람</h1>
                  <p>
                    지자체·중앙기관의 공개 업무분장을 바탕으로 정리했습니다.
                    기관별 분장은 다를 수 있습니다.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => navigate("search")}
                >
                  <Search size={18} />내 문서에서 근거 찾기
                </button>
              </div>
              <label className="knowledge-search">
                <Search size={19} />
                <input
                  placeholder="예: 당직, 여비, 인수인계, 정보공개"
                  aria-label="서무 업무 검색"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                />
              </label>
              <div className="category-grid">
                {categories
                  .filter((c) => (c.name + c.tasks.join("")).includes(term))
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCategory(c.id);
                        navigate("tools");
                      }}
                    >
                      <span>{c.icon}</span>
                      <div>
                        <b>{c.name}</b>
                        <p>
                          {c.tasks
                            .filter((t) => !term || t.includes(term))
                            .join(" · ") || c.summary}
                        </p>
                      </div>
                      <ChevronRight size={17} />
                    </button>
                  ))}
              </div>
              <section className="portal-panel sources-panel">
                <h2>조사 근거·참고 사례</h2>
                <p className="muted">
                  확인일 2026.10.10 · 공개자료의 업무 범위를 메뉴 설계에
                  반영했습니다. 법적 인정기준·금액은 이 목록에서 확정하지
                  않습니다.
                </p>
                {sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                    <BookOpen size={18} />
                    <div>
                      <b>{s.title}</b>
                      <p>{s.note}</p>
                    </div>
                    <ArrowRight size={17} />
                  </a>
                ))}
              </section>
            </>
          )}
          {page==='procedures'&&<ProcedureGuide institution={data.institution}/>}
          {page==='ai'&&<AISettings onConnect={()=>{navigate('documents');setDocMode('settings');}}/>}
          {page === "department" && (
            <Department
              data={data}
              setData={setData}
              notify={setNotice}
              backupInput={backupInput}
            />
          )}
          {(page === "documents" || page === "search") && (
            <>
              <div className="portal-heading">
                <div>
                  <span className="kicker">원문에서 시작하는 업무</span>
                  <h1>
                    {page === "documents"
                      ? "공문·폴더 문서함"
                      : "내 문서 근거 검색"}
                  </h1>
                  <p>
                    HWP·HWPX·PDF·Office·이미지·ZIP을 읽고 페이지·표·원문 위치를
                    확인합니다.
                  </p>
                </div>
                <button
                  className="secondary"
                  onClick={() => startRequest("collection")}
                >
                  확인한 공문으로 요청 만들기 <ArrowRight size={16} />
                </button>
              </div>
              <div className="local-note">
                문서 인식에는 문서를 보관할 서버 연결이 필요합니다. 아래 연결
                키는 문서 서버 접근용이며, 앱을 둘러보는 데 로그인은 필요하지
                않습니다.
              </div>
              <div className="filter-tabs document-tabs">
                {(
                  [
                    ["documents", "문서함"],
                    ["ask", "근거 검색"],
                    ["tasks", "문서에서 만든 업무"],
                    ["settings", "인식·연결 설정"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    className={docMode === id ? "selected" : ""}
                    onClick={() => setDocMode(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="document-module">
                <DocumentWorkspace
                  initialView={docMode}
                  onRequest={(source) => {
                    setRequestSeed(source);
                    setCategory("collection");
                    setNewRequest(true);
                  }}
                />
              </div>
            </>
          )}
        </div>
      </main>
      {notice && (
        <div className="portal-toast" role="status">
          {notice}
          <button aria-label="알림 닫기" onClick={() => setNotice("")}>
            <X size={18} />
          </button>
        </div>
      )}
      {newRequest && (
        <NewRequest
          seed={requestSeed}
          cat={cat}
          employees={data.employees}
          onClose={() => setNewRequest(false)}
          onSave={(r) => {
            setData({ ...data, requests: [r, ...data.requests] });
            setNewRequest(false);
            setPage(r.category === "education" ? "education" : "requests");
            setRequestId(r.id);
            setNotice(
              "요청을 저장했습니다. 직원별 제출내용을 입력하고 확인해 주세요.",
            );
          }}
        />
      )}
      {work && (
        <WorkEditor
          work={work}
          employees={data.employees}
          onClose={() => setWorkId("")}
          onChange={(w) =>
            setData({
              ...data,
              works: data.works.map((x) => (x.id === w.id ? w : x)),
            })
          }
          onNext={() => {
            if (!work.deadline || work.repeat === "없음") {
              setNotice("기한과 반복 주기를 먼저 지정해 주세요.");
              return;
            }
            const d = new Date(work.deadline + "T12:00:00");
            if (work.repeat === "매주") d.setDate(d.getDate() + 7);
            else {
              const day = d.getDate();
              d.setDate(1);
              d.setMonth(d.getMonth() + (work.repeat === "매월" ? 1 : 12));
              const last = new Date(
                d.getFullYear(),
                d.getMonth() + 1,
                0,
              ).getDate();
              d.setDate(Math.min(day, last));
            }
            const n = {
              ...work,
              id: uid(),
              deadline: d.toLocaleDateString("sv-SE"),
              done: work.checks.map(() => false),
            };
            setData({ ...data, works: [...data.works, n] });
            setWorkId(n.id);
            setNotice("다음 회차 업무를 만들었습니다.");
          }}
        />
      )}
    </div>
  );
}

function NewRequest({
  seed,
  cat,
  employees,
  onClose,
  onSave,
}: {
  seed?: SourceRequest;
  cat: Category;
  employees: Workspace["employees"];
  onClose: () => void;
  onSave: (r: Request) => void;
}) {
  const [title, setTitle] = useState(seed?.title || cat.name + " 자료 제출");
  const [deadline, setDeadline] = useState(seed?.deadline||"");
  const [reference, setReference] = useState(seed?.reference || "");
  const [fields, setFields] = useState((seed?.fields?.length?seed.fields:cat.items).join("\n"));
  const [selected, setSelected] = useState<string[]>(seed?.aiSuggested?[]:employees.map((e) => e.id));
  const [error, setError] = useState("");
  return (
    <div className="portal-overlay">
      <form
        className="portal-modal"
        role="dialog"
        aria-modal="true"
        aria-label="자료 요청 만들기"
        onSubmit={(e) => {
          e.preventDefault();
          const formDeadline = String(
            new FormData(e.currentTarget).get("deadline") || deadline,
          );
          const items = [
            ...new Set(
              fields
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean),
            ),
          ];
          if (!selected.length || !items.length) {
            setError("대상 직원과 제출항목을 하나 이상 선택해 주세요.");
            return;
          }
          onSave({
            id: uid(),
            title: title.trim(),
            category: cat.id,
            deadline: formDeadline,
            reference,
            fields: items,
            rows: selected.map((employeeId) => ({
              employeeId,
              values: {},
              state: "pending",
              note: "",
            })),
            created: date(),
          });
        }}
      >
        <div className="panel-title">
          <h2>자료 요청 만들기</h2>
          <button type="button" aria-label="요청 만들기 닫기" onClick={onClose}>
            <X />
          </button>
        </div>
        <span className="request-category">{cat.name}</span>
        <label>
          요청 제목
          <input
            required
            maxLength={180}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="two-cols">
          <label>
            제출기한
            <input
              type="date"
              name="deadline"
              required
              value={deadline}
              onInput={(e) => setDeadline(e.currentTarget.value)}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
          <label>
            공문번호·근거
            <input
              placeholder="예: 총무과-1234"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
        </div>
        <label>
          제출항목 (한 줄에 하나)
          <textarea
            rows={4}
            value={fields}
            onChange={(e) => setFields(e.target.value)}
          />
        </label>
        <fieldset>
          <legend>제출 대상 직원</legend>
          {employees.map((emp) => (
            <label className="employee-check" key={emp.id}>
              <input
                type="checkbox"
                checked={selected.includes(emp.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, emp.id]
                      : selected.filter((id) => id !== emp.id),
                  )
                }
              />
              {emp.name}
              <span>{emp.team}</span>
            </label>
          ))}
          {!employees.length && <p>부서 설정에서 직원을 먼저 등록해 주세요.</p>}
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <p className="muted small">
          요청은 이 브라우저에 저장됩니다. 직원에게 전달할 요청 안내문은 저장 후
          내려받을 수 있습니다.
        </p>
        <button
          className="primary wide"
          disabled={!employees.length || !title.trim()}
        >
          요청 저장
        </button>
      </form>
    </div>
  );
}
function RequestDetail({
  request: r,
  employees,
  onChange,
  onBack,
  onExport,
}: {
  request: Request;
  employees: Workspace["employees"];
  onChange: (r: Request) => void;
  onBack: () => void;
  onExport: () => void;
}) {
  const [active, setActive] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const row = r.rows.find((x) => x.employeeId === active);
  function update(x: Submission) {
    onChange({
      ...r,
      rows: r.rows.map((s) => (s.employeeId === x.employeeId ? x : s)),
    });
  }
  function approve(s: Submission) {
    const issues = rowIssues(s, r.fields);
    if (issues.length || s.state !== "submitted") {
      setError(
        issues.length
          ? issues.join(" · ")
          : "제출자료를 저장한 뒤 확인 완료로 변경해 주세요.",
      );
      return;
    }
    update({ ...s, state: "approved" });
    setError("");
  }
  const names = r.rows.map(
    (s) => employees.find((e) => e.id === s.employeeId)?.name || "직원",
  );
  const duplicate = names.length !== new Set(names).size;
  return (
    <section className="portal-panel request-detail">
      <button className="back-link" onClick={onBack}>
        ← 요청 목록
      </button>
      <div className="panel-title">
        <div>
          <h2>{r.title}</h2>
          <p className="muted">
            {r.reference || "공문번호 미입력"} · 마감 {r.deadline}
          </p>
        </div>
        <div className="actions">
          <button
            className="secondary"
            onClick={() =>
              saveFile(
                r.title + "-요청안내.txt",
                `${r.title}\n공문번호: ${r.reference}\n제출기한: ${r.deadline}\n대상: ${names.join(", ")}\n제출항목:\n${r.fields.map((f) => " - " + f).join("\n")}\n담당자에게 제출 후 누락·오류가 있으면 보완해 주세요.`,
                "text/plain;charset=utf-8",
              )
            }
          >
            요청 안내문
          </button>
          <button className="primary" onClick={onExport}>
            <Download size={17} />
            취합표 CSV
          </button>
        </div>
      </div>
      <div className="submission-stats">
        {Object.entries(states).map(([key, label]) => (
          <button
            className={filter === key ? "selected" : ""}
            key={key}
            onClick={() => setFilter(filter === key ? "all" : key)}
          >
            {label}
            <b>{r.rows.filter((s) => s.state === key).length}</b>
          </button>
        ))}
      </div>
      {duplicate && (
        <p className="form-error">
          동명이인이 있습니다. 팀과 직원 정보를 함께 확인해 주세요.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <RequestFollowup key={r.id} request={r} employees={employees} />
      <div className="submission-table">
        <div className="submission-head">
          <span>직원 / 팀</span>
          <span>제출·검토 상태</span>
          <span>누락 확인</span>
          <span>자료 확인</span>
        </div>
        {r.rows
          .filter((s) => filter === "all" || s.state === filter)
          .map((s) => {
            const emp = employees.find((e) => e.id === s.employeeId);
            const issues = rowIssues(s, r.fields);
            return (
              <div className="submission-row" key={s.employeeId}>
                <span>
                  <b>{emp?.name || "직원"}</b>
                  <small>{emp?.team || "팀 미지정"}</small>
                </span>
                <span className={"status-tag " + s.state}>
                  {states[s.state]}
                </span>
                <span>
                  {issues.length
                    ? `${issues.length}개 항목 미입력`
                    : "입력 완료 · 내용 확인 필요"}
                </span>
                <button
                  className="secondary"
                  onClick={() => {
                    setActive(s.employeeId);
                    setError("");
                  }}
                >
                  입력·검토
                </button>
              </div>
            );
          })}
      </div>
      <p className="muted small">
        빈칸 검사만 자동 처리합니다. 증빙 진위·인정기간·단위·실적 중복은 원문과
        대조해야 합니다.
      </p>
      {row && (
        <div className="submission-editor">
          <div className="panel-title">
            <h3>{employees.find((e) => e.id === active)?.name} 제출자료</h3>
            <button aria-label="제출자료 닫기" onClick={() => setActive("")}>
              <X size={18} />
            </button>
          </div>
          <div className="editor-grid">
            {r.fields.map((f) => (
              <label key={f}>
                {f}
                <input
                  value={row.values[f] || ""}
                  onChange={(e) =>
                    update({
                      ...row,
                      values: { ...row.values, [f]: e.target.value },
                      state: row.state === "approved" ? "submitted" : row.state,
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label>
            보완·검토 메모
            <textarea
              value={row.note}
              onChange={(e) => update({ ...row, note: e.target.value })}
              placeholder="보완할 항목과 사유를 기록하세요"
            />
          </label>
          <div className="actions">
            <button
              className="secondary"
              onClick={() => {
                update({ ...row, state: "submitted" });
                setError("");
              }}
            >
              제출자료 저장
            </button>
            <button
              className="secondary"
              onClick={() => {
                if (!row.note.trim()) {
                  setError("보완 사유를 메모에 입력해 주세요.");
                  return;
                }
                update({ ...row, state: "revision" });
                setError("");
              }}
            >
              보완 요청으로 표시
            </button>
            <button className="primary" onClick={() => approve(row)}>
              <CheckCircle2 size={17} />
              검토 후 확인 완료
            </button>
          </div>
          <p className="small muted">
            실제 알림을 보내지 않고 제출·검토 상태를 기록합니다.
          </p>
        </div>
      )}
    </section>
  );
}
function WorkList({
  works,
  onOpen,
}: {
  works: Work[];
  onOpen: (id: string) => void;
}) {
  return (
    <section className="portal-panel work-list">
      <div className="panel-title">
        <h2>업무 체크리스트</h2>
        <span>{works.length}건</span>
      </div>
      {works.map((w) => (
        <button key={w.id} className="work-row" onClick={() => onOpen(w.id)}>
          <CheckCircle2 size={18} />
          <div>
            <b>{w.title}</b>
            <p>
              {w.deadline || "기한 미지정"} · {w.owner || "담당 미지정"} ·{" "}
              {w.repeat}
            </p>
          </div>
          <span>
            {w.done.filter(Boolean).length}/{w.checks.length}
          </span>
          <ChevronRight size={16} />
        </button>
      ))}
      {!works.length && (
        <p className="muted">
          업무별 도구에서 처리할 업무를 선택하면 확인 순서가 등록됩니다.
        </p>
      )}
    </section>
  );
}
function WorkEditor({
  work: w,
  employees,
  onChange,
  onClose,
  onNext,
}: {
  work: Work;
  employees: Workspace["employees"];
  onChange: (w: Work) => void;
  onClose: () => void;
  onNext: () => void;
}) {
  return (
    <div className="portal-overlay">
      <section
        className="portal-modal"
        role="dialog"
        aria-modal="true"
        aria-label="업무 체크리스트"
      >
        <div className="panel-title">
          <h2>업무 체크리스트</h2>
          <button aria-label="체크리스트 닫기" onClick={onClose}>
            <X />
          </button>
        </div>
        <label>
          업무명
          <input
            value={w.title}
            onChange={(e) => onChange({ ...w, title: e.target.value })}
          />
        </label>
        <div className="two-cols">
          <label>
            기한
            <input
              type="date"
              value={w.deadline}
              onInput={(e) =>
                onChange({ ...w, deadline: e.currentTarget.value })
              }
              onChange={(e) => onChange({ ...w, deadline: e.target.value })}
            />
          </label>
          <label>
            담당자
            <select
              value={w.owner}
              onChange={(e) => onChange({ ...w, owner: e.target.value })}
            >
              <option value="">담당 미지정</option>
              {employees.map((e) => (
                <option key={e.id} value={e.name}>
                  {e.name} · {e.team}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          반복 주기
          <select
            value={w.repeat}
            onChange={(e) => onChange({ ...w, repeat: e.target.value })}
          >
            {["없음", "매주", "매월", "매년"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <div className="work-checks">
          {w.checks.map((c, i) => (
            <label key={i}>
              <input
                type="checkbox"
                checked={w.done[i]}
                onChange={(e) =>
                  onChange({
                    ...w,
                    done: w.done.map((d, n) =>
                      n === i ? e.target.checked : d,
                    ),
                  })
                }
              />
              <span>{c}</span>
            </label>
          ))}
        </div>
        <div className="actions">
          <button className="secondary" onClick={onNext}>
            다음 회차 만들기
          </button>
          <button className="primary" onClick={onClose}>
            저장하고 닫기
          </button>
        </div>
        <p className="small muted">
          변경 내용은 자동 저장됩니다. 반복 주기는 다음 회차 생성에 사용하며
          자동 알림은 발송하지 않습니다.
        </p>
      </section>
    </div>
  );
}
function Settlement({ department, onRequest }: { department: string; onRequest: () => void }) {
  const session = useSettlementSession("calculation", {"mode": "출장", "days": "1", "daily": "", "transport": "", "lodging": "", "deduction": "", "people": "1", "unit": ""});
  const { mode, days, daily, transport, lodging, deduction, people, unit } = session.data;
  const setMode = session.field("mode");
  const setDays = session.field("days");
  const setDaily = session.field("daily");
  const setTransport = session.field("transport");
  const setLodging = session.field("lodging");
  const setDeduction = session.field("deduction");
  const setPeople = session.field("people");
  const setUnit = session.field("unit");
  const [resetCount, setResetCount] = useState(0);
  const values =
    mode === "출장"
      ? [days, daily, transport, lodging, deduction]
      : [people, unit];
  const invalid =
    values.some(
      (v) => v !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0),
    ) || !Number.isInteger(Number(mode === "출장" ? days : people));
  const raw =
    mode === "출장"
      ? Number(days) * Number(daily) +
        Number(transport) +
        Number(lodging) -
        Number(deduction)
      : Number(people) * Number(unit);
  const total = invalid ? 0 : Math.round(raw);
  const missing = mode === "출장" ? !daily : !unit;
  return (
    <>
      <div className="portal-heading">
        <div>
          <span className="kicker">계산은 투명하게, 판단은 근거로</span>
          <h1>정산 도우미</h1>
          <p>기관 기준의 단가를 입력하고 계산 과정과 증빙을 확인하세요.</p>
        </div>
        <button className="secondary" onClick={onRequest}>
          정산자료 요청 <Send size={17} />
        </button>
      </div>
      <p className="local-note" role="status">{session.saved ? "이 브라우저에 정산 입력과 초안을 자동 보관합니다. 다른 메뉴나 새로고침 후 이어서 작성할 수 있습니다." : "브라우저 저장이 불가능합니다. 메뉴를 떠나기 전에 초안을 파일로 저장하세요."} 기기·브라우저 간에는 공유되지 않습니다.</p>
      <button className="secondary" onClick={() => { if (window.confirm("계산 입력, 업무 맥락, 증빙 체크와 편집 초안을 모두 지울까요? 저장한 파일은 유지됩니다.")) { try { localStorage.removeItem(settlementKey("draft")); } catch { /* storage unavailable */ } session.reset(); setResetCount(n => n + 1); } }}>정산 작업 초기화</button>
      <div className="dashboard-grid">
        <section className="portal-panel">
          <div className="filter-tabs">
            {["출장", "특근매식"].map((m) => (
              <button
                className={mode === m ? "selected" : ""}
                key={m}
                onClick={() => setMode(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="editor-grid">
            {(mode === "출장"
              ? [
                  { l: "출장 일수", v: days, s: setDays },
                  { l: "기관 기준 1일 금액 (원)", v: daily, s: setDaily },
                  { l: "교통비 실비 (원)", v: transport, s: setTransport },
                  { l: "숙박비 실비 (원)", v: lodging, s: setLodging },
                  { l: "공제·기지급액 (원)", v: deduction, s: setDeduction },
                ]
              : [
                  { l: "인원·식수", v: people, s: setPeople },
                  { l: "기관 기준 단가 (원)", v: unit, s: setUnit },
                ]
            ).map((f) => (
              <label key={f.l}>
                {f.l}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={f.v}
                  onChange={(e) => f.s(e.target.value)}
                />
              </label>
            ))}
          </div>
          <p className="muted small">
            빈 실비 항목은 0원으로 계산합니다. 입력 단가는 법정 단가로 검증되지
            않습니다.
          </p>
        </section>
        <section className="portal-panel calculation-result">
          <span className="kicker">입력값 기준 계산</span>
          <h2>
            {invalid || raw < 0 || missing
              ? "입력값을 확인해 주세요"
              : total.toLocaleString() + " 원"}
          </h2>
          <p>
            {mode === "출장"
              ? `${days || 0}일 × ${daily || 0}원 + 교통 ${transport || 0}원 + 숙박 ${lodging || 0}원 − 공제 ${deduction || 0}원`
              : `${people || 0} × ${unit || 0}원`}
          </p>
          {(invalid || raw < 0) && (
            <p className="form-error">
              음수 금액, 소수 인원·일수 또는 공제액을 확인하세요.
            </p>
          )}
          <div className="local-note">
            지급액 확정 전 출장 명령·영수증·식사 제공·중복 지급·기관 기준을
            담당자가 확인해야 합니다.
          </div>
          <button
            className="primary"
            disabled={invalid || raw < 0 || missing}
            onClick={() =>
              saveFile(
                "정산검토.csv",
                csv([
                  ["구분", "계산 과정", "계산금액(원)", "검토상태"],
                  [
                    mode,
                    mode === "출장"
                      ? `${days} × ${daily} + ${transport || 0} + ${lodging || 0} - ${deduction || 0}`
                      : `${people} × ${unit}`,
                    String(total),
                    "담당자 검토 필요",
                  ],
                ]),
              )
            }
          >
            <Download size={17} />
            계산 내역 저장
          </button>
        </section>
      </div>
      <SettlementDraft key={resetCount} department={department} mode={mode} amount={total} valid={!invalid && raw >= 0 && !missing && Number(mode === "출장" ? days : people) > 0} formula={mode === "출장" ? `${days || 0}일 × ${daily || 0}원 + 교통 ${transport || 0}원 + 숙박 ${lodging || 0}원 − 공제 ${deduction || 0}원` : `${people || 0} × ${unit || 0}원`} needsTransport={Number(transport) > 0} needsLodging={Number(lodging) > 0} />
    </>
  );
}
function Department({
  data,
  setData,
  notify,
  backupInput,
}: {
  data: Workspace;
  setData: (s: Workspace) => void;
  notify: (s: string) => void;
  backupInput: React.RefObject<HTMLInputElement | null>;
}) {
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [duty, setDuty] = useState("");
  const [backup, setBackup] = useState("");
  return (
    <>
      <div className="portal-heading">
        <div>
          <span className="kicker">우리 부서에 맞게</span>
          <h1>부서 설정</h1>
          <p>직원·분장·대체담당을 등록하고 업무공간을 백업하세요.</p>
        </div>
        <button
          className="secondary"
          onClick={() =>
            saveFile(
              "서무비서-업무공간.json",
              JSON.stringify(data, null, 2),
              "application/json",
            )
          }
        >
          <Download size={17} />
          백업 내려받기
        </button>
      </div>
      <div className="local-note">
        이 버전은 현재 브라우저의 업무 정리 도구입니다. 직원 로그인·권한
        분리·공유 제출·파일 증빙 보관은 문서 서버와 별도의 확장이 필요합니다.
        주민번호·건강정보·급여 명세 등 민감정보는 입력하지 마세요.
      </div>
      <section className="portal-panel">
        <div className="editor-grid">
          <label>
            부서명
            <input
              value={data.department}
              onChange={(e) => setData({ ...data, department: e.target.value })}
            />
          </label>
          <label>
            기관 유형
            <select
              value={data.institution}
              onChange={(e) =>
                setData({ ...data, institution: e.target.value })
              }
            >
              <option>지방자치단체</option>
              <option>중앙행정기관</option>
              <option>소속기관·사업소</option>
              <option>기타 공공기관</option>
            </select>
          </label>
        </div>
      </section>
      <section className="portal-panel department-panel">
        <div className="panel-title">
          <h2>직원·업무분장</h2>
          <span>{data.employees.length}명</span>
        </div>
        <form
          className="employee-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            setData({
              ...data,
              employees: [
                ...data.employees,
                {
                  id: uid(),
                  name: name.trim(),
                  team: team.trim(),
                  duty: duty.trim(),
                  backup: backup.trim(),
                },
              ],
            });
            setName("");
            setTeam("");
            setDuty("");
            setBackup("");
            notify("직원을 등록했습니다.");
          }}
        >
          <label>
            직원명
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
            />
          </label>
          <label>
            팀
            <input
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              placeholder="소속 팀"
            />
          </label>
          <label>
            담당업무
            <input
              value={duty}
              onChange={(e) => setDuty(e.target.value)}
              placeholder="업무분장"
            />
          </label>
          <label>
            대체담당
            <input
              value={backup}
              onChange={(e) => setBackup(e.target.value)}
              placeholder="부재 시 담당"
            />
          </label>
          <button className="primary">
            <Plus size={16} />
            등록
          </button>
        </form>
        {data.employees.map((emp) => (
          <div className="employee-row" key={emp.id}>
            <Users size={18} />
            <b>{emp.name}</b>
            <span>{emp.team || "팀 미지정"}</span>
            <span>{emp.duty || "분장 미지정"}</span>
            <span>대체: {emp.backup || "미지정"}</span>
          </div>
        ))}
        {!data.employees.length && (
          <div className="portal-empty">
            <Users size={30} />
            <p>자료 요청의 대상이 될 직원을 등록해 주세요.</p>
          </div>
        )}
      </section>
      <section className="portal-panel">
        <h2>백업 복원</h2>
        <p className="muted">
          서무비서에서 내려받은 JSON 백업을 선택하세요. 현재 자료에 추가하며,
          같은 ID는 현재 자료를 유지합니다.
        </p>
        <input
          hidden
          ref={backupInput}
          type="file"
          accept=".json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              if (file.size > 5 * 1024 * 1024)
                throw new Error("5MB 이하의 백업을 선택해 주세요.");
              const value: unknown = JSON.parse(await file.text());
              if (!validWorkspace(value))
                throw new Error("서무비서 백업 형식이 아닙니다.");
              const merge = <T extends { id: string }>(a: T[], b: T[]) => [
                ...a,
                ...b.filter((x) => !a.some((y) => y.id === x.id)),
              ];
              setData({
                ...data,
                employees: merge(data.employees, value.employees),
                requests: merge(data.requests, value.requests),
                works: merge(data.works, value.works),
              });
              notify("백업 자료를 추가했습니다.");
            } catch (err) {
              notify((err as Error).message);
            }
            e.target.value = "";
          }}
        />
        <button
          className="secondary"
          onClick={() => backupInput.current?.click()}
        >
          백업 파일 선택
        </button>
      </section>
    </>
  );
}

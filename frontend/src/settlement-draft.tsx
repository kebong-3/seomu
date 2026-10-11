import { useSettlementSession } from "./settlement-session";
import { useState } from "react";
import { saveFile } from "./workspace-store";

export function settlementChecks(mode: string, transport: boolean, lodging: boolean) {
  return mode === "출장" ? ["출장 명령·승인 자료", ...(transport ? ["교통비 증빙"] : []), ...(lodging ? ["숙박비 증빙"] : []), "식사 제공·중복 지급·기지급 내역 확인"] : ["근무·식사 대상 내역", "식사 지출 증빙", "중복 지급·기관 한도 확인"];
}

export function printableDraft(text: string) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>정산 검토 초안</title><style>body{max-width:800px;margin:40px auto;padding:24px;font:16px/1.8 sans-serif}pre{white-space:pre-wrap;font:inherit}@media print{body{margin:0}}</style><body><pre>${escaped}</pre></body></html>`;
}

export function SettlementDraft({ department, mode, amount, formula, valid, needsTransport, needsLodging }: {
  department: string; mode: string; amount: number; formula: string; valid: boolean; needsTransport: boolean; needsLodging: boolean;
}) {
  const session = useSettlementSession("draft", { purpose: "", owner: "", start: "", end: "", basis: "", evidence: {} as Record<string, boolean>, draft: "", snapshot: "" });
  const { purpose, owner, start, end, basis, evidence, draft, snapshot } = session.data;
  const setPurpose = session.field("purpose");
  const setOwner = session.field("owner");
  const setStart = session.field("start");
  const setEnd = session.field("end");
  const setBasis = session.field("basis");
  const setEvidence = session.field("evidence");
  const setDraft = session.field("draft");
  const setSnapshot = session.field("snapshot");
  const [message, setMessage] = useState("");
  const checks = settlementChecks(mode, needsTransport, needsLodging);
  const missing = [!purpose.trim() && "업무 목적", !owner.trim() && "정산 대상·담당", (!start || !end) && "기간", start && end && start > end && "기간 순서", !basis.trim() && "기관 기준의 문서명·조항·확인일", !valid && "계산 입력", ...checks.filter(c => !evidence[c])].filter(Boolean) as string[];
  const current = JSON.stringify({department, mode, amount, formula, valid, purpose, owner, start, end, basis, evidence});
  const stale = Boolean(draft && snapshot !== current);
  function generate() {
    setDraft(`${mode} 정산 검토 초안\n\n부서: ${department}\n정산 대상·담당: ${owner || "[입력 필요]"}\n업무 목적: ${purpose || "[입력 필요]"}\n기간: ${start || "[입력 필요]"} ~ ${end || "[입력 필요]"}\n적용 기준(사용자 입력): ${basis || "[근거 입력 필요]"}\n\n계산 과정: ${formula}\n입력값 기준 검토금액: ${valid ? amount.toLocaleString() + "원" : "[계산 입력 확인 필요]"}\n\n증빙 확인\n${checks.map(c => `${evidence[c] ? "[확인]" : "[미확인]"} ${c}`).join("\n")}\n\n제출 전 보완사항\n${missing.length ? missing.map(m => `- ${m}`).join("\n") : "입력 및 체크 항목이 채워졌습니다. 원문 증빙과 적용 기준을 최종 대조하세요."}\n\n다음 행동: 미확인 자료 확보 → 기관 기준·증빙 대조 → 검토자 확인 → 기관 서식으로 제출\n\n이 문서는 입력값으로 만든 검토용 초안이며 법정 단가, 지급 자격, 증빙 진위를 검증하거나 지급액을 확정하지 않습니다.`);
    setSnapshot(current); setMessage("초안을 만들었습니다. 내용을 직접 수정할 수 있습니다.");
  }
  return <section className="portal-panel settlement-draft">
    <div className="panel-title"><h2>계산에서 제출 준비까지</h2><span className="status-tag pending">검토용 초안</span></div>
    <p className="muted">업무 맥락과 근거를 채우고, 증빙 누락을 확인한 뒤 편집 가능한 초안을 만드세요.</p>
    <div className="editor-grid">
      <label>업무 목적<input value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="예: 합성 사례 — 사업 현장 점검" /></label>
      <label>정산 대상·담당<input value={owner} onChange={e => setOwner(e.target.value)} placeholder="담당자 또는 대상" /></label>
      <label>시작일<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label>종료일<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
    </div>
    <label>기관 기준·근거<textarea value={basis} onChange={e => setBasis(e.target.value)} placeholder="실제로 확인한 문서명·조항·확인일과 적용 조건을 적으세요. 단가는 위 계산 입력값을 사용합니다." /></label>
    <fieldset className="draft-checks"><legend>증빙·검토 확인</legend>{checks.map(c => <label key={c}><input type="checkbox" checked={Boolean(evidence[c])} onChange={e => setEvidence({...evidence, [c]: e.target.checked})} />{c}</label>)}</fieldset>
    <div className="local-note" aria-live="polite">{missing.length ? `제출 전 ${missing.length}개 확인 필요: ${missing.join(" · ")}` : "입력·체크 완료. 최종 판단 전 원문과 대조하세요."}</div>
    <button className="primary" onClick={generate}>{draft ? "최신 입력으로 초안 다시 만들기" : "정산 검토 초안 만들기"}</button>
    {draft && <><label>직접 편집할 초안<textarea className="draft-text" value={draft} onChange={e => setDraft(e.target.value)} /></label>{stale && <p className="form-error" role="alert">계산 또는 기초 입력이 바뀌었습니다. 기존 초안은 이전 값이므로 저장을 잠시 막았습니다. 수정한 내용을 복사해 보관한 뒤 초안을 다시 만드세요.</p>}<div className="actions"><button className="secondary" disabled={stale} onClick={() => saveFile("정산검토-편집초안.txt", draft, "text/plain;charset=utf-8")}>편집 초안 TXT 저장</button><button className="secondary" disabled={stale} onClick={() => saveFile("정산검토-인쇄본.html", printableDraft(draft), "text/html;charset=utf-8")}>인쇄용 HTML 저장</button></div><p className="small muted">TXT는 직접 편집할 수 있습니다. HTML은 브라우저에서 열어 인쇄할 수 있으며 기관 공식 서식은 아닙니다. {session.saved ? "편집 내용도 이 브라우저에 자동 보관됩니다. 중요한 초안은 파일로도 저장하세요." : "편집 내용 저장에 실패했습니다. 메뉴를 떠나기 전에 파일로 저장하세요."}</p></>}
    <p className="small muted" role="status">{message}</p>
  </section>;
}


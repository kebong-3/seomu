import {useState} from "react";
import type {Employee, Request, FollowupKind} from "./workspace-store";
import {buildFollowupText, followupFingerprint, followupTargets, saveFile} from "./workspace-store";

export function RequestFollowup({request, employees}: {request: Request; employees: Employee[]}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FollowupKind>("all");
  const [draft, setDraft] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const current = followupFingerprint(request, employees) + kind;
  const stale = !!snapshot && snapshot !== current;
  const count = followupTargets(request, kind).length;
  return <div className="submission-editor">
    <div className="panel-title"><div><h3>미제출·보완 후속 안내</h3><p className="small muted">직원별 필요한 항목과 검토 메모를 묶어 안내문을 만듭니다. 실제 메시지는 전송하지 않습니다.</p></div><button className="secondary" onClick={() => setOpen(!open)}>{open ? "안내 초안 닫기" : "후속 안내 만들기"}</button></div>
    {open && <>
      <label>안내 대상<select value={kind} onChange={e => setKind(e.target.value as FollowupKind)}>
        <option value="all">미제출·누락·보완 전체</option><option value="pending">미제출</option><option value="missing">빈 항목 누락</option><option value="revision">보완 요청</option>
      </select></label>
      <p className="small muted">대상 {count}명 · 확인 완료 직원은 제외합니다. 제출한 상세 값은 포함하지 않습니다.</p>
      {!request.deadline.trim() && <p className="form-error" role="alert">제출기한이 없습니다. 안내문을 전달하기 전에 확인해 주세요.</p>}
      <button className="secondary" disabled={!count} onClick={() => {setDraft(buildFollowupText(request, employees, kind)); setSnapshot(current);}}>현재 자료로 초안 {snapshot ? "다시 만들기" : "생성"}</button>
      {!count && <p role="status">현재 조건의 후속 안내 대상이 없습니다.</p>}
      {snapshot && <>
        {stale && <p className="form-error" role="alert">요청·제출자료 또는 안내 대상이 바뀌었습니다. 기존 편집 내용을 확인한 뒤 초안을 다시 만들어 주세요. 오래된 초안은 저장할 수 없습니다.</p>}
        <label>직원별 후속 안내 초안<textarea rows={16} value={draft} onChange={e => setDraft(e.target.value)}/></label>
        <p className="small muted">전달 전 대상·기한·보완 사유를 확인하고 불필요한 개인정보를 지워 주세요. 다시 만들면 편집 내용이 교체됩니다.</p>
        <button className="primary" disabled={stale || !draft.trim()} onClick={() => saveFile(request.title + "-후속안내.txt", draft, "text/plain;charset=utf-8")}>후속 안내 TXT 저장</button>
      </>}
    </>}
  </div>;
}

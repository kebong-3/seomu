import type {Employee, Request} from "./workspace-store";
import {collectionReadiness, collectionReadinessText, collectionIssueLabels, saveFile} from "./workspace-store";

export function RequestReadiness({request, employees, onInspect}: {request: Request; employees: Employee[]; onInspect: (rowIndex: number) => void}) {
  const result = collectionReadiness(request, employees);
  const groups = Object.entries(collectionIssueLabels).flatMap(([kind, label]) => {
    const issues = result.issues.filter(issue => issue.kind === kind);
    return issues.length ? [{kind, label, issues}] : [];
  });
  return <section className="submission-editor" aria-label="취합 전 확인">
    <div className="panel-title"><div><h3>취합 전 확인</h3><p role="status">{result.ready ? "기록상 확인할 항목 없음" : `확인 필요 ${result.affectedRows}행 · 요청 설정 ${result.settingsIssues}건`}</p></div>
      <button className="secondary" onClick={() => saveFile((request.title || "요청") + "-취합점검.txt", collectionReadinessText(request, employees), "text/plain;charset=utf-8")}>점검 기록 TXT 저장</button></div>
    <p className="small muted">대상 {result.totalRows}행 중 확인 필요 행은 중복 제외입니다. 유형별 건수는 같은 행이 겹칠 수 있으며 인원 합계가 아닙니다.</p>
    {groups.map(group => <details key={group.kind}><summary>{group.label} · {group.issues.length}건</summary><ul>{group.issues.map((issue, index) => <li key={index}>
      <b>{issue.rowIndex === undefined ? "요청 설정" : `${issue.rowIndex + 1}행 · ${issue.name} / ${issue.team} (직원 ID: ${issue.employeeId || "미입력"})`}</b>
      <p>{issue.detail}</p>{issue.rowIndex !== undefined && <button className="secondary" onClick={() => onInspect(issue.rowIndex!)}>해당 행 입력·검토</button>}
    </li>)}</ul></details>)}
    <p className="small muted">입력 상태·빈칸 점검입니다. 내용 정확성·증빙 진위·실제 제출 여부는 원문과 별도로 확인하세요. CSV에는 미확인 자료도 포함될 수 있습니다.</p>
  </section>;
}

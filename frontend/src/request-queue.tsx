import {useState} from 'react';
import type {Request} from './workspace-store';
import {requestQueue,requestQueueCsv,validQueueDate,saveFile} from './workspace-store';
const labels:Record<string,string>={overdue:'기한 경과',today:'오늘 마감',unknown:'기한 확인',upcoming:'예정'};
export function RequestQueue({requests,onOpen}:{requests:Request[];onOpen:(id:string)=>void}) {
  const [asOf,setAsOf]=useState(()=>new Date().toLocaleDateString('sv-SE'));
  const [filter,setFilter]=useState('all');
  const queue=requestQueue(requests,asOf);
  const items=queue.filter(item=>filter==='all' || (filter==='review' ? item.review>0 : item.timing===filter));
  return <section className="portal-panel request-queue" aria-label="요청 처리 목록">
    <div className="panel-title"><div><h2>지금 처리할 요청</h2><p className="small muted">확인 완료 요청은 제외합니다. 한 직원이 미제출·누락에 함께 포함될 수 있습니다.</p></div></div>
    <div className="queue-controls"><label>확인 기준일<input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)}/></label>
      <label>처리할 대상<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">전체 진행 요청</option><option value="overdue">기한 경과</option><option value="today">오늘 마감</option><option value="unknown">기한 확인 필요</option><option value="review">검토 대기 있음</option></select></label>
      <button className="secondary" disabled={!queue.length} onClick={()=>saveFile('요청-처리목록.csv',requestQueueCsv(requests,asOf))}>전체 처리 목록 CSV</button></div>
    {!validQueueDate(asOf)&&<p role="alert">확인할 기준일을 올바르게 입력하세요.</p>}
    <p className="small muted">현재 조건 {items.length}건 / 진행 {queue.length}건 · 날짜는 입력된 기한 기준이며 휴일·법정기한을 계산하지 않습니다.</p>
    <div className="queue-list">{items.map(item=><button className="queue-item" key={item.id} onClick={()=>onOpen(item.id)}>
      <span><b>{item.title}</b><span>{labels[item.timing]} · {item.deadline||'기한 미입력'}</span></span>
      <span>{item.unassigned?'제출 대상 미설정':`미제출 ${item.pending} · 보완 ${item.revision} · 누락 ${item.missing} · 검토 대기 ${item.review}`}</span>
      <strong>{item.next} →</strong>
    </button>)}</div>
    {validQueueDate(asOf)&&!items.length&&<p role="status">현재 조건에서 처리할 요청이 없습니다.</p>}
  </section>;
}

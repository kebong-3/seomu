import type {Procedure} from './procedures';
export const progressKey='seomu-procedure-progress-v1';
export type ProcessingRecord={snapshot:string;checks:number[];note:string};
export type ProcedureProgress={version:1;selected:string;records:Record<string,ProcessingRecord>};
export const emptyProgress=():ProcedureProgress=>({version:1,selected:'',records:{}});
// Store the exact basis, rather than a lossy hash, so source edits cannot retain confirmation.
export function procedureSnapshot(p:Procedure){return JSON.stringify([p.title,p.institution,p.source,p.version,p.text,p.steps]);}
export function parseProgress(raw:string|null):ProcedureProgress{
 if(!raw)return emptyProgress();
 if(raw.length>25000000)throw Error('처리 기록 용량 초과');
 const d=JSON.parse(raw);
 if(!d||d.version!==1||typeof d.selected!=='string'||d.selected.length>50000||!d.records||typeof d.records!=='object'||Array.isArray(d.records)||Object.keys(d.records).length>100)throw Error('처리 기록 형식 오류');
 for(const r of Object.values(d.records) as ProcessingRecord[]){
  if(!r||typeof r.snapshot!=='string'||r.snapshot.length>500000||typeof r.note!=='string'||r.note.length>1000||!Array.isArray(r.checks)||r.checks.length>30||r.checks.some(i=>!Number.isInteger(i)||i<0||i>=30)||new Set(r.checks).size!==r.checks.length)throw Error('처리 기록 항목 오류');
 }
 return d;
}
export function currentRecord(p:Procedure,r?:ProcessingRecord){
 const stale=!!r&&r.snapshot!==procedureSnapshot(p);
 return {stale,checks:stale?[]:(r?.checks||[]).filter(i=>i<p.steps.length),note:r?.note||''};
}
export function persistProgress(storage:Pick<Storage,'setItem'>,next:ProcedureProgress){try{const raw=JSON.stringify(next);parseProgress(raw);storage.setItem(progressKey,raw);return true;}catch{return false;}}
export function procedureRecordText(p:Procedure,r?:ProcessingRecord){const state=currentRecord(p,r);return `${p.title}\n현재 처리 기록 · 공식 결재·지급 확정과 별개\n업무건·대상: ${state.note||'미입력'}\n기관: ${p.institution}\n버전: ${p.version}\n출처: ${p.source}\n${state.stale?'자료가 변경되어 이전 처리 확인은 제외되었습니다.\n':''}\n${p.steps.map((s,i)=>`${state.checks.includes(i)?'[처리 확인]':'[미확인]'} ${i+1}. ${s.action}\n기한: ${s.deadline||'미확인'}\n서류: ${s.form||'미확인'}\n근거: ${s.quote}`).join('\n\n')}\n\n근거 원문\n${p.text}`;}

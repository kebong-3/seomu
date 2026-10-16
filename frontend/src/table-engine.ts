export type Grid = {id:string; file:string; sheet:string; cells:string[][]; header:number; mapping:Record<string,number>};
export type MergedRow = {values:Record<string,string>; file:string;sheet:string;row:number;issues:string[]};
export const normalHeader=(s:string)=>s.replace(/[\s()·_\-]/g,'').toLowerCase();
const aliases:Record<string,string[]>={'성명':['이름','직원명'],'부서':['소속','부서명','실과'],'대상코드':['직원코드','직원ID','사번'],'증빙자료명':['수료증자료명','근거자료명'],'이수일':['수료일','교육이수일'],'시간':['교육시간','이수시간']};
export function suggestMapping(headers:string[],fields:string[]){return Object.fromEntries(fields.map(f=>{const matches=headers.flatMap((h,i)=>[f,...(aliases[f]||[])].some(a=>normalHeader(a)===normalHeader(h))?[i]:[]);return[f,matches.length===1?matches[0]:-1];}));}
export function parseDelimited(text:string):string[][] {
 const clean=text.replace(/^\uFEFF/,''); const delim=clean.split(/\r?\n/)[0].includes('\t')?'\t':',';
 const rows:string[][]=[];let row:string[]=[];let cell='';let quoted=false;
 for(let i=0;i<clean.length;i++){const c=clean[i];if(c==='"'){if(quoted&&clean[i+1]==='"'){cell+='"';i++;}else if(!quoted&&cell==='')quoted=true;else if(quoted)quoted=false;else cell+=c;}else if(c===delim&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&clean[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('닫히지 않은 따옴표가 있습니다. CSV 원본을 확인하세요.');
 if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
export function mergeGrids(grids:Grid[],fields:string[],required:string[],keyFields:string[],expected:string[]=[]){
 if(!fields.length||fields.length>50||new Set(fields).size!==fields.length||fields.some(f=>!f.trim()))throw Error('서로 다른 기준 열을 1~50개 입력하세요.');
 if(keyFields.some(k=>!fields.includes(k))||required.some(k=>!fields.includes(k)))throw Error('필수·중복 기준 열을 다시 선택하세요.');
 const result:MergedRow[]=[];
 for(const g of grids){if(!Number.isInteger(g.header)||g.header<0||g.header>=g.cells.length)throw Error(`${g.file}: 제목행을 선택하세요.`);
  const used=fields.map(f=>g.mapping[f]).filter(n=>n>=0);if(new Set(used).size!==used.length)throw Error(`${g.file} / ${g.sheet}: 같은 원본 열을 두 기준 열에 연결했습니다.`);
  for(let i=g.header+1;i<g.cells.length;i++){const cells=g.cells[i];if(!cells.some(c=>c.trim()))continue;
   const values=Object.fromEntries(fields.map(f=>[f,g.mapping[f]>=0?cells[g.mapping[f]]??'':'']));
   const issues=required.filter(f=>!values[f].trim()).map(f=>`${f} 누락`);
   if(!Object.values(values).some(v=>v.trim()))issues.push('연결 열에 값 없음 · 원본 확인');
   result.push({values,file:g.file,sheet:g.sheet,row:i+1,issues});
  }
 }
 if(result.length>10000)throw Error('취합 결과는 최대 10,000행입니다. 파일을 나누어 처리하세요.');
 const key=(r:MergedRow)=>keyFields.every(f=>r.values[f]?.trim())?JSON.stringify(keyFields.map(f=>r.values[f].trim())):'';
 const counts=new Map<string,number>();if(keyFields.length)result.forEach(r=>{const k=key(r);if(k)counts.set(k,(counts.get(k)||0)+1);});
 result.forEach(r=>{if(keyFields.length&&(counts.get(key(r))||0)>1)r.issues.push('중복 후보 · 원본 보존');});
 const actual=new Set(result.map(r=>keyFields.length===1?r.values[keyFields[0]].trim():''));
 const missing=keyFields.length===1?[...new Set(expected.map(s=>s.trim()).filter(Boolean))].filter(s=>!actual.has(s)):[];
 return{rows:result,missing,duplicates:result.filter(r=>r.issues.some(s=>s.startsWith('중복'))).length};
}
export function isoDate(v:string){const m=v.trim().match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?$/);if(!m)return '';const s=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;const d=new Date(s+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';}
export function numberValue(v:string){if(!v.trim())return null;const s=v.replace(/,/g,'').trim();if(!/^\d+(\.\d+)?$/.test(s))return null;const n=Number(s);return Number.isFinite(n)&&n<=1e12?n:null;}
export const mealFields=['대상코드','성명','근무일','승인시작','승인종료','실제시작','실제종료','공제분','식사구분','청구액','증빙번호','중복지원'];
export type MealRule={minutes:string;cap:string;basis:string;start:string;end:string};
function moment(date:string,time:string){const s=time.trim();const full=s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})$/);const clock=s.match(/^(\d{1,2}):(\d{2})$/);if(!full&&!clock)return null;const day=full?isoDate(full[1]):date;const h=Number(full?full[2]:clock![1]),m=Number(full?full[3]:clock![2]);if(!day||h>23||m>59)return null;return Date.parse(`${day}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00Z`);}
export function mealRuleIssues(rule:MealRule){return [numberValue(rule.minutes)===null&&'최소 확인시간(분)',numberValue(rule.cap)===null&&'1식 검토한도',!rule.basis.trim()&&'기관 기준·문서명',!isoDate(rule.start)&&'적용 시작일',!isoDate(rule.end)&&'적용 종료일',isoDate(rule.start)&&isoDate(rule.end)&&rule.start>rule.end&&'적용기간 순서'].filter(Boolean) as string[];}
export function reviewMeals(rows:MergedRow[],rule:MealRule){
 const ruleErrors=mealRuleIssues(rule);const keyCounts=new Map<string,number>();
 const key=(v:Record<string,string>)=>v['대상코드']?.trim()&&isoDate(v['근무일'])&&v['식사구분']?.trim()?JSON.stringify([v['대상코드'].trim(),isoDate(v['근무일']),v['식사구분'].trim()]):'';
 rows.forEach(r=>{const k=key(r.values);if(k)keyCounts.set(k,(keyCounts.get(k)||0)+1);});
 return rows.map(r=>{const v=r.values;const issues=[...r.issues];const day=isoDate(v['근무일']);
  if(!v['대상코드'].trim())issues.push('대상코드 누락');if(!v['성명'].trim())issues.push('성명 누락');if(!day)issues.push('근무일 형식 오류');
  const times=['승인시작','승인종료','실제시작','실제종료'].map(f=>moment(day,v[f]||''));let minutes:number|null=null;
  if(times.some(x=>x===null))issues.push('승인·실제 일시 누락 또는 오류');else {const[a,b,c,d]=times as number[];if(day&&(new Date(a).toISOString().slice(0,10)!==day||new Date(c).toISOString().slice(0,10)!==day))issues.push('시작 일시와 근무일 불일치');if(b<=a||d<=c||b-a>86400000||d-c>86400000)issues.push('시간 순서·24시간 초과 확인 · 자정 경과는 날짜 포함');else{const deduction=numberValue(v['공제분']);const overlap=Math.max(0,Math.min(b,d)-Math.max(a,c))/60000;if(deduction===null||deduction>overlap)issues.push('공제분 오류 · 겹치는 시간 이내로 입력');else{minutes=overlap-deduction;if(overlap===0)issues.push('승인·실제 시간 겹침 없음');if(c<a||d>b)issues.push('승인 범위 밖 실제 근무 · 정정 여부 확인');}}}
  const amount=numberValue(v['청구액']);if(amount===null||!Number.isInteger(amount))issues.push('청구액은 0 이상의 원 단위 정수');
  if(!v['증빙번호'].trim())issues.push('증빙번호 누락');if(!v['식사구분'].trim())issues.push('식사구분 누락');
  if(v['중복지원'].trim()!=='없음')issues.push(v['중복지원'].trim()==='있음'?'식사·출장비 등 중복지원 확인':'중복지원 여부 미확인 · 없음/있음 입력');
  if((keyCounts.get(key(v))||0)>1)issues.push('동일인·일자·식사 중복 후보');
  if(ruleErrors.length)issues.push('기관 기준 미완성: '+ruleErrors.join(', '));else {if(day&&(day<rule.start||day>rule.end))issues.push('기관 기준 적용기간 밖');if(minutes!==null&&minutes<numberValue(rule.minutes)!)issues.push('입력한 최소 확인시간 미달');if(amount!==null&&amount>numberValue(rule.cap)!)issues.push('입력한 1식 한도 초과');}
  return {...r,issues:[...new Set(issues)],minutes,amount,day,status:issues.length?'확인 필요':'입력 기준상 이상 없음 · 최종 검토 필요'};
 });
}
export const approvalFields=['대상코드','성명','근무일','승인시작','승인종료'];
export const actualFields=['대상코드','성명','근무일','실제시작','실제종료','공제분'];
export function pairOvertime(approved:MergedRow[],actual:MergedRow[]){
 const key=(r:MergedRow)=>r.values['대상코드']?.trim()&&isoDate(r.values['근무일']||'')?JSON.stringify([r.values['대상코드'].trim(),isoDate(r.values['근무일'])]):'';
 const group=(rows:MergedRow[],side:string)=>{const map=new Map<string,MergedRow[]>();rows.forEach((r,i)=>{const k=key(r)||'invalid-'+side+'-'+i;map.set(k,[...(map.get(k)||[]),r]);});return map;};
 const a=group(approved,'approved'),b=group(actual,'actual');const all=[...new Set([...a.keys(),...b.keys()])];
 return all.map(k=>{const aa=a.get(k)||[],bb=b.get(k)||[];const origin=aa[0]||bb[0];const issue:string[]=[];
  if(!aa.length)issue.push('승인자료 없음');if(!bb.length)issue.push('실적자료 없음');if(k.startsWith('invalid-'))issue.push('대상코드·근무일 확인');if(aa.length>1||bb.length>1)issue.push('같은 코드·일자 여러 행 · 자동 연결 보류');
  if(aa.length===1&&bb.length===1&&aa[0].values['성명'].trim()!==bb[0].values['성명'].trim())issue.push('대상코드는 같으나 성명 불일치');
  const values:Record<string,string>={'대상코드':origin.values['대상코드'],'성명':origin.values['성명'],'근무일':isoDate(origin.values['근무일'])||origin.values['근무일'],'승인시작':aa.length===1?aa[0].values['승인시작']:'','승인종료':aa.length===1?aa[0].values['승인종료']:'','실제시작':bb.length===1?bb[0].values['실제시작']:'','실제종료':bb.length===1?bb[0].values['실제종료']:'','공제분':bb.length===1?bb[0].values['공제분']:''};
  return {values,issues:[...issue,...aa.flatMap(r=>r.issues),...bb.flatMap(r=>r.issues)],approved:aa.map(r=>`${r.file} / ${r.sheet} / ${r.row}행`).join('\n'),actual:bb.map(r=>`${r.file} / ${r.sheet} / ${r.row}행`).join('\n')};
 });
}

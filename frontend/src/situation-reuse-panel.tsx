import {useEffect, useState} from 'react';
import type {Procedure} from './procedures';
import type {SituationCase} from './situation-engine';
import {prepareCaseReuse, reusableFields, reuseSnapshot} from './situation-reuse';

export function SituationReusePanel({source, procedure, existing, blocked, onCreate}: {
  source: SituationCase; procedure: Procedure; existing: SituationCase[];
  blocked: string; onCreate: (fresh: SituationCase) => void;
}) {
  const [draft, setDraft] = useState<{snapshot: string; situation: string; selected: string[]} | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {setDraft(null); setError('');}, [source.id]);
  let fields: ReturnType<typeof reusableFields> = [], validation = '';
  try {fields = reusableFields(source, procedure);} catch (e) {validation = e instanceof Error ? e.message : '기관 절차를 확인하세요.';}
  const reason = blocked || validation || (existing.length >= 20 ? '업무건은 20개까지 보관합니다. 백업 후 정리해 주세요.' : '');
  const changed = !!draft && draft.snapshot !== reuseSnapshot(source, procedure);
  function open() {setDraft({snapshot: reuseSnapshot(source, procedure), situation: source.situation, selected: []}); setError('');}
  return <section className="portal-panel" aria-label="기존 값으로 새 업무 준비">
    <h2>비슷한 업무, 필요한 값만 이어 쓰세요</h2>
    <p>원래 업무건은 남겨 두고 새 상황으로 시작합니다. 이전 조건 답·완료 체크는 가져오지 않습니다.</p>
    {!draft ? <button className="secondary" disabled={!!reason} onClick={open}>이 업무건으로 새 업무 시작</button> : <>
      <label>새 업무 상황<textarea rows={3} maxLength={4000} value={draft.situation} disabled={!!reason || changed} onChange={e => setDraft({...draft, situation: e.target.value})}/></label>
      <fieldset style={{minWidth: 0}} disabled={!!reason || changed}><legend>다시 쓸 수동 입력값 선택 · 기본 0개</legend>
        <p className="small muted">이번 건에서도 맞는 값만 직접 고르세요. 금액·담당자 등 선택한 값의 정확성은 다시 확인해야 합니다.</p>
        {fields.length ? fields.map(field => <label className="checkbox" key={field.key}>
          <input type="checkbox" checked={draft.selected.includes(field.key)} onChange={e => setDraft({...draft, selected: e.target.checked ? [...draft.selected, field.key] : draft.selected.filter(key => key !== field.key)})}/>
          <span style={{minWidth: 0, overflowWrap: 'anywhere'}}><b>{field.key}</b> · {field.value}</span>
        </label>) : <p>재사용할 수동 입력값이 없습니다. 상황과 기관 절차로 새로 시작합니다.</p>}
      </fieldset>
      <p role="status">수동 입력값 {draft.selected.length}개 선택 · 이전 조건 답 {Object.keys(source.answers).length}개 제외 · 완료 체크 {source.done.length}개 초기화</p>
      <p className="small muted">새 상황의 명시 문구만 다시 읽으며, 빠진 조건은 다시 질문합니다. 자동 계산 항목·기관 규정·작성일·서식 파일은 복사하지 않습니다. 저장한 같은 기관 절차를 사용하며 원문 최신성의 인증이 아닙니다.</p>
      {changed && <p role="alert">업무건 또는 절차가 변경됐습니다. 선택을 초기화하고 새 기준으로 다시 열어 주세요.</p>}
      <div className="ai-links"><button className="primary" disabled={!!reason || changed || draft.situation.trim().length < 2} onClick={() => {
        try {onCreate(prepareCaseReuse(source, procedure, existing, draft.situation, draft.selected, draft.snapshot)); setDraft(null); setError('');}
        catch (e) {setError(e instanceof Error ? e.message : '새 업무건을 만들지 못했습니다.');}
      }}>선택한 값으로 새 업무건 만들기</button>
      {changed && <button className="secondary" disabled={!!reason} onClick={open}>새 기준으로 다시 열기</button>}
      <button className="secondary" onClick={() => {setDraft(null); setError('');}}>취소</button></div>
    </>}
    {reason && <p className="small muted">{reason}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}

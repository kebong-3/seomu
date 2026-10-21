import {procedureIssues, validProcedure, type Procedure} from './procedures';
import {derivedFields, makeCase, parseCases, sameBasis, type SituationCase} from './situation-engine';

/** Identity of the local source, including values changed while the panel is open. */
export function reuseSnapshot(source: SituationCase, procedure: Procedure) {
  return JSON.stringify({source, procedure});
}

function checkSource(source: SituationCase, procedure: Procedure | undefined) {
  if (!procedure || !validProcedure(procedure) || procedureIssues(procedure).length)
    throw Error('사용할 기관 절차의 근거를 먼저 확인하세요.');
  parseCases(JSON.stringify({version: 1, selected: source.id, items: [source]}));
  if (source.procedureId !== procedure.id || !sameBasis(source.basis, procedure))
    throw Error('기관 규정·절차가 바뀌었습니다. 현재 업무건의 변경 내용을 먼저 확인하세요.');
  return procedure;
}

/** Only explicitly entered, own manual values may be offered for reuse. */
export function reusableFields(source: SituationCase, procedure: Procedure) {
  checkSource(source, procedure);
  return Object.entries(source.fields).filter(([key, value]) =>
    key.trim() && value.trim() && !derivedFields.includes(key) &&
    !procedure.questions?.some(question => question.label === key),
  ).map(([key, value]) => ({key, value}));
}

export function prepareCaseReuse(source: SituationCase, procedure: Procedure | undefined,
  existing: SituationCase[], situation: string, selectedKeys: string[], expectedSnapshot: string): SituationCase {
  const current = checkSource(source, procedure);
  if (expectedSnapshot !== reuseSnapshot(source, current))
    throw Error('업무건 또는 기관 절차가 변경되었습니다. 새 업무 준비를 다시 열어 주세요.');
  if (existing.length >= 20) throw Error('업무건은 20개까지 보관합니다. 백업 후 정리해 주세요.');
  const stored = existing.find(item => item.id === source.id);
  if (!stored) throw Error('원본 업무건을 찾지 못했습니다.');
  if (reuseSnapshot(stored, current) !== expectedSnapshot)
    throw Error('원본 업무건이 변경되었습니다. 새 업무 준비를 다시 열어 주세요.');
  if (typeof situation !== 'string' || situation.trim().length < 2 || situation.length > 4000)
    throw Error('새 업무 상황을 2~4,000자로 입력하세요.');
  if (!Array.isArray(selectedKeys) || selectedKeys.length > 100 || new Set(selectedKeys).size !== selectedKeys.length)
    throw Error('재사용할 항목을 다시 선택하세요.');
  const candidates = reusableFields(source, current);
  if (selectedKeys.some(key => !candidates.some(field => field.key === key)))
    throw Error('재사용할 수 없는 항목이 포함되었습니다. 항목 선택을 다시 확인하세요.');
  // makeCase reads only literal phrases in the NEW situation, never prior answers or checks.
  const fresh = makeCase(current, situation.trim());
  if (existing.some(item => item.id === fresh.id)) throw Error('새 업무 식별자를 만들지 못했습니다. 다시 시도하세요.');
  fresh.fields = Object.fromEntries(candidates.filter(field => selectedKeys.includes(field.key)).map(field => [field.key, field.value]));
  parseCases(JSON.stringify({version: 1, selected: fresh.id, items: [fresh]}));
  return fresh;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const nativeRequire=createRequire(import.meta.url),cache=new Map();
function load(name){
  if(cache.has(name))return cache.get(name);
  const path=new URL(`../src/${name}${existsSync(new URL(`../src/${name}.ts`,import.meta.url))?'.ts':'.tsx'}`,import.meta.url);
  const context={exports:{},structuredClone,crypto:webcrypto,Date,Blob,URL,setTimeout,console,require:n=>n.startsWith('./')?load(n.slice(2)):nativeRequire(n)};
  vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
  cache.set(name,context.exports);return context.exports;
}
const {travelProcedure:procedure}=load('procedure-samples');
const {makeCase,parseCases,pendingQuestions}=load('situation-engine');
const {reuseSnapshot,reusableFields,prepareCaseReuse}=load('situation-reuse');
function fixture(){
  const c=makeCase(procedure,'공용차를 탔고 점심을 제공받았어요. 출장 정산을 준비합니다.');
  c.answers.vehicle={value:'public_car',quote:'직접 확인',origin:'user'};
  c.answers.meal={value:'provided',quote:'점심을 제공받았어요',origin:'ai'};
  c.done=[0,2,3];c.fields={담당자:'합성 담당',금액:'12345',기관명:'이전 기관',작성일:'2000-01-01',처리순서:'지난 순서',[procedure.questions[0].label]:'이전 조건'};
  return c;
}
const reuse=(source,keys=[],situation='새로운 출장 정산을 준비합니다.',existing=[source],p=procedure,snapshot=reuseSnapshot(source,p))=>prepareCaseReuse(source,p,existing,situation,keys,snapshot);

test('default starts a distinct case with no copied values, answers or completion and preserves original',()=>{
  const c=fixture(),before=JSON.stringify(c),fresh=reuse(c);
  assert.notEqual(fresh.id,c.id);assert.equal(fresh.procedureId,c.procedureId);
  assert.equal(Object.keys(fresh.fields).length,0);assert.equal(Object.keys(fresh.answers).length,0);assert.equal(fresh.done.length,0);
  assert.equal(pendingQuestions(procedure,fresh.answers).length,2);assert.equal(JSON.stringify(c),before);
  assert.notEqual(fresh.basis,c.basis);assert.equal(parseCases(JSON.stringify({version:1,selected:fresh.id,items:[c,fresh]})).items.length,2);
});
test('only explicitly selected own manual values copy while generated and question fields stay excluded',()=>{
  const c=fixture();assert.deepEqual(Array.from(reusableFields(c,procedure),f=>f.key),['담당자','금액']);
  const fresh=reuse(c,['담당자']);assert.equal(fresh.fields.담당자,'합성 담당');assert.equal(Object.keys(fresh.fields).length,1);
  for(const key of ['기관명','작성일','처리순서',procedure.questions[0].label,'missing','constructor','toString'])assert.throws(()=>reuse(c,[key]),/항목/);
  assert.throws(()=>reuse(c,['담당자','담당자']),/항목/);
});
test('new situation re-reads literals but never carries previous user or AI judgments',()=>{
  const c=fixture(),fresh=reuse(c,[],'공용차를 탔어요. 새 출장 정산을 준비합니다.');
  assert.equal(fresh.answers.vehicle.value,'public_car');assert.equal(fresh.answers.vehicle.origin,'literal');assert.equal(fresh.answers.meal,undefined);
  assert.equal(fresh.done.length,0);assert.equal(pendingQuestions(procedure,fresh.answers).length,1);
  const uncertain=reuse(c,[],'공용차를 타지 않았어요. 새 정산입니다.');assert.equal(uncertain.answers.vehicle,undefined);
});
test('missing, changed, invalid or incompletely sourced procedure blocks reuse',()=>{
  const c=fixture();assert.throws(()=>prepareCaseReuse(c,undefined,[c],'새 업무',[],''),/기관 절차/);
  for(const p of [{...procedure,version:'다른 버전'},{...procedure,institution:'다른 기관'},{...procedure,id:'other'},{...procedure,source:''},{...procedure,steps:[]}])assert.throws(()=>reuse(c,[],'새 업무',[c],p));
});
test('source edits after opening or a stale captured source require reopening rather than silently copying',()=>{
  const c=fixture(),snapshot=reuseSnapshot(c,procedure),edited={...c,fields:{...c.fields,담당자:'다른 담당'}};
  assert.throws(()=>reuse(edited,['담당자'],'새 업무',[edited],procedure,snapshot),/변경/);
  assert.throws(()=>reuse(c,['담당자'],'새 업무',[edited],procedure,snapshot),/변경/);
  assert.throws(()=>reuse(c,[],'새 업무',[]),/찾지/);
  assert.throws(()=>reuse(c,[],'새 업무',[c],procedure,reuseSnapshot({...c,done:[]},procedure)),/변경/);
});
test('capacity and text bounds reject before creating a new case and originals stay intact',()=>{
  const c=fixture(),before=JSON.stringify(c);
  assert.throws(()=>reuse(c,[],'새 업무',Array(20).fill(c)),/20개/);
  for(const text of ['',' ','가','가'.repeat(4001)])assert.throws(()=>reuse(c,[],text),/4,000/);
  for(const fields of [{x:'가'.repeat(4001)},{['x'.repeat(101)]:'값'},Object.fromEntries(Array.from({length:101},(_,i)=>['x'+i,'값']))])assert.throws(()=>reuse({...c,fields}));
  assert.equal(JSON.stringify(c),before);
});
test('inherited values and metadata cannot leak into the new case or bypass field checks',()=>{
  const c=fixture();c.fields=Object.assign(Object.create({숨은값:'PRIVATE_INHERITED'}),{담당자:'합성 담당'});c.privateMetadata={token:'PRIVATE_METADATA'};
  const fresh=reuse(c,['담당자']);assert.equal(reusableFields(c,procedure).length,1);assert.throws(()=>reuse(c,['숨은값']));
  assert.ok(!JSON.stringify(fresh).includes('PRIVATE_'));assert.equal(fresh.privateMetadata,undefined);
});
test('unchanged old saved format remains usable and reuse panel begins without selecting values',()=>{
  const c=fixture(),restored=parseCases(JSON.stringify({version:1,selected:c.id,items:[c]}));
  assert.equal(reuse(restored.items[0],['금액']).fields.금액,'12345');
  const {SituationReusePanel}=load('situation-reuse-panel');
  const html=renderToStaticMarkup(createElement(SituationReusePanel,{source:c,procedure,existing:[c],blocked:'',onCreate:()=>{}}));
  assert.match(html,/이 업무건으로 새 업무 시작/);assert.doesNotMatch(html,/type="checkbox"/);
  const blocked=renderToStaticMarkup(createElement(SituationReusePanel,{source:c,procedure,existing:[c],blocked:'저장본 손상',onCreate:()=>{}}));
  assert.match(blocked,/disabled/);assert.match(blocked,/저장본 손상/);
});

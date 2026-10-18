import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
const nativeRequire=createRequire(import.meta.url),cache=new Map();
function load(name){if(cache.has(name))return cache.get(name);const context={exports:{},structuredClone,crypto:webcrypto,Date,Blob,URL,setTimeout,console,require:n=>n.startsWith('./')?load(n.slice(2)):nativeRequire(n)};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);cache.set(name,context.exports);return context.exports;}
const {travelProcedure:travel,purchaseProcedure:purchase}=load('procedure-samples');
const {validProcedure,procedureIssues}=load('procedures');
const {makeCase,stepPlan,pendingQuestions,parseCases,rebaseCase,sameBasis,documentValues,outputIssues,literalFacts}=load('situation-engine');
for(const p of [travel,purchase]){assert.equal(validProcedure(p),true);assert.equal(procedureIssues(p).length,0);}
const c=makeCase(travel,'공용차를 탔고 점심을 제공받았어요. 출장 정산 준비해 주세요.');
assert.equal(c.answers.vehicle.value,'public_car');assert.equal(c.answers.meal.value,'provided');
assert.equal(pendingQuestions(travel,c.answers).length,0);
const plan=stepPlan(travel,c.answers);assert.equal(plan[1].applies,false);assert.equal(plan[2].applies,true);assert.equal(plan[3].applies,true);assert.equal(plan[4].applies,false);
const unknown=makeCase(travel,'출장을 다녀왔어요.');assert.equal(pendingQuestions(travel,unknown.answers).length,2);assert.equal(stepPlan(travel,unknown.answers)[1].applies,null);assert.equal(outputIssues(unknown,travel).length,2);
assert.equal(literalFacts(travel,'공용차를 이용했지만 아니라고 정정합니다.').vehicle,undefined);
const purchaseCase=makeCase(purchase,'물품을 받았는데 검수 전이에요.');assert.equal(pendingQuestions(purchase,purchaseCase.answers).length,0);assert.equal(stepPlan(purchase,purchaseCase.answers)[1].applies,true);assert.equal(stepPlan(purchase,purchaseCase.answers)[2].applies,false);
c.done=[0,2,3];c.fields={'담당자':'가상 직원','규정버전':'오래된 버전','처리순서':'잘못된 순서'};
const values=documentValues(c,travel);assert.equal(values['담당자'],'가상 직원');assert.equal(values['규정버전'],travel.version);assert.notEqual(values['처리순서'],'잘못된 순서');
const restored=parseCases(JSON.stringify({version:1,selected:c.id,items:[c,unknown]}));assert.equal(restored.items[0].answers.meal.value,'provided');assert.equal(restored.items[0].done.length,3);
const updated=structuredClone(travel);updated.version='연습 v2';updated.steps[3].action='식사 제공 내역 재확인';assert.equal(sameBasis(c.basis,updated),false);assert.ok(outputIssues(c,updated).length);
const rebased=rebaseCase(c,updated);assert.deepEqual(Array.from(rebased.done),[0,2]);assert.equal(rebased.fields['담당자'],'가상 직원');assert.equal(sameBasis(rebased.basis,updated),true);
const changedQuestion=structuredClone(travel);changedQuestion.questions[0].label='새 교통수단 질문';const rebound=rebaseCase(c,changedQuestion);assert.equal(rebound.answers.vehicle,undefined);assert.ok(!rebound.done.includes(2));
const other={...travel,institution:'다른 기관'};assert.equal(rebaseCase(c,other).done.length,0);assert.equal(Object.keys(rebaseCase(c,other).answers).length,0);
for(const bad of [{version:2,selected:'',items:[]},{version:1,selected:'missing',items:[c]},{version:1,selected:c.id,items:[{...c,done:[99]}]},{version:1,selected:c.id,items:[{...c,answers:{unknown:{value:'yes',quote:'',origin:'user'}}}]}])assert.throws(()=>parseCases(JSON.stringify(bad)));
assert.equal(validProcedure({...travel,steps:[{...travel.steps[0],condition:false}]}),false);
console.log('Situation: conditional trip/purchase plans, only missing questions, conservative literals, resume, changed rules, retained unaffected steps, derived field integrity, corrupt backup guards passed');

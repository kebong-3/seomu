import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/workspace-store.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {collectionReadiness:check,collectionReadinessText:report,updateRequestRow,validWorkspace,emptyWorkspace,requestQueue}=context.exports;
const employees=[{id:'a',name:'가직원',team:'총무팀',duty:'',backup:''},{id:'b',name:'나직원',team:'운영팀',duty:'',backup:''}];
const row=(employeeId='a',state='approved',values={'교육명':'PRIVATE_VALUE','시간':'3'})=>({employeeId,state,values,note:'PRIVATE_REVIEW_NOTE'});
const request=(rows=[row()])=>({id:'request-proof',title:'합성 교육 취합',category:'education',deadline:'2026-10-31',reference:'',created:'',fields:['교육명','시간'],rows});
test('all approved complete rows pass recorded-state check without certifying content',()=>{
  const req=request([row(),row('b')]), before=JSON.stringify(req);
  const result=check(req,employees);
  assert.equal(result.ready,true); assert.equal(result.totalRows,2); assert.equal(result.affectedRows,0);
  assert.equal(JSON.stringify(req),before);
  assert.match(report(req,employees),/내용 정확성·증빙 진위·실제 제출 여부는 별도로 확인/);
});
test('all open states need action and blank fields apply even to approved imports',()=>{
  const req=request([row('a','pending',{}),row('b','revision'),row('a','submitted'),row('b','approved',{'교육명':' ','시간':''})]);
  assert.equal(validWorkspace({...emptyWorkspace,employees,requests:[req]}),true);
  const result=check(req,employees), kinds=new Set(result.issues.map(issue=>issue.kind));
  for(const kind of ['pending','revision','review','missing','approved_missing'])assert.ok(kinds.has(kind));
  assert.equal(result.affectedRows,4); assert.equal(result.ready,false);
});
test('duplicate target and orphan rows retain separate row identities and no double row count',()=>{
  const result=check(request([row('a','pending',{}),row('a'),row('missing')]),employees);
  assert.equal(result.issues.filter(issue=>issue.kind==='duplicate_target').length,2);
  assert.equal(result.issues.filter(issue=>issue.kind==='employee').length,1);
  assert.equal(result.affectedRows,3);
  assert.ok(result.issues.length>result.affectedRows);
  const text=report(request([row('a','pending',{}),row('a'),row('missing')]),employees);
  assert.match(text,/1행 · 직원 ID a · 가직원 \/ 총무팀/);
  assert.match(text,/2행 · 직원 ID a/);assert.match(text,/3행 · 직원 ID missing/);
});
test('request metadata detects whitespace title, missing targets and ambiguous field names',()=>{
  const req={...request([]),title:' ',fields:['시간',' 시간 ','',' '],deadline:''};
  const result=check(req,employees), kinds=new Set(result.issues.map(issue=>issue.kind));
  for(const kind of ['title','deadline','blank_field','duplicate_field','targets'])assert.ok(kinds.has(kind));
  assert.equal(result.settingsIssues,5);assert.equal(result.affectedRows,0);
  assert.ok(check({...req,fields:[]},employees).issues.some(issue=>issue.kind==='fields'));
});
test('deadline is strict calendar date, including leap year and format boundaries',()=>{
  for(const deadline of ['', '2026-02-29','2026-02-30','2026-13-01','2026-1-02','2026-10-01T00:00',' 2026-10-01'])
    assert.ok(check({...request(),deadline},employees).issues.some(issue=>issue.kind==='deadline'),deadline);
  assert.equal(check({...request(),deadline:'2024-02-29'},employees).ready,true);
});
test('blank and ambiguous employee identifiers require directory repair',()=>{
  assert.ok(check(request([row('')]),employees).issues.some(issue=>issue.kind==='employee'));
  const result=check(request(),[...employees,{...employees[0],name:'동일ID'}]);
  assert.equal(result.affectedRows,1);assert.ok(result.issues.some(issue=>issue.kind==='employee'));
  assert.ok(check(request(),[{...employees[0],name:' '}]).issues.some(issue=>issue.kind==='employee'));
});
test('minimal report excludes all submitted values and review notes',()=>{
  const text=report(request([row('a','submitted'),row('b','approved',{'교육명':'','시간':'SECRET_ACTUAL_VALUE'})]),employees);
  for(const secret of ['PRIVATE_VALUE','PRIVATE_REVIEW_NOTE','SECRET_ACTUAL_VALUE'])assert.ok(!text.includes(secret));
  for(const needed of ['request-proof','확인 완료인데 필수 항목 미입력','교육명','인원 수가 아닙니다','2행 · 직원 ID b'])assert.ok(text.includes(needed));
});
test('editing a duplicate target updates only its original row index and rejects invalid indexes',()=>{
  const req=request([row('a','pending'),row('b'),row('a','revision')]);
  const edited={...req.rows[2],state:'submitted',values:{교육명:'edited',시간:'2'}};
  const result=updateRequestRow(req,2,edited);
  assert.equal(result.rows[2],edited);assert.equal(result.rows[0],req.rows[0]);assert.equal(result.rows[1],req.rows[1]);
  assert.equal(req.rows[2].state,'revision');
  for(const index of [-1,3,0.5,NaN])assert.equal(updateRequestRow(req,index,edited),req);
});
test('approved but blank imported rows remain actionable in the request queue',()=>{
  const req=request([row('a','approved',{})]);
  const queue=requestQueue([req],'2026-10-20');
  assert.equal(queue.length,1);assert.equal(queue[0].active,1);assert.equal(queue[0].missing,1);
  assert.match(queue[0].next,/누락/);
  const inherited={...req,fields:['constructor','toString']};
  assert.equal(check(inherited,employees).issues.find(issue=>issue.kind==='approved_missing').detail,'입력이 필요한 항목: constructor / toString');
  assert.equal(requestQueue([inherited],'2026-10-20')[0].missing,1);
});

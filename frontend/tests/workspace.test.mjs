import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/workspace-store.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const context = { exports: {}, localStorage: { getItem: () => "{broken" } };
vm.runInNewContext(compiled, context);
const { validWorkspace, emptyWorkspace, loadWorkspace, csvCell, rowIssues } =
  context.exports;
assert.equal(validWorkspace(emptyWorkspace), true);
assert.equal(loadWorkspace().employees.length, 0);
assert.equal(
  validWorkspace({ ...emptyWorkspace, employees: [{ id: "1", name: "test" }] }),
  false,
);
assert.equal(
  validWorkspace({ ...emptyWorkspace, requests: [{ id: "r" }] }),
  false,
);
assert.equal(
  validWorkspace({
    ...emptyWorkspace,
    works: [
      {
        id: "w",
        title: "test",
        category: "education",
        deadline: "",
        owner: "",
        repeat: "없음",
        checks: ["check"],
        done: [],
      },
    ],
  }),
  false,
);
assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
assert.equal(csvCell(" @SUM(1)"), '"\' @SUM(1)"');
assert.equal(csvCell("a,b"), '"a,b"');
assert.equal(
  rowIssues({ values: { 과정명: "교육", 시간: " " } }, ["과정명", "시간"]).join(
    ",",
  ),
  "시간 미입력",
);
console.log(
  "Workspace: corrupt storage, invalid backup, checklist consistency, CSV injection, missing fields passed.",
);
const {followupTargets, buildFollowupText, followupFingerprint} = context.exports;
const req = {id:"r",title:"교육자료",category:"education",deadline:"2026-10-30",reference:"교육-1",created:"",fields:["과정명","시간"],rows:[
{employeeId:"a",state:"pending",values:{과정명:"작성",시간:" "},note:""},
{employeeId:"b",state:"submitted",values:{과정명:"민감한 값",시간:""},note:""},
{employeeId:"c",state:"revision",values:{과정명:"교육",시간:"3"},note:"증빙 일자 확인"},
{employeeId:"d",state:"approved",values:{},note:""},
{employeeId:"e",state:"submitted",values:{과정명:"교육",시간:"3"},note:""}]};
const emps=[{id:"a",name:"가직원",team:"1팀"}];
assert.equal(followupTargets(req,"all").length,3);
assert.equal(followupTargets(req,"pending").length,1);
assert.equal(followupTargets(req,"missing").length,2);
assert.equal(followupTargets(req,"revision").length,1);
assert.ok(!followupTargets(req,"all").some(r=>r.employeeId==="d"));
const txt=buildFollowupText(req,emps,"all");
for(const text of ["가직원 (1팀)","시간 미입력","2026-10-30","증빙 일자 확인"]) assert.ok(txt.includes(text));
for(const text of ["과정명 미입력","민감한 값"]) assert.ok(!txt.includes(text));
assert.equal(buildFollowupText({...req,rows:[]},emps,"all"),"");
assert.ok(buildFollowupText({...req,deadline:" "},emps,"all").includes("미입력 · 안내 전 확인 필요"));
assert.notEqual(followupFingerprint(req,emps),followupFingerprint({...req,deadline:"new"},emps));
assert.notEqual(followupFingerprint(req,emps),followupFingerprint(req,[]));
const ui=readFileSync(new URL("../src/request-followup.tsx",import.meta.url),"utf8");
assert.ok(ui.includes('"text/plain;charset=utf-8"'));
assert.ok(ui.includes('"-후속안내.txt"'));
assert.ok(ui.includes('disabled={stale || !draft.trim()}'));
console.log("Follow-up: 18 checks passed.");

const {requestQueue, requestQueueCsv, validQueueDate}=context.exports;
assert.equal(validQueueDate('2026-02-29'),false);
assert.equal(validQueueDate('2024-02-29'),true);
assert.equal(validQueueDate('2026-10-16T10:00'),false);
const queueRequest=(id,deadline,rows)=>({id,title:id,deadline,fields:['항목'],rows});
const queueRow=(state,filled=true)=>({employeeId:'synthetic',state,note:'private-note',values:filled?{'항목':'PRIVATE_VALUE'}:{}});
const queueInput=[queueRequest('future','2026-10-20',[queueRow('pending')]),queueRequest('done','2026-10-01',[queueRow('approved',false)]),queueRequest('invalid','2026-02-30',[queueRow('submitted')]),queueRequest('today','2026-10-16',[queueRow('submitted',false),queueRow('revision')]),queueRequest('late','2026-10-10',[queueRow('submitted')]),queueRequest('unassigned','',[])];
const queueBefore=JSON.stringify(queueInput);
const queueResult=requestQueue(queueInput,'2026-10-16');
assert.equal(queueResult.map(x=>x.id).join(','),'late,today,unassigned,invalid,future');
assert.equal(queueResult.find(x=>x.id==='today').missing,1);
assert.equal(queueResult.find(x=>x.id==='today').review,0);
assert.equal(queueResult.find(x=>x.id==='late').review,1);
assert.equal(queueResult.find(x=>x.id==='unassigned').unassigned,true);
assert.equal(queueResult.find(x=>x.id==='invalid').timing,'unknown');
assert.equal(requestQueue(queueInput,'bad').length,0);
assert.equal(JSON.stringify(queueInput),queueBefore);
const queueExport=requestQueueCsv([...queueInput,queueRequest('=unsafe','',[queueRow('pending')])],'2026-10-16');
assert.ok(queueExport.includes("'=unsafe"));
assert.ok(!queueExport.includes('PRIVATE_VALUE'));
assert.ok(!queueExport.includes('private-note'));
queueInput[4].rows[0].state='approved';
assert.ok(!requestQueue(queueInput,'2026-10-16').some(x=>x.id==='late'));
console.log('request queue date/state/sort/CSV privacy and formula checks passed');

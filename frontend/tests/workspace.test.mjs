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

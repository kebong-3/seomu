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

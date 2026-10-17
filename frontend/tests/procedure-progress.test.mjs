import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file){const context={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/${file}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
const {sampleProcedure:p}=load('procedures');
const {emptyProgress,parseProgress,currentRecord,procedureSnapshot,persistProgress,procedureRecordText,progressKey}=load('procedure-progress');
const second={...p,id:'second',title:'다른 절차'};
const record={snapshot:procedureSnapshot(p),checks:[0,2],note:'10월 교육자료'};
let raw=null;
const storage={setItem(key,value){assert.equal(key,progressKey);raw=value;}};
const progress={...emptyProgress(),selected:p.id,records:{[p.id]:record,[second.id]:{snapshot:procedureSnapshot(second),checks:[1],note:'두 번째 건'}}};
assert.equal(persistProgress(storage,progress),true);
const restored=parseProgress(raw);
assert.equal(restored.selected,p.id);
assert.deepEqual(Array.from(currentRecord(p,restored.records[p.id]).checks),[0,2]);
assert.deepEqual(Array.from(currentRecord(second,restored.records[second.id]).checks),[1]);
assert.equal(currentRecord(p,restored.records[p.id]).note,'10월 교육자료');
for(const patch of [{source:'새 문서'},{version:'v2'},{text:p.text+' 변경'},{steps:[...p.steps].reverse()},{institution:'다른 기관'}]){
 const changed={...p,...patch};
 assert.equal(currentRecord(changed,record).stale,true);
 assert.equal(currentRecord(changed,record).checks.length,0);
 assert.equal(procedureRecordText(changed,record).includes('[처리 확인]'),false);
}
const reset={snapshot:procedureSnapshot(p),checks:[],note:''};
assert.equal(currentRecord(p,reset).stale,false);
assert.equal(currentRecord(p,reset).checks.length,0);
assert.match(procedureRecordText(p,record),/\[처리 확인\] 1\./);
for(const bad of ['{',JSON.stringify({...progress,version:2}),JSON.stringify({...progress,records:[]}),JSON.stringify({...progress,records:{x:{...record,checks:[-1]}}}),JSON.stringify({...progress,records:{x:{...record,checks:[30]}}}),JSON.stringify({...progress,records:{x:{...record,checks:[0,0]}}}),JSON.stringify({...progress,records:{x:{...record,note:'x'.repeat(1001)}}})])assert.throws(()=>parseProgress(bad));
assert.equal(currentRecord(p,{...record,checks:[29]}).checks.length,0);
assert.equal(persistProgress({setItem(){throw Error('quota');}},progress),false);
assert.equal(persistProgress({setItem(){throw Error('should not write invalid data');}},{...progress,version:2}),false);
assert.equal(persistProgress({setItem(){assert.fail('oversized snapshot must not be written');}},{...progress,records:{x:{...record,snapshot:'x'.repeat(500001)}}}),false);
assert.equal(parseProgress(null).selected,'');
console.log('Procedure progress: restoration, isolated procedures, changed basis, fresh case, stale export, corrupt storage, invalid indices, quota failure passed');

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../src/api.ts',import.meta.url),'utf8').replace('import.meta.env.VITE_API_BASE',"''");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{},Headers,FormData,localStorage:{getItem:()=>''},sessionStorage:{getItem:()=> 'test-key'}};
vm.runInNewContext(compiled,context);
context.fetch=async(_url,options)=>{
  assert.equal(options.headers.get('X-Seomu-Key'),'test-key');
  return new Response(JSON.stringify({version:'0.2.0'}),{headers:{'Content-Type':'application/json'}});
};
assert.equal((await context.exports.api('/api/status')).version,'0.2.0');
context.fetch=async()=>new Response('<html>Vercel 404</html>',{status:404,headers:{'Content-Type':'text/html'}});
await assert.rejects(context.exports.api('/api/status'),/문서 서버/);
context.fetch=async()=>new Response('<html>SPA fallback</html>',{headers:{'Content-Type':'text/html'}});
await assert.rejects(context.exports.api('/api/status'),/문서 서버/);
context.fetch=async()=>{throw new TypeError('Failed to fetch');};
await assert.rejects(context.exports.api('/api/status'),/서버에 연결할 수 없습니다/);
context.fetch=async()=>new Response(JSON.stringify({detail:'연결 키를 확인해 주세요.'}),{status:401,headers:{'Content-Type':'application/json'}});
await assert.rejects(context.exports.api('/api/status'),/연결 키를 확인/);
console.log('API: JSON success, HTML 404, HTML fallback, network failure, authentication failure passed.');

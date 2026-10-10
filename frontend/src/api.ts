/// <reference types="vite/client" />
export function base(){return (localStorage.getItem('seomu-api') || import.meta.env.VITE_API_BASE || '').replace(/\/$/,'')}
export function key(){return sessionStorage.getItem('seomu-key')||''}
export async function api<T>(path:string, options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers);headers.set('X-Seomu-Key',key());
  if(options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json');
  let response:Response;
  try{response=await fetch(base()+path,{...options,headers});}
  catch{throw new Error('서버에 연결할 수 없습니다. 서버 주소와 실행 상태, 접속 허용 설정을 확인해 주세요.');}
  if(!response.headers.get('Content-Type')?.includes('application/json')){
    throw new Error('문서 서버의 응답을 받지 못했습니다. 별도로 실행한 문서 서버 주소를 입력해 주세요.');
  }
  if(!response.ok){const j=await response.json().catch(()=>({detail:'서버 연결을 확인해 주세요.'}));throw new Error(typeof j.detail==='string'?j.detail:'요청 내용을 확인해 주세요.');}
  return response.json() as Promise<T>;
}
export async function download(path:string,name:string){
  const response=await fetch(base()+path,{headers:{'X-Seomu-Key':key()}});if(!response.ok)throw new Error('파일 다운로드에 실패했습니다.');
  const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

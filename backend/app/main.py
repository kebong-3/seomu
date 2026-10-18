import csv
import hmac
import io
import json
import shutil
import subprocess
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from .config import Settings, SUPPORTED
from .service import Service, clean_path, now
from .retrieval import search, deadline_proposals
from .assistant import answer
from .model_provider import provider_options
from .request_draft import draft_request
from .procedure_assistant import draft_procedure, analyze_situation


class Question(BaseModel):
    question: str = Field(min_length=2, max_length=1200)
    folder: str = Field(default='',max_length=1000)
    provider: str = Field(default='default',pattern='^(default|evidence|gemma|gpt|compatible)$')


class Task(BaseModel):
    title: str = Field(min_length=1,max_length=300)
    deadline: str = ''
    owner: str = Field(default='',max_length=100)
    source_id: str | None = None
    source_version: int | None = None
    source_locator: str = Field(default='',max_length=300)
    confirmed: bool = False


class Scan(BaseModel):
    root: str


class TaskState(BaseModel):
    status: str


class DraftRequest(BaseModel):
    provider: str = Field(pattern='^(gemma|gpt|compatible)$')


class ProcedureDraft(DraftRequest):
    text: str = Field(min_length=10, max_length=24000)
    source: str = Field(min_length=1, max_length=1000)
    version: str = Field(min_length=1, max_length=1000)
    institution: str = Field(min_length=1, max_length=1000)


class SituationOption(BaseModel):
    value: str = Field(pattern='^[a-z][a-z0-9_]{0,59}$')
    label: str = Field(min_length=1, max_length=200)


class SituationQuestion(BaseModel):
    id: str = Field(pattern='^[a-z][a-z0-9_]{0,59}$')
    label: str = Field(min_length=1, max_length=300)
    options: list[SituationOption] = Field(min_length=2, max_length=6)


class SituationRequest(DraftRequest):
    situation: str = Field(min_length=2, max_length=4000)
    questions: list[SituationQuestion] = Field(max_length=8)


def create_app(settings=None):
    settings=settings or Settings()
    service=Service(settings)

    @asynccontextmanager
    async def lifespan(app):
        service.start()
        yield
        service.close()

    app=FastAPI(title='서무비서 Document Workspace',version='0.2.0',lifespan=lifespan)
    app.state.service=service
    app.add_middleware(CORSMiddleware,allow_origins=settings.origins,allow_methods=['GET','POST','PATCH','DELETE'],allow_headers=['Content-Type','X-Seomu-Key'])

    def authenticated(x_seomu_key: Annotated[str | None,Header()]=None):
        if not x_seomu_key or not hmac.compare_digest(x_seomu_key,settings.api_token):
            raise HTTPException(401,'연결 키를 확인해 주세요.')

    auth=[Depends(authenticated)]

    @app.exception_handler(ValueError)
    async def value_error(request,exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=400,content={'detail':str(exc)})

    @app.exception_handler(KeyError)
    async def missing(request,exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404,content={'detail':str(exc).strip("'")})

    @app.get('/health')
    def health():
        return {'status':'ok','version':'0.2.0'}

    @app.get('/api/status',dependencies=auth)
    def status():
        langs=[]
        if shutil.which('tesseract'):
            try:
                langs=subprocess.run(['tesseract','--list-langs'],capture_output=True,text=True,timeout=10).stdout.splitlines()[1:]
            except Exception:
                pass
        import importlib.util
        return {'version':'0.2.0','parser':settings.parser,'ocr_available':bool(shutil.which('tesseract')),
                'ocr_languages':langs,'ocr_config':settings.ocr_languages,'pdf_ocr_available':bool(shutil.which('pdftoppm')),
                'hwp_available':bool(importlib.util.find_spec('hwp_hwpx_parser')),
                'docling_available':bool(importlib.util.find_spec('docling')),
                'semantic_configured':bool(settings.embedding_path),'semantic_error':service.embedding_error,
                'ai_configured':any(p['configured'] for p in provider_options(settings) if p['id']!='evidence'),
                'ai_providers':provider_options(settings),
                'roots':list(settings.roots),'formats':sorted(SUPPORTED),'max_file_mb':30,'max_batch_mb':200,'max_files':500,
                'workspace':'single-private-workspace'}

    @app.get('/api/documents',dependencies=auth)
    def documents():
        return service.document_list()

    @app.get('/api/documents/{doc_id}',dependencies=auth)
    def document(doc_id):
        return service.detail(doc_id)

    @app.get('/api/documents/{doc_id}/original',dependencies=auth)
    def original(doc_id):
        rows=service.db.rows('SELECT stored_path,name FROM documents WHERE id=?',(doc_id,))
        if not rows:
            raise KeyError('문서가 없습니다.')
        return FileResponse(rows[0]['stored_path'],filename=rows[0]['name'],media_type='application/octet-stream')

    @app.delete('/api/documents/{doc_id}',dependencies=auth)
    def delete(doc_id):
        service.delete(doc_id)
        return {'deleted':True}

    @app.post('/api/documents/{doc_id}/reprocess',dependencies=auth)
    def reprocess(doc_id):
        return {'job_id':service.reprocess(doc_id)}

    @app.post('/api/imports',dependencies=auth)
    async def imports(files: Annotated[list[UploadFile],File()], paths: Annotated[str,Form()]='[]'):
        try:
            rels=json.loads(paths)
        except Exception:
            raise ValueError('파일 경로 목록이 올바르지 않습니다.')
        if not isinstance(rels,list) or len(files)>settings.max_files or (rels and len(rels)!=len(files)):
            raise ValueError('파일 수 또는 폴더 경로 수를 확인해 주세요.')
        staged=[]; total=0
        try:
            for i,f in enumerate(files):
                rel=clean_path(rels[i] if rels else f.filename or 'document')
                chunks=[]; size=0
                while data:=await f.read(1024*1024):
                    size+=len(data); total+=len(data)
                    if size>settings.max_file_bytes or total>settings.max_batch_bytes:
                        raise ValueError('가져오기 제한(파일당 30MB / 전체 200MB)을 넘었습니다.')
                    chunks.append(data)
                data=b''.join(chunks)
                if Path(rel).suffix.lower()=='.zip':
                    staged.extend(service.zip_files(data,rel.rsplit('.',1)[0]))
                else:
                    staged.append(service.stage_bytes(rel,data))
                if len(staged)>settings.max_files or sum(p.stat().st_size for _,p in staged)>settings.max_batch_bytes:
                    raise ValueError('압축 해제 후 파일 수 또는 전체 크기가 제한을 넘었습니다.')
            if len({p for p,_ in staged})!=len(staged):
                raise ValueError('같은 경로의 파일이 중복되었습니다. 파일명을 구분해 주세요.')
            return {'job_id':service.queue(staged)}
        except Exception:
            for _,p in staged:
                p.unlink(missing_ok=True)
            raise
        finally:
            for f in files:
                await f.close()

    @app.get('/api/imports',dependencies=auth)
    def jobs():
        return service.db.rows('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 15')

    @app.get('/api/imports/{job_id}',dependencies=auth)
    def job(job_id):
        return service.job(job_id)

    @app.post('/api/local-scan',dependencies=auth)
    def scan(body:Scan):
        return {'job_id':service.scan(body.root)}

    @app.post('/api/demo',dependencies=auth)
    def demo():
        sample_dir=Path(__file__).parents[2]/'sample-documents'
        files=[service.stage_bytes('샘플/'+p.relative_to(sample_dir).as_posix(),p.read_bytes()) for p in sorted(sample_dir.rglob('*')) if p.is_file() and p.suffix.lower() in SUPPORTED]
        if not files:
            raise ValueError('샘플 문서가 없습니다. sample-documents 폴더를 함께 배포해 주세요.')
        return {'job_id':service.queue(files)}

    @app.get('/api/search',dependencies=auth)
    def find(q:str=Query(min_length=2,max_length=1200),folder:str='',limit:int=Query(default=12,ge=1,le=30)):
        return search(service,q,folder,limit)

    @app.post('/api/ask',dependencies=auth)
    def ask(body:Question):
        return answer(service,body.question,body.folder,provider_id=body.provider)

    @app.get('/api/documents/{doc_id}/task-proposal',dependencies=auth)
    def propose(doc_id):
        return deadline_proposals(service.detail(doc_id))

    @app.post('/api/documents/{doc_id}/request-draft',dependencies=auth)
    def request_draft(doc_id, body:DraftRequest):
        return draft_request(service,doc_id,body.provider)

    @app.post('/api/procedures/draft', dependencies=auth)
    def procedure_draft(body:ProcedureDraft):
        return draft_procedure(settings, body)

    @app.post('/api/procedures/situation', dependencies=auth)
    def procedure_situation(body:SituationRequest):
        return analyze_situation(settings, body)

    @app.get('/api/tasks',dependencies=auth)
    def tasks():
        return service.db.rows('''SELECT t.*,d.name AS source_name,d.version AS current_source_version FROM tasks t
          LEFT JOIN documents d ON d.id=t.source_id ORDER BY t.status,CASE WHEN t.deadline='' THEN 1 ELSE 0 END,t.deadline,t.created_at DESC''')

    @app.post('/api/tasks',dependencies=auth)
    def create_task(body:Task):
        if not body.confirmed:
            raise ValueError('원문과 기한을 확인한 후 저장해 주세요.')
        if body.deadline:
            from datetime import date
            date.fromisoformat(body.deadline)
        if body.source_id:
            d=service.detail(body.source_id)
            if d['version']!=body.source_version:
                raise ValueError('원문 버전이 바뀌었습니다. 최신 문서를 다시 확인해 주세요.')
        task_id=uuid.uuid4().hex
        with service.db.connect() as c:
            c.execute('INSERT INTO tasks(id,title,deadline,owner,source_id,source_version,source_locator,created_at) VALUES(?,?,?,?,?,?,?,?)',
                      (task_id,body.title,body.deadline,body.owner,body.source_id,body.source_version,body.source_locator,now()))
        return {'id':task_id}

    @app.patch('/api/tasks/{task_id}',dependencies=auth)
    def task_status(task_id,body:TaskState):
        if body.status not in {'todo','doing','done'}:
            raise ValueError('업무 상태가 올바르지 않습니다.')
        with service.db.connect() as c:
            cursor=c.execute('UPDATE tasks SET status=? WHERE id=?',(body.status,task_id))
            if not cursor.rowcount:
                raise KeyError('업무가 없습니다.')
        return {'updated':True}

    @app.get('/api/export/documents.csv',dependencies=auth)
    def export():
        buffer=io.StringIO(); writer=csv.writer(buffer)
        writer.writerow(['폴더 경로','버전','인식 상태','인식기','추출 블록','문자 수','보완 사항'])
        for d in service.document_list():
            row=[d['path'],d['version'],d['status'],d['engine'],d['block_count'],d['char_count'],' / '.join(d['warnings'])]
            writer.writerow(["'"+v if isinstance(v,str) and v.startswith(('=','+','-','@','\t','\r')) else v for v in row])
        return StreamingResponse(iter(['\ufeff'+buffer.getvalue()]),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="seomu-documents.csv"'})

    dist=Path(__file__).parents[2]/'frontend'/'dist'
    if dist.is_dir():
        app.mount('/',StaticFiles(directory=dist,html=True),name='frontend')
    return app


app=create_app()

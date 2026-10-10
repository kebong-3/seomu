import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from .config import SUPPORTED
from .db import Database


def now():
    return datetime.now(timezone.utc).isoformat()


def clean_path(raw):
    raw = raw.replace('\\', '/')
    p = PurePosixPath(raw)
    if not raw or raw.startswith('/') or re.match(r'^[A-Za-z]:',raw) or any(x in {'..', '.'} for x in raw.split('/')) or '\x00' in raw:
        raise ValueError('안전하지 않은 폴더 경로입니다.')
    if len(raw)>1000 or any(ord(c)<32 for c in raw):
        raise ValueError('파일 경로가 너무 길거나 유효하지 않습니다.')
    return str(p)


class Service:
    def __init__(self, settings):
        self.settings = settings
        self.db = Database(settings.data_dir / 'seomu.db')
        self.stop = threading.Event()
        self.wake = threading.Event()
        self.thread = None
        self.embedding = None
        self.embedding_error = ''
        self.lock_file = None

    def start(self):
        # Only one parser worker owns a data directory. The CLI may enqueue to
        # the same local database while the API process owns this lock.
        handle=open(self.settings.data_dir/'worker.lock','a+b')
        try:
            if os.name=='nt':
                import msvcrt
                handle.seek(0); handle.write(b'0'); handle.flush(); handle.seek(0)
                msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError:
            handle.close()
            return
        self.lock_file=handle
        with self.db.connect() as c:
            c.execute("UPDATE job_items SET state='queued' WHERE state='processing'")
            c.execute("UPDATE jobs SET state='queued' WHERE state='processing'")
        def owned_work():
            try:
                self.work()
            finally:
                self.lock_file.close()
                self.lock_file=None
        self.thread = threading.Thread(target=owned_work, daemon=True)
        self.thread.start()

    def close(self):
        self.stop.set(); self.wake.set()
        if self.thread:
            self.thread.join(timeout=2)

    def queue(self, files):
        if not files:
            raise ValueError('가져올 파일이 없습니다.')
        if len(files)>self.settings.max_files:
            raise ValueError('한 번에 최대 500개 파일을 가져올 수 있습니다.')
        job_id = uuid.uuid4().hex
        with self.db.connect() as c:
            c.execute('INSERT INTO jobs(id,state,total,created_at) VALUES(?,?,?,?)', (job_id,'queued',len(files),now()))
            c.executemany('INSERT INTO job_items(job_id,path,staged_path) VALUES(?,?,?)', [(job_id,clean_path(path),str(staged)) for path,staged in files])
        self.wake.set()
        return job_id

    def stage_bytes(self, path, data):
        path = clean_path(path)
        if len(data)>self.settings.max_file_bytes:
            raise ValueError('파일이 30MB 제한을 넘었습니다.')
        target = self.settings.data_dir/'staging'/(uuid.uuid4().hex+Path(path).suffix.lower())
        target.write_bytes(data)
        return path,target

    def zip_files(self, data, prefix):
        import io
        files=[]
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            infos = z.infolist()
            if len(infos)>self.settings.max_files or sum(i.file_size for i in infos)>self.settings.max_batch_bytes:
                raise ValueError('ZIP의 항목 수 또는 압축 해제 크기가 제한을 넘었습니다.')
            # Validate the entire archive before writing any item. No filesystem extraction.
            for info in infos:
                clean_path(info.filename.rstrip('/'))
                if (info.external_attr>>16)&0o170000 == 0o120000:
                    raise ValueError('ZIP 심볼릭 링크는 가져올 수 없습니다.')
                if info.file_size>self.settings.max_file_bytes:
                    raise ValueError('ZIP 안의 파일이 30MB 제한을 넘었습니다.')
            try:
                for info in infos:
                    if info.is_dir() or '__MACOSX/' in info.filename or info.filename.split('/')[-1].startswith('.'):
                        continue
                    path = f'{prefix}/{info.filename}'
                    files.append(self.stage_bytes(path,z.read(info)))
            except Exception:
                for _,p in files:
                    p.unlink(missing_ok=True)
                raise
        return files

    def scan(self, root_name):
        if root_name not in self.settings.roots:
            raise ValueError('서버에서 등록한 폴더만 가져올 수 있습니다.')
        root = Path(self.settings.roots[root_name]).resolve()
        if not root.is_dir():
            raise ValueError('등록 폴더가 없거나 접근할 수 없습니다.')
        files, total = [],0
        try:
            for dirpath, dirs, names in os.walk(root, followlinks=False):
                dirs[:] = [d for d in sorted(dirs) if not d.startswith('.') and not (Path(dirpath)/d).is_symlink()]
                for name in sorted(names):
                    source=Path(dirpath)/name
                    if name.startswith(('.', '~$')) or source.is_symlink() or source.suffix.lower() not in SUPPORTED:
                        continue
                    if not source.resolve().is_relative_to(root):
                        continue
                    size=source.stat().st_size
                    total+=size
                    if size>self.settings.max_file_bytes or total>self.settings.max_batch_bytes or len(files)>=self.settings.max_files:
                        raise ValueError('폴더 가져오기 제한(500개 / 200MB / 파일당 30MB)을 넘었습니다. 하위 폴더로 나누어 주세요.')
                    # Files are copied before enqueueing. Source files are never edited.
                    files.append(self.stage_bytes(f'{root_name}/{source.relative_to(root).as_posix()}',source.read_bytes()))
            return self.queue(files)
        except Exception:
            for _,p in files:
                p.unlink(missing_ok=True)
            raise

    def work(self):
        while not self.stop.is_set():
            items=self.db.rows("SELECT * FROM job_items WHERE state='queued' ORDER BY id LIMIT 1")
            if not items:
                self.wake.wait(1); self.wake.clear(); continue
            item=items[0]
            with self.db.connect() as c:
                c.execute("UPDATE job_items SET state='processing' WHERE id=?",(item['id'],))
                c.execute("UPDATE jobs SET state='processing' WHERE id=?",(item['job_id'],))
            try:
                doc_id,state,msg=self.ingest(item['path'],Path(item['staged_path']))
            except Exception as e:
                doc_id,state,msg=None,'failed',str(e)[:400]
            with self.db.connect() as c:
                c.execute('UPDATE job_items SET state=?,message=?,document_id=? WHERE id=?',(state,msg,doc_id,item['id']))
                c.execute("UPDATE jobs SET done=(SELECT COUNT(*) FROM job_items WHERE job_id=? AND state NOT IN ('queued','processing')) WHERE id=?",(item['job_id'],item['job_id']))
                remaining=c.execute("SELECT COUNT(*) FROM job_items WHERE job_id=? AND state IN ('queued','processing')",(item['job_id'],)).fetchone()[0]
                if not remaining:
                    errors=c.execute("SELECT COUNT(*) FROM job_items WHERE job_id=? AND state IN ('failed','unsupported','needs_review')",(item['job_id'],)).fetchone()[0]
                    c.execute('UPDATE jobs SET state=? WHERE id=?',('completed_with_issues' if errors else 'completed',item['job_id']))
            Path(item['staged_path']).unlink(missing_ok=True)

    def parse_process(self, path):
        s=self.settings
        options={k:getattr(s,k) for k in ('parser','max_pages','max_blocks','ocr_languages')}
        r=subprocess.run([sys.executable,'-m','app.worker',str(path),json.dumps(options)],capture_output=True,text=True,timeout=360,cwd=Path(__file__).parent.parent)
        if r.returncode:
            message=r.stderr.strip().splitlines()[-1] if r.stderr.strip() else '문서를 읽을 수 없습니다.'
            # Parser messages only; don't expose traceback/system filesystem locations.
            if ': ' in message:
                message=message.split(': ',1)[1]
            raise ValueError(message[:400])
        return json.loads(r.stdout)

    def ingest(self, rel, staged, force=False):
        rel=clean_path(rel)
        size=staged.stat().st_size
        if size>self.settings.max_file_bytes:
            raise ValueError('파일이 30MB 제한을 넘었습니다.')
        digest=hashlib.sha256(staged.read_bytes()).hexdigest()
        existing=self.db.rows('SELECT * FROM documents WHERE path=?',(rel,))
        old=existing[0] if existing else None
        if old and old['hash']==digest and old['status'] in {'ready','needs_review'} and not force:
            return old['id'],'unchanged','내용 변경 없음'
        doc_id=old['id'] if old else uuid.uuid4().hex
        version=old['version']+(old['hash']!=digest) if old else 1
        dest=self.settings.data_dir/'originals'/(doc_id+Path(rel).suffix.lower())
        shutil.copyfile(staged,dest)
        status='ready'; msg='인식 완료'; engine=''; warnings=[]; blocks=[]
        if Path(rel).suffix.lower() not in SUPPORTED:
            status='unsupported'; warnings=['지원하지 않는 형식입니다. HWPX·PDF·XLSX 등으로 변환해 주세요.']
        else:
            try:
                result=self.parse_process(dest)
                blocks=result['blocks']; engine=result['engine']; warnings=result['warnings']
                if warnings:
                    status='needs_review'; msg='인식 완료 · 원본 확인 필요'
            except subprocess.TimeoutExpired:
                status='failed'; warnings=['문서 인식 시간 제한 초과. 파일을 나누거나 OCR 범위를 줄여 주세요.']
            except Exception as e:
                status='failed'; warnings=[str(e)[:400]]
        with self.db.connect() as c:
            c.execute('''INSERT INTO documents(id,path,name,hash,version,size,stored_path,status,engine,warnings,block_count,char_count,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET
            hash=excluded.hash,version=excluded.version,size=excluded.size,stored_path=excluded.stored_path,
            status=excluded.status,engine=excluded.engine,warnings=excluded.warnings,
            block_count=excluded.block_count,char_count=excluded.char_count,updated_at=excluded.updated_at''',
            (doc_id,rel,Path(rel).name,digest,version,size,str(dest),status,engine,json.dumps(warnings,ensure_ascii=False),len(blocks),sum(len(b['text']) for b in blocks),now()))
            c.execute('DELETE FROM blocks WHERE document_id=?',(doc_id,))
            c.executemany('INSERT INTO blocks(id,document_id,ordinal,locator,kind,text,cells) VALUES(?,?,?,?,?,?,?)',[(f'{doc_id}:{i}',doc_id,i,b['locator'],b['kind'],b['text'],json.dumps(b['cells'],ensure_ascii=False)) for i,b in enumerate(blocks)])
        if blocks and self.settings.embedding_path:
            try:
                model=self.embedding_model()
                vectors=model.encode([b['text'] for b in blocks],normalize_embeddings=True,batch_size=16)
                with self.db.connect() as c:
                    c.executemany('INSERT OR REPLACE INTO vectors VALUES(?,?,?)',[(f'{doc_id}:{i}',self.settings.embedding_path,json.dumps(v.tolist())) for i,v in enumerate(vectors)])
            except Exception as e:
                self.embedding_error=type(e).__name__
                warnings.append('로컬 의미검색 인덱싱 실패. 기본 키워드 검색은 사용 가능합니다.')
                status='needs_review'
                with self.db.connect() as c:
                    c.execute('UPDATE documents SET warnings=?,status=? WHERE id=?',(json.dumps(warnings,ensure_ascii=False),status,doc_id))
        return doc_id,status,msg if blocks else warnings[0]

    def embedding_model(self):
        if not self.embedding:
            from sentence_transformers import SentenceTransformer
            path=Path(self.settings.embedding_path)
            if not path.is_dir():
                raise ValueError('로컬 모델 폴더가 필요합니다.')
            self.embedding=SentenceTransformer(str(path),local_files_only=True,trust_remote_code=False)
        return self.embedding

    def document_list(self):
        rows=self.db.rows('SELECT id,path,name,hash,version,size,status,engine,warnings,block_count,char_count,updated_at FROM documents ORDER BY path')
        counts={}
        for d in rows:
            counts[d['hash']]=counts.get(d['hash'],0)+1
        for d in rows:
            d['warnings']=json.loads(d['warnings']); d['duplicate_count']=counts[d['hash']]
        return rows

    def detail(self,doc_id):
        rows=[d for d in self.document_list() if d['id']==doc_id]
        if not rows:
            raise KeyError('문서가 없습니다.')
        d=rows[0]
        d['blocks']=self.db.rows('SELECT id,ordinal,locator,kind,text,cells FROM blocks WHERE document_id=? ORDER BY ordinal',(doc_id,))
        for b in d['blocks']:
            b['cells']=json.loads(b['cells'])
        return d

    def job(self,job_id):
        rows=self.db.rows('SELECT * FROM jobs WHERE id=?',(job_id,))
        if not rows:
            raise KeyError('가져오기 기록이 없습니다.')
        return {**rows[0],'items':self.db.rows('SELECT path,state,message,document_id FROM job_items WHERE job_id=? ORDER BY id',(job_id,))}

    def reprocess(self,doc_id):
        rows=self.db.rows('SELECT path,stored_path FROM documents WHERE id=?',(doc_id,))
        if not rows:
            raise KeyError('문서가 없습니다.')
        old=rows[0]
        with self.db.connect() as c:
            # Queued reprocessing must not be silently skipped by checksum.
            c.execute("UPDATE documents SET status='pending' WHERE id=?",(doc_id,))
            c.execute('DELETE FROM blocks WHERE document_id=?',(doc_id,))
        return self.queue([self.stage_bytes(old['path'],Path(old['stored_path']).read_bytes())])

    def delete(self,doc_id):
        rows=self.db.rows('SELECT stored_path,path FROM documents WHERE id=?',(doc_id,))
        if not rows:
            raise KeyError('문서가 없습니다.')
        active=self.db.rows("SELECT id FROM job_items WHERE path=? AND state IN ('queued','processing')",(rows[0]['path'],))
        if active:
            raise ValueError('가져오기 작업이 진행 중입니다. 완료 후 삭제해 주세요.')
        with self.db.connect() as c:
            c.execute('DELETE FROM documents WHERE id=?',(doc_id,))
        Path(rows[0]['stored_path']).unlink(missing_ok=True)

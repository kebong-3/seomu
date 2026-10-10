"""Read-only folder connector. Re-scan checks content hashes; no cloud upload."""
import argparse
import time
from pathlib import Path
from .config import Settings
from .service import Service


def main():
    p=argparse.ArgumentParser(description='서무비서 로컬 폴더 연결')
    p.add_argument('command',choices=['scan','watch','token'])
    p.add_argument('--root')
    p.add_argument('--name',default='내문서')
    p.add_argument('--interval',type=int,default=30)
    args=p.parse_args()
    settings=Settings()
    if args.command=='token':
        print(settings.api_token)
        return
    if not args.root or not Path(args.root).is_dir():
        p.error('--root에 실제 문서 폴더를 지정해 주세요.')
    settings.roots={args.name:str(Path(args.root).resolve())}
    service=Service(settings)
    service.start()
    try:
        while True:
            job_id=service.scan(args.name)
            while service.job(job_id)['state'] not in {'completed','completed_with_issues'}:
                time.sleep(.5)
            job=service.job(job_id)
            print(f'{job["state"]}: {job["done"]}/{job["total"]}',flush=True)
            if args.command=='scan':
                break
            time.sleep(max(5,args.interval))
    except KeyboardInterrupt:
        pass
    finally:
        service.close()


if __name__=='__main__':
    main()

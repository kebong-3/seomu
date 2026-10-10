"""Korean bigram BM25 + exact term weights; optional local dense-vector RRF."""
import json
import math
import re
from collections import Counter


def terms(text):
    words=re.findall(r'[가-힣A-Za-z0-9]+',text.lower())
    out=[]
    for w in words:
        out.append(w)
        if re.search('[가-힣]',w):
            out.extend(w[i:i+2] for i in range(len(w)-1))
    return out


def search(service, query, folder='', limit=8):
    query=query.strip()
    if not query:
        return []
    rows=service.db.rows('''SELECT b.*,d.path,d.name,d.version,d.status FROM blocks b JOIN documents d ON d.id=b.document_id
       WHERE d.status IN ('ready','needs_review') AND (d.path=? OR substr(d.path,1,?)=?) ORDER BY d.path,b.ordinal LIMIT 50000''',
       (folder,len(folder)+1,folder+'/')) if folder else service.db.rows('''SELECT b.*,d.path,d.name,d.version,d.status FROM blocks b JOIN documents d ON d.id=b.document_id
       WHERE d.status IN ('ready','needs_review') ORDER BY d.path,b.ordinal LIMIT 50000''')
    if not rows:
        return []
    tokens=[Counter(terms(r['text']+' '+r['name'])) for r in rows]
    qterms=set(terms(query)); df=Counter()
    lengths=[sum(t.values()) for t in tokens]; avg=sum(lengths)/max(1,len(rows))
    for t in tokens:
        df.update(qterms.intersection(t.keys()))
    scores=[]
    full_words=re.findall(r'[가-힣A-Za-z0-9]+',query.lower())
    for i,t in enumerate(tokens):
        score=0.0
        for word in qterms:
            tf=t.get(word,0)
            if tf:
                idf=math.log(1+(len(rows)-df[word]+.5)/(df[word]+.5))
                score+=idf*tf*2.2/(tf+1.2*(.25+.75*lengths[i]/max(1,avg)))
        text=(rows[i]['text']+' '+rows[i]['path']).lower()
        score+=sum(2 for w in full_words if len(w)>=2 and w in text)
        if score>0:
            scores.append((i,score))
    scores.sort(key=lambda x:x[1],reverse=True)
    rank={i:1/(60+k) for k,(i,_) in enumerate(scores,1)}
    semantic=False
    if service.settings.embedding_path:
        try:
            model=service.embedding_model()
            q=model.encode(query,normalize_embeddings=True).tolist()
            vecs={v['block_id']:json.loads(v['vector']) for v in service.db.rows('SELECT * FROM vectors WHERE model=?',(service.settings.embedding_path,))}
            dense=[]
            for i,row in enumerate(rows):
                v=vecs.get(row['id'])
                if v and len(v)==len(q):
                    similarity=sum(a*b for a,b in zip(q,v))
                    if similarity>.25:
                        dense.append((i,similarity))
            dense.sort(key=lambda x:x[1],reverse=True)
            for k,(i,_) in enumerate(dense[:50],1):
                rank[i]=rank.get(i,0)+1/(60+k)
            semantic=bool(dense)
        except Exception:
            pass
    result=[]; seen=set()
    # De-duplicate identical content aliases and overlapping PDF text/table fragments.
    for i,score in sorted(rank.items(),key=lambda x:x[1],reverse=True):
        r=rows[i]
        signature=re.sub(r'\s','',r['text'])
        if signature in seen:
            continue
        seen.add(signature)
        result.append({k:r[k] for k in ('id','document_id','path','name','version','status','locator','text','kind')} | {'score':round(score,5),'method':'hybrid' if semantic else 'keyword'})
        if len(result)>=limit:
            break
    return result


def deadline_proposals(document):
    dates=[]; evidence=[]
    pattern=r'(20\d{2})\s*[.년/-]\s*(\d{1,2})\s*[.월/-]\s*(\d{1,2})'
    for b in document['blocks']:
        for m in re.finditer(pattern,b['text']):
            try:
                from datetime import date
                value=date(*map(int,m.groups())).isoformat()
            except ValueError:
                continue
            context=b['text'][max(0,m.start()-100):m.end()+80]
            explicit=bool(re.search(r'제출\s*기한|회신\s*기한|마감|까지\s*제출|제출하여',context))
            dates.append({'value':value,'explicit':explicit,'locator':b['locator'],'quote':context})
        if re.search(r'제출|회신|취합|안내|점검',b['text']):
            evidence.append({'locator':b['locator'],'text':b['text'][:1600]})
    candidates=sorted(set(d['value'] for d in dates if d['explicit']))
    return {'title':document['name'].rsplit('.',1)[0], 'deadline':candidates[0] if len(candidates)==1 else '',
            'date_candidates':dates,'evidence':evidence[:5],
            'warnings':(['서로 다른 기한 후보가 있습니다. 원문과 붙임을 확인하세요.'] if len(candidates)>1 else ['기한 후보를 원문과 확인한 후 저장하세요.'] if candidates else ['제출기한을 확정하지 못했습니다. 직접 확인하세요.']),
            'source_id':document['id'],'source_version':document['version'],'requires_confirmation':True}

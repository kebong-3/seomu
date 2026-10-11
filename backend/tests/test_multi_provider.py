import json
import httpx
import pytest
from app.config import Settings
from app.model_provider import get_provider, provider_options, ModelResult
from app.request_draft import validate_draft, draft_request
from app.main import create_app
from fastapi.testclient import TestClient


def settings(tmp_path):
    return Settings(data_dir=tmp_path/'data',api_token='test',openai_key='synthetic-openai',gemma_key='synthetic-google')


@pytest.mark.parametrize('provider_id', ['gpt', 'gemma'])
def test_each_provider_uses_only_its_own_endpoint_and_key(tmp_path, monkeypatch, provider_id):
    seen=[]
    def respond(request):
        seen.append(request)
        if provider_id=='gpt':
            assert str(request.url)=='https://api.openai.com/v1/responses'
            assert request.headers['authorization']=='Bearer synthetic-openai'
            assert 'x-goog-api-key' not in request.headers
            body=json.loads(request.content)
            assert body['store'] is False and 'temperature' not in body
            return httpx.Response(200,json={'status':'completed','output':[{'type':'reasoning','summary':[]},{'type':'message','role':'assistant','content':[{'type':'output_text','text':'공문을 확인하세요. [S1]'}]}]})
        assert request.url.host=='generativelanguage.googleapis.com'
        assert request.url.path.endswith(':generateContent') and not request.url.query
        assert request.headers['x-goog-api-key']=='synthetic-google'
        assert 'authorization' not in request.headers
        return httpx.Response(200,json={'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'숨겨진 추론','thought':True},{'text':'공문을 확인하세요. [S1]'}]}}]})
    real=httpx.Client
    monkeypatch.setattr(httpx,'Client',lambda **kwargs:real(transport=httpx.MockTransport(respond),**kwargs))
    result=get_provider(settings(tmp_path),provider_id).generate([{'role':'system','content':'지시'},{'role':'user','content':'공문'}])
    assert result.provider==provider_id and result.text=='공문을 확인하세요. [S1]'
    assert len(seen)==1


def test_status_does_not_expose_keys_and_evidence_mode_calls_no_ai(tmp_path):
    s=settings(tmp_path)
    assert get_provider(s,'evidence') is None
    serialized=json.dumps(provider_options(s))
    assert 'synthetic-' not in serialized
    assert all(p['configured'] for p in provider_options(s) if p['id'] in ('gpt','gemma'))
    s.openai_key=''
    with pytest.raises(ValueError):get_provider(s,'gpt')
    with pytest.raises(ValueError):get_provider(s,'http://attacker')


def proposal():
    return {'title':{'value':'교육자료 제출','source_id':'D1','quote':'교육자료를 제출하세요.'},
        'deadline':{'value':'2026-10-20','source_id':'D1','quote':'제출기한: 2026. 10. 20.'},
        'audience':None,'fields':[{'value':'교육시간','source_id':'D1','quote':'교육시간을 기입하세요.'}]}


blocks={'D1':{'text':'교육자료를 제출하세요. 제출기한: 2026. 10. 20. 교육시간을 기입하세요.','locator':'페이지 1'}}


def test_draft_validates_real_quotes_and_date():
    data=validate_draft(json.dumps(proposal()),blocks)
    assert data['deadline']['value']=='2026-10-20'
    assert data['fields'][0]['locator']=='페이지 1'
    bad=proposal();bad['deadline']['value']='2026-10-21'
    with pytest.raises(ValueError):validate_draft(json.dumps(bad),blocks)
    bad=proposal();bad['fields'][0]['quote']='문서에 없는 문장'
    with pytest.raises(ValueError):validate_draft(json.dumps(bad),blocks)
    bad=proposal();bad['title']['source_id']='D99'
    with pytest.raises(ValueError):validate_draft(json.dumps(bad),blocks)


def test_authenticated_endpoint_returns_draft_without_creating_tasks(tmp_path,monkeypatch):
    s=settings(tmp_path);app=create_app(s);service=app.state.service
    rel,p=service.stage_bytes('교육.txt',blocks['D1']['text'].encode());doc_id=service.ingest(rel,p)[0]
    class Provider:
        def generate(self,messages):return ModelResult(json.dumps(proposal()),'synthetic-model',1,'gemma')
    monkeypatch.setattr('app.request_draft.get_provider',lambda *args:Provider())
    with TestClient(app) as client:
        url=f'/api/documents/{doc_id}/request-draft'
        assert client.post(url,json={'provider':'gemma'}).status_code==401
        result=client.post(url,headers={'X-Seomu-Key':'test'},json={'provider':'gemma'})
        assert result.status_code==200 and result.json()['deadline']['value']=='2026-10-20'
        assert client.get('/api/tasks',headers={'X-Seomu-Key':'test'}).json()==[]
        assert client.post(url,headers={'X-Seomu-Key':'test'},json={'provider':'evidence'}).status_code==422


@pytest.mark.parametrize('provider_id', ['gpt','gemma'])
def test_incomplete_response_rejected_without_other_provider_call(tmp_path,monkeypatch,provider_id):
    calls=[]
    def respond(request):
        calls.append(request)
        return httpx.Response(200,json={'status':'incomplete','output':[]} if provider_id=='gpt' else {'candidates':[{'finishReason':'MAX_TOKENS','content':{'parts':[{'text':'partial'}]}}]})
    real=httpx.Client
    monkeypatch.setattr(httpx,'Client',lambda **kwargs:real(transport=httpx.MockTransport(respond),**kwargs))
    with pytest.raises(ValueError):get_provider(settings(tmp_path),provider_id).generate([{'role':'user','content':'test'}])
    assert len(calls)==1

import httpx
import pytest
from app.assistant import answer
from app.config import Settings
from app.service import Service


def service(tmp_path):
    s=Service(Settings(data_dir=tmp_path/'data',api_token='test',llm_url='http://model.invalid/v1',llm_model='test-model'))
    rel,p=s.stage_bytes('교육.txt','제출기한: 2026. 10. 20. 교육 이수현황표를 제출하여 주시기 바랍니다.'.encode())
    s.ingest(rel,p)
    return s


def test_unknown_model_citation_falls_back_to_real_evidence(tmp_path,monkeypatch):
    real_client=httpx.Client
    transport=httpx.MockTransport(lambda request:httpx.Response(200,json={'choices':[{'message':{'content':'없는 근거로 승인됨 [S99]'}}]}))
    monkeypatch.setattr(httpx,'Client',lambda **kwargs:real_client(transport=transport,**kwargs))
    result=answer(service(tmp_path),'교육 제출기한')
    assert result['mode']=='evidence'
    assert '[S99]' not in result['answer']
    assert result['evidence'][0]['path']=='교육.txt'


def test_connected_model_answer_preserves_resolvable_citations(tmp_path,monkeypatch):
    real_client=httpx.Client
    transport=httpx.MockTransport(lambda request:httpx.Response(200,json={'choices':[{'message':{'content':'교육 이수현황 제출기한은 2026년 10월 20일입니다. [S1]'}}]}))
    monkeypatch.setattr(httpx,'Client',lambda **kwargs:real_client(transport=transport,**kwargs))
    result=answer(service(tmp_path),'교육 제출기한')
    assert result['mode']=='ai' and result['evidence'][0]['citation']=='S1'


def test_model_transport_failure_keeps_keyword_search_available(tmp_path,monkeypatch):
    def fail(request):
        raise httpx.ConnectError('offline')
    real_client=httpx.Client
    monkeypatch.setattr(httpx,'Client',lambda **kwargs:real_client(transport=httpx.MockTransport(fail),**kwargs))
    result=answer(service(tmp_path),'교육 제출기한')
    assert result['mode']=='evidence' and '2026' in result['answer']


@pytest.mark.parametrize('content', [None, [], '', ' ' , 'x' * 20001])
def test_invalid_response_content_falls_back(tmp_path, monkeypatch, content):
    real_client = httpx.Client
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={'choices': [{'message': {'content': content}}]}))
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: real_client(transport=transport, **kwargs))
    result = answer(service(tmp_path), '교육 제출기한')
    assert result['mode'] == 'evidence'
    assert 'model_run' not in result


def test_provider_swap_uses_same_common_validation(tmp_path):
    from app.model_provider import ModelResult
    class Provider:
        def __init__(self, text): self.text = text
        def generate(self, messages):
            assert '<documents>' in messages[1]['content']
            return ModelResult(self.text, 'synthetic-adapter', 12, 'test-adapter')
    s = service(tmp_path)
    s.settings.llm_url = ''
    s.settings.llm_model = ''
    accepted = answer(s, '교육 제출기한', provider=Provider('제출기한을 확인하세요. [S1]'))
    rejected = answer(s, '교육 제출기한', provider=Provider('승인되었습니다. [S99]'))
    assert accepted['mode'] == 'ai'
    assert accepted['model_run'] == {'provider': 'test-adapter', 'model': 'synthetic-adapter', 'elapsed_ms': 12, 'citation_validation': 'passed'}
    assert rejected['mode'] == 'evidence'


def test_transport_preserves_configured_model_and_hides_connection_details(tmp_path, monkeypatch):
    real_client = httpx.Client
    requests = []
    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={'choices': [{'message': {'content': '기한을 확인하세요. [S1]'}}], 'model': 'untrusted-returned-model'})
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs))
    s = service(tmp_path)
    s.settings.llm_key = 'synthetic-key'
    result = answer(s, '교육 제출기한')
    import json
    assert json.loads(requests[0].content)['model'] == 'test-model'
    assert requests[0].headers['authorization'] == 'Bearer synthetic-key'
    assert result['model_run']['model'] == 'test-model'
    assert result['model_run']['elapsed_ms'] >= 0
    assert 'synthetic-key' not in json.dumps(result)
    assert 'model.invalid' not in json.dumps(result)

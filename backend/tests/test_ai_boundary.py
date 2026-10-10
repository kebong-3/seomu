import httpx
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

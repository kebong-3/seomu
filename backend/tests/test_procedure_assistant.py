import copy
import json
import pytest
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app
from app.model_provider import ModelResult
from app.procedure_assistant import validate_proposal, validate_facts

SOURCE = '공용차를 이용한 경우 차량 이용내역을 확인한다. 정산서는 종료 후 5일 이내 제출한다.'


def proposal():
    return {'title': '출장 정산', 'keywords': '출장 정산', 'questions': [
        {'id': 'vehicle', 'label': '공용차 이용 여부', 'quote': SOURCE.split('. ')[0],
         'options': [{'value': 'yes', 'label': '이용'}, {'value': 'no', 'label': '이용하지 않음'}]}],
        'steps': [{'action': '차량 이용내역 확인', 'deadline': '', 'form': '차량 이용내역',
                   'quote': SOURCE.split('. ')[0], 'condition': {'questionId': 'vehicle', 'value': 'yes'}},
                  {'action': '정산서 제출', 'deadline': '종료 후 5일 이내', 'form': '정산서',
                   'quote': '정산서는 종료 후 5일 이내 제출한다.', 'condition': None}]}


def test_proposal_requires_source_bound_deadline_form_and_condition():
    assert validate_proposal(json.dumps(proposal()), SOURCE)['steps'][1]['deadline'] == '종료 후 5일 이내'
    for field, value in [('quote', '없는 원문'), ('deadline', '2026-11-11'), ('form', '없는 서식')]:
        data = proposal(); data['steps'][1][field] = value
        with pytest.raises(ValueError): validate_proposal(json.dumps(data), SOURCE)
    data = proposal(); data['steps'][0]['condition']['value'] = 'unknown'
    with pytest.raises(ValueError): validate_proposal(json.dumps(data), SOURCE)
    data = proposal(); data['questions'][0]['id'] = 'constructor'
    with pytest.raises(ValueError): validate_proposal(json.dumps(data), SOURCE)
    data = proposal(); data['questions'].append(copy.deepcopy(data['questions'][0]))
    with pytest.raises(ValueError): validate_proposal(json.dumps(data), SOURCE)
    data = proposal(); data['steps'] = []
    with pytest.raises(ValueError): validate_proposal(json.dumps(data), SOURCE)


def test_facts_cannot_invent_option_or_situation_evidence():
    q = proposal()['questions']; situation = '공용차를 이용했어요.'
    fact = {'questionId': 'vehicle', 'value': 'yes', 'quote': '공용차를 이용했어요'}
    assert validate_facts(json.dumps({'facts': [fact]}), q, situation)['facts'] == [fact]
    for patch in [{'quote': '개인차 이용'}, {'value': 'other'}, {'questionId': 'missing'}]:
        with pytest.raises(ValueError): validate_facts(json.dumps({'facts': [{**fact, **patch}]}), q, situation)
    with pytest.raises(ValueError): validate_facts(json.dumps({'facts': [fact, fact]}), q, situation)
    assert validate_facts('{"facts":[]}', q, '교통수단을 아직 몰라요')['facts'] == []


@pytest.mark.parametrize('provider_id', ['gemma', 'gpt', 'compatible'])
def test_authenticated_api_proposal_and_situation_do_not_create_tasks(tmp_path, monkeypatch, provider_id):
    s = Settings(data_dir=tmp_path/'data', api_token='test')
    app = create_app(s); calls = []
    class Provider:
        def generate(self, messages):
            calls.append(messages)
            data = proposal() if len(calls) == 1 else {'facts': []}
            return ModelResult(json.dumps(data), 'synthetic-model', 1, provider_id)
    monkeypatch.setattr('app.procedure_assistant.get_provider', lambda settings, selected: Provider() if selected == provider_id else None)
    body = {'provider': provider_id, 'text': SOURCE, 'source': '합성 지침', 'version': '연습 v1', 'institution': '가상 기관'}
    with TestClient(app) as c:
        assert c.post('/api/procedures/draft', json=body).status_code == 401
        result = c.post('/api/procedures/draft', headers={'X-Seomu-Key': 'test'}, json=body)
        assert result.status_code == 200
        p = result.json()['procedure']
        assert p['text'] == SOURCE and p['institution'] == '가상 기관'
        assert result.json()['model_run']['provider'] == provider_id
        q = [{k: v for k, v in x.items() if k != 'quote'} for x in p['questions']]
        result = c.post('/api/procedures/situation', headers={'X-Seomu-Key': 'test'},
                        json={'provider': provider_id, 'situation': '출장 정산을 준비해요', 'questions': q})
        assert result.status_code == 200 and result.json()['facts'] == []
        assert c.get('/api/tasks', headers={'X-Seomu-Key': 'test'}).json() == []
        assert len(calls) == 2
        assert c.post('/api/procedures/draft', headers={'X-Seomu-Key': 'test'}, json={**body, 'text': 'x'*24001}).status_code == 422


def test_failure_does_not_leak_upstream_source_or_credentials(tmp_path, monkeypatch):
    app = create_app(Settings(data_dir=tmp_path/'data', api_token='test'))
    class Provider:
        def generate(self, messages): raise RuntimeError('secret-token-and-private-body')
    monkeypatch.setattr('app.procedure_assistant.get_provider', lambda *args: Provider())
    with TestClient(app) as c:
        r = c.post('/api/procedures/draft', headers={'X-Seomu-Key': 'test'}, json={
            'provider': 'gpt', 'text': SOURCE, 'source': '합성', 'version': 'v1', 'institution': '가상'})
        assert r.status_code == 400 and 'secret-token' not in r.text

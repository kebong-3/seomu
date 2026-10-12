import json
from app.model_eval import run_evaluation, date_matches
from app.model_provider import ModelResult


def test_mock_never_claims_two_model_completion(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'must-not-appear')
    monkeypatch.setenv('GEMINI_API_KEY', 'must-not-appear')
    def forbidden(*args, **kwargs):
        raise AssertionError('network forbidden')
    monkeypatch.setattr('httpx.Client', forbidden)
    report = run_evaluation()
    assert report['automated_checks_passed']
    assert report['status'] == 'mock_only'
    assert report['two_model_completion'] == 'unverified'
    assert all(r['execution'] == 'mock' and r['human_review_required'] for r in report['runs'])
    assert len({r['input_sha256'] for r in report['runs']}) == 1
    assert 'must-not-appear' not in json.dumps(report)


def test_bad_citation_falls_back_and_cannot_pass():
    class Invalid:
        def generate(self, messages):
            return ModelResult('2026-10-20 [S999]', 'synthetic', 0)
    report = run_evaluation(provider_factory=lambda _: Invalid())
    assert not report['automated_checks_passed']
    assert all(r['fallback'] and not r['major_date_match'] for r in report['runs'])


def test_conflicting_or_missing_dates_fail():
    assert date_matches('2026. 10. 20.')
    assert not date_matches('2026-10-20 또는 2026-10-21')
    assert not date_matches('확인 필요')
    class WrongDate:
        def generate(self, messages):
            return ModelResult('2026-10-21 성명 교육명 교육시간 [S1]', 'synthetic', 0)
    assert not run_evaluation(provider_factory=lambda _: WrongDate())['automated_checks_passed']


def test_live_missing_configuration_is_redacted(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    report = run_evaluation(live=True)
    assert report['status'] == 'live_incomplete'
    assert report['two_model_completion'] == 'unverified'
    assert all(r['failure'] == 'configuration_or_execution_failed' for r in report['runs'])


def test_provider_exception_content_is_never_recorded():
    def failing(_):
        raise RuntimeError('SECRET_TOKEN upstream-private-response')
    report = run_evaluation(provider_factory=failing)
    assert 'SECRET_TOKEN' not in json.dumps(report)
    assert all(r['failure'] == 'configuration_or_execution_failed' for r in report['runs'])


def test_mock_completes_both_representative_flows():
    report = run_evaluation()
    assert report['schema_version'] == 2
    assert all(set(r['flows']) == {'answer', 'draft_request'} for r in report['runs'])
    assert all(all(f['passed'] for f in r['flows'].values()) for r in report['runs'])


import pytest

@pytest.mark.parametrize('case', ['date', 'missing_field', 'audience', 'quote', 'structure', 'title'])
def test_answer_success_cannot_hide_draft_failure(case):
    from app.model_eval import SyntheticProvider
    class Mutated(SyntheticProvider):
        def generate(self, messages):
            result = super().generate(messages)
            if '최상위 키는 title, deadline, audience, fields' not in messages[0]['content']:
                return result
            proposal = json.loads(result.text)
            if case == 'date': proposal['deadline']['value'] = '2026-10-21'
            if case == 'missing_field': proposal['fields'].pop()
            if case == 'audience': proposal['audience']['value'] = '다른부서 직원'
            if case == 'quote': proposal['audience']['quote'] = '원문에 없는 조작 근거'
            if case == 'title': proposal['title'] = None
            if case == 'structure': proposal['unexpected'] = True
            return ModelResult(json.dumps(proposal, ensure_ascii=False), result.model, 0, result.provider)
    report = run_evaluation(provider_factory=Mutated)
    assert not report['automated_checks_passed']
    assert all(r['flows']['answer']['passed'] for r in report['runs'])
    assert all(not r['flows']['draft_request']['passed'] for r in report['runs'])

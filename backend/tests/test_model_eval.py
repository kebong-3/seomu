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

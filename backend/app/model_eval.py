"""Reproducible synthetic-only model comparison; mock by default."""
import argparse
import hashlib
import json
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from .assistant import answer
from .config import Settings
from .model_provider import ModelResult
from .service import Service

FIXTURE = '공개 합성 교육 안내(실제 공문 아님)\n교육자료 제출기한: 2026. 10. 20.\n대상: 합성부서 직원\n제출 항목: 성명, 교육명, 교육시간\n교육 인정 여부는 담당자가 원문 기준으로 검토합니다.'
QUESTION = '교육자료 제출기한과 제출 항목은 무엇인가요?'
EXPECTED_DATE = '2026-10-20'


class SyntheticProvider:
    def __init__(self, provider_id):
        self.provider_id = provider_id
    def generate(self, messages):
        return ModelResult('교육자료 제출기한은 2026-10-20이며, 제출 항목은 성명, 교육명, 교육시간입니다. [S1]',
                           'synthetic-' + self.provider_id, 0, self.provider_id)


def date_matches(text):
    dates = re.findall(r'(20\d{2})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})', text)
    normalized = {f'{int(y):04d}-{int(m):02d}-{int(d):02d}' for y, m, d in dates}
    return normalized == {EXPECTED_DATE}


def run_evaluation(*, live=False, provider_factory=None):
    # Never connect to an existing user database or ingest arbitrary files.
    payload = {'fixture': FIXTURE, 'question': QUESTION}
    digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    runs = []
    with tempfile.TemporaryDirectory(prefix='seomu-synthetic-eval-') as temporary:
        config = {'data_dir': Path(temporary), 'api_token': 'synthetic-evaluation', 'roots': {}, 'embedding_path': ''}
        if not live:
            config.update(openai_key='', gemma_key='', llm_key='', llm_url='', llm_model='')
        settings = Settings(**config)
        # Settings may load folder roots from the environment; no scanning occurs.
        settings.roots = {}
        service = Service(settings)
        try:
            relative, staged = service.stage_bytes('synthetic-education.txt', FIXTURE.encode())
            service.ingest(relative, staged)
            for provider_id in ('gemma', 'gpt'):
                started = perf_counter()
                record = {'provider': provider_id, 'requested_model': getattr(settings, provider_id + '_model') if live else 'synthetic-' + provider_id,
                          'input_sha256': digest, 'utc': datetime.now(timezone.utc).isoformat(),
                          'execution': 'live' if live else 'mock', 'fallback': True,
                          'citation_validation': 'not_passed', 'major_date_match': False,
                          'human_review_required': True}
                try:
                    model = provider_factory(provider_id) if provider_factory else (None if live else SyntheticProvider(provider_id))
                    result = answer(service, QUESTION, provider=model, provider_id=provider_id)
                    record['fallback'] = result['mode'] != 'ai'
                    record['provider_reported_model'] = result.get('model_run', {}).get('model')
                    record['provider_elapsed_ms'] = result.get('model_run', {}).get('elapsed_ms')
                    record['citation_validation'] = result.get('model_run', {}).get('citation_validation', 'not_passed')
                    record['major_date_match'] = date_matches(result['answer']) if not record['fallback'] else False
                    record['submitted_fields_present'] = all(x in result['answer'] for x in ('성명', '교육명', '교육시간')) if not record['fallback'] else False
                    # Do not serialize model response, upstream exceptions, headers or keys.
                except Exception:
                    record['failure'] = 'configuration_or_execution_failed'
                record['elapsed_ms'] = round((perf_counter() - started) * 1000)
                runs.append(record)
        finally:
            service.close()
    checks_passed = all(not r['fallback'] and r['citation_validation'] == 'passed' and r['major_date_match'] and r.get('submitted_fields_present') for r in runs)
    return {'schema_version': 1, 'fixture_kind': 'synthetic', 'input_sha256': digest, 'runs': runs,
            'automated_checks_passed': checks_passed, 'two_model_completion': 'unverified',
            'model_identity_verification': 'human_review_required',
            'status': 'live_checks_need_human_review' if live and checks_passed else ('mock_only' if not live else 'live_incomplete')}


def main():
    parser = argparse.ArgumentParser(description='서무비서 공개 합성자료 모델 검증 (기본: 외부 호출 없는 모의 검증)')
    parser.add_argument('--live', action='store_true', help='승인된 서버 환경변수로 실제 외부 모델을 호출합니다.')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = run_evaluation(live=args.live)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(report['status'])


if __name__ == '__main__':
    main()


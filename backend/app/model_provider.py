"""Model transport boundary; no retrieval or administrative decisions here."""
from dataclasses import dataclass
from time import perf_counter
from typing import Protocol

import httpx


@dataclass(frozen=True)
class ModelResult:
    text: str
    model: str
    elapsed_ms: int
    provider: str = 'openai-compatible'


class ModelProvider(Protocol):
    def generate(self, messages: list[dict[str, str]]) -> ModelResult: ...


class OpenAICompatibleProvider:
    def __init__(self, settings):
        self.settings = settings

    def generate(self, messages):
        s = self.settings
        headers = {'Authorization': f'Bearer {s.llm_key}'} if s.llm_key else {}
        started = perf_counter()
        with httpx.Client(timeout=60, follow_redirects=False) as client:
            response = client.post(s.llm_url.rstrip('/') + '/chat/completions', headers=headers, json={
                'model': s.llm_model, 'temperature': 0, 'max_tokens': 5000, 'messages': messages,
            })
            response.raise_for_status()
            content = response.json()['choices'][0]['message']['content']
        # Ignore upstream URLs, keys, error bodies and supplied metadata.
        if not isinstance(content, str) or not content.strip() or len(content) > 20000:
            raise ValueError('Invalid model content')
        return ModelResult(content.strip(), s.llm_model, round((perf_counter() - started) * 1000))


def checked_text(content):
    if not isinstance(content, str) or not content.strip() or len(content) > 20000:
        raise ValueError('Invalid model content')
    return content.strip()


class GPTProvider:
    def __init__(self, settings):
        self.settings = settings

    def generate(self, messages):
        s = self.settings
        started = perf_counter()
        with httpx.Client(timeout=90, follow_redirects=False) as client:
            response = client.post('https://api.openai.com/v1/responses',
                headers={'Authorization': f'Bearer {s.openai_key}'},
                json={'model': s.gpt_model, 'input': messages, 'max_output_tokens': 5000, 'store': False})
            response.raise_for_status()
            data = response.json()
        if data.get('status') != 'completed':
            raise ValueError('Incomplete model response')
        content = '\n'.join(part['text'] for item in data.get('output', [])
            if item.get('type') == 'message' and item.get('role') == 'assistant'
            for part in item.get('content', []) if part.get('type') == 'output_text')
        return ModelResult(checked_text(content), s.gpt_model, round((perf_counter()-started)*1000), 'gpt')


class GemmaProvider:
    def __init__(self, settings):
        self.settings = settings

    def generate(self, messages):
        from urllib.parse import quote
        s = self.settings
        started = perf_counter()
        # A single user prompt also supports Gemma variants without a system role.
        prompt = '\n\n'.join(f'{m["role"]}:\n{m["content"]}' for m in messages)
        endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + quote(s.gemma_model, safe='') + ':generateContent'
        with httpx.Client(timeout=90, follow_redirects=False) as client:
            response = client.post(endpoint, headers={'x-goog-api-key': s.gemma_key}, json={
                'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
                'generationConfig': {'temperature': 0, 'maxOutputTokens': 5000}})
            response.raise_for_status()
            data = response.json()
        candidates = data.get('candidates', [])
        if not candidates or candidates[0].get('finishReason') != 'STOP':
            raise ValueError('Incomplete model response')
        content = '\n'.join(p['text'] for p in candidates[0].get('content', {}).get('parts', [])
            if isinstance(p.get('text'), str) and not p.get('thought'))
        return ModelResult(checked_text(content), s.gemma_model, round((perf_counter()-started)*1000), 'gemma')


def provider_options(settings):
    s = settings
    return [
        {'id': 'evidence', 'label': '원문만 보기', 'model': '', 'configured': True, 'external': False},
        {'id': 'gemma', 'label': 'Gemma · Google API', 'model': s.gemma_model,
            'configured': bool(s.gemma_key and s.gemma_model), 'external': True},
        {'id': 'gpt', 'label': 'GPT · OpenAI API', 'model': s.gpt_model,
            'configured': bool(s.openai_key and s.gpt_model), 'external': True},
        {'id': 'compatible', 'label': '기관·로컬 모델', 'model': s.llm_model,
            'configured': bool(s.llm_url and s.llm_model), 'external': False},
    ]


def get_provider(settings, provider_id='default'):
    selected = settings.ai_provider if provider_id == 'default' else provider_id
    options = {p['id']: p for p in provider_options(settings)}
    if selected not in options:
        raise ValueError('지원하지 않는 AI 제공자입니다.')
    if selected == 'evidence':
        return None
    if not options[selected]['configured']:
        if provider_id == 'default':
            return None
        raise ValueError('선택한 AI의 서버 API 키와 모델 설정이 필요합니다.')
    return {'gpt': GPTProvider, 'gemma': GemmaProvider, 'compatible': OpenAICompatibleProvider}[selected](settings)

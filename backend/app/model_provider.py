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
                'model': s.llm_model, 'temperature': 0, 'max_tokens': 1300, 'messages': messages,
            })
            response.raise_for_status()
            content = response.json()['choices'][0]['message']['content']
        # Ignore upstream URLs, keys, error bodies and supplied metadata.
        if not isinstance(content, str) or not content.strip() or len(content) > 20000:
            raise ValueError('Invalid model content')
        return ModelResult(content.strip(), s.llm_model, round((perf_counter() - started) * 1000))

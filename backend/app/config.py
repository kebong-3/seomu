import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv('SEOMU_DATA_DIR', './data')).resolve())
    api_token: str = field(default_factory=lambda: os.getenv('SEOMU_API_TOKEN', ''))
    origins: list[str] = field(default_factory=lambda: os.getenv('SEOMU_CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(','))
    max_file_bytes: int = 30 * 1024 * 1024
    max_batch_bytes: int = 200 * 1024 * 1024
    max_files: int = 500
    max_pages: int = 200
    max_blocks: int = 10000
    ocr_languages: str = field(default_factory=lambda: os.getenv('SEOMU_OCR_LANG', 'kor+eng'))
    parser: str = field(default_factory=lambda: os.getenv('SEOMU_PARSER', 'native'))
    embedding_path: str = field(default_factory=lambda: os.getenv('SEOMU_EMBEDDING_MODEL_PATH', ''))
    llm_url: str = field(default_factory=lambda: os.getenv('SEOMU_LLM_BASE_URL', ''))
    llm_key: str = field(default_factory=lambda: os.getenv('SEOMU_LLM_API_KEY', ''))
    llm_model: str = field(default_factory=lambda: os.getenv('SEOMU_LLM_MODEL', ''))
    roots: dict[str, str] = field(default_factory=dict)

    def __post_init__(self):
        import json
        self.data_dir.mkdir(parents=True, exist_ok=True)
        for name in ('originals', 'staging'):
            (self.data_dir / name).mkdir(exist_ok=True)
        if not self.api_token:
            p = self.data_dir / 'access-token.txt'
            if not p.exists():
                p.write_text(secrets.token_urlsafe(32), encoding='utf-8')
                p.chmod(0o600)
            self.api_token = p.read_text().strip()
        if not self.roots:
            self.roots = json.loads(os.getenv('SEOMU_LOCAL_ROOTS', '{}'))


SUPPORTED = {'.txt', '.md', '.csv', '.tsv', '.pdf', '.docx', '.xlsx', '.pptx', '.hwpx', '.hwp', '.png', '.jpg', '.jpeg', '.tif', '.tiff'}

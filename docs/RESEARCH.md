# 문서 인식 개선 조사 — 2026.10.9.

Hugging Face Spaces·GitHub·공식 문서에서 문서 변환·OCR·자료 검색·한국어 파서를 검색하고 아래 공개 원문/README·앱 소스를 읽었다. 모든 유사 작품의 전수조사를 완료했다는 뜻은 아니다. 공개 데모의 표시 상태가 한국어 정확도 또는 실무 적합성을 입증하지는 않는다.

| 사례 | 확인 출처 | 살펴본 장점 | 이번 버전 반영 수준 |
|---|---|---|---|
| Docling | https://github.com/docling-project/docling | 구조화 문서·표·페이지·OCR·로컬 처리 | 선택 로컬 어댑터 구현. 모델 실실행은 미검증 |
| SmolDocling Space | https://huggingface.co/spaces/docling-project/SmolDocling-256M-Demo/blob/main/app.py | 이미지에서 문서 요소·구조화 출력 | 위치 있는 추출 결과 화면에 참고. SmolDocling 모델 자체는 미탑재 |
| Mozilla document-to-markdown Space | https://huggingface.co/spaces/mozilla-ai/document-to-markdown/blob/main/app.py | 문서를 변환한 결과 확인 | 추출 결과와 원본 확인 분리. 공개 Space API는 호출하지 않음 |
| PaddleOCR-VL Space | https://huggingface.co/spaces/PaddlePaddle/PaddleOCR-VL_Online_Demo/blob/main/app.py | 문서 파싱·표·시각 문서 처리 | OCR 보완함 설계 참고. PaddleOCR 모델 자체는 미탑재 |
| Open WebUI | https://github.com/open-webui/docs/blob/main/docs/features/workspace/knowledge.mdx | 문서 지식공간·검색 범위·근거 | 폴더 범위 질문·출처 패널 구현. 프로젝트 소스 복사 없음 |
| RAGFlow | https://github.com/infiniflow/ragflow/blob/main/docs/guides/dataset/files_dataset_document_management.md | 문서 상태·재인식·구조화 | 파일별 상태·실패·재인식·변경 버전 구현 |
| PrivateGPT | https://github.com/zylon-ai/private-gpt | 로컬 모델과 문서 수집 API | 로컬 실행·선택 모델 연결 구조 참고. 코드 복사 없음 |
| localGPT | https://github.com/PromtEngineer/localGPT | 개인 문서 질의·로컬 처리 | 로컬 문서공간 구성 참고. 선택 설정으로 외부 API도 가능하므로 ‘절대 외부 전송 없음’이라고 표시하지 않음 |
| hwp-hwpx-parser | https://github.com/KimDaehyeon6873/hwp-hwpx-parser | 한국어 HWP/HWPX 본문·표 파서 | HWP Reader 의존성 연동, 실제 공개 HWP 표 샘플로 검증. HWPX는 자체 XML 처리 |
| Tesseract tessdata_fast | https://github.com/tesseract-ocr/tessdata_fast | 로컬 언어별 OCR | 기본 OCR 경로와 Docker 한국어 언어팩 구성. 한국어 스캔 실검증 수행 |
| BGE-M3 | https://huggingface.co/BAAI/bge-m3 | 다국어 검색 모델 후보 | 로컬 SentenceTransformer 의미검색 연결 코드를 구현. BGE-M3 다운로드·성능 비교는 미실시 |
| llama.cpp | https://github.com/ggml-org/llama.cpp | 로컬 추론 서버 | OpenAI 호환 서버 연결 방식의 후보. 실제 모델 미실행 |

## 이번 설계의 선택

1. 문서마다 적합한 기본 파서를 적용하고, 모델을 쓰기 전 정확한 텍스트·셀을 확보한다.
2. 혼합 PDF는 페이지 단위로 스캔 여부를 확인하고 OCR 실패를 숨기지 않는다.
3. 폴더 상대경로·현재 버전·추출 위치를 검색 결과에 붙인다.
4. 같은 경로의 내용이 달라지면 인식·색인을 교체한다. 실패한 새 버전은 이전 내용을 최신 결과로 표시하지 않는다.
5. 문서의 기한 후보는 사용자가 확인해야 업무로 등록할 수 있다.
6. 공개 Hugging Face 데모에 기관 문서를 자동 업로드하지 않는다.

## 기획안에서 실제 구현으로 바뀐 내용

기존 HTML은 설명 자료였다. 새 패키지는 React/TypeScript 화면, Python 파서·API, SQLite·작업 큐, 폴더 연결기, 실행/배포 설정, 검증 코드로 분리했다. 개발 우선순위는 문서 인식·검색·기한 관리로 좁혔으며 기존 기획의 교육·정산·직원 취합 전체 구현을 주장하지 않는다.

## 라이선스

원문의 이름과 기능을 참고했고 타 프로젝트의 앱 소스를 복사하지 않았다. hwp-hwpx-parser·Tesseract·기본 처리 라이브러리는 실행 의존성이며 해당 배포 라이선스를 따른다. Docling과 임베딩 모델은 선택 설치이며 코드 라이선스와 모델 가중치 라이선스를 각각 검토해야 한다. Open WebUI의 소스를 포함하거나 브랜드를 변경한 배포를 만들지 않았다.

## 호스팅 원문

- Docker Spaces: https://huggingface.co/docs/hub/spaces-sdks-docker
- Render Blueprint: https://render.com/docs/blueprint-spec

Spaces는 Docker 방식으로 FastAPI 앱을 실행할 수 있지만, 기본 디스크의 재시작 후 보존을 보장하지 않는다. 이 앱은 현재 Storage Bucket 자동 동기화를 구현하지 않았으므로 Space는 가상 데이터 시연 경로로 제시했다.

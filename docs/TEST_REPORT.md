# 검증 결과 — 2026.10.9.

## 통과한 확인

- Python 테스트: 17 passed (5.44s). Starlette TestClient의 httpx 향후 변경 안내 경고 1건.
- TypeScript 검사와 Vite production build 통과. 실제 브라우저에서 발견한 환경변수 처리 오류를 수정한 뒤 재빌드·재검증함.
- Chrome headless 실제 UI: 연결 키 인증 → 가상 샘플 3개 가져오기 → 교육 제출기한 검색 → 근거 문서 열기 → 기한 2026-10-20 확인 → 사용자 확인 → 업무 저장 → 진행 중 변경.
- 위 흐름에서 pageerror 0건. 390px 모바일 화면에서 문서 전체의 가로 넘침 없음.
- 테스트는 폴더별 검색, 수정 버전과 실패 후 오래된 색인 제거, ZIP 경로 탈출·링크 거부, 중복 경로, 원문 변경과 업무 확인, CSV 수식 주입 방지, XLSX 수식 캐시·빈 셀·숨김 시트, HWPX/DOCX 표, PPTX 슬라이드, PDF 페이지, 등록 폴더와 링크 제외를 포함함.
- 생성형 AI 어댑터 3개 테스트는 모의 서버 응답으로 검증: 올바른 근거 ID, 잘못된 근거 ID의 근거 모드 전환, 연결 실패의 근거 모드 전환. 실제 외부 모델 호출은 아님.
- 공개 hwp-hwpx-parser 테스트 데이터의 표.hwp, 각주미주.hwp를 기본 HWP Reader로 추출. 각각 7블록/159자, 1블록/17자 확인. 테스트 원본은 패키지에 재배포하지 않음.
- 한국어 OCR 언어팩으로 자체 생성 한국어 이미지와 텍스트·스캔 혼합 2페이지 PDF를 실제 처리. 이미지의 기한 숫자, PDF의 페이지 2 OCR 위치·경고 확인.

## 정확도와 범위의 한계

OCR 샘플에서 ‘제출기한’이 ‘제줄기한’으로 인식되는 등 일부 문자 오류가 관찰됨. 혼합 PDF의 스캔 페이지에서도 글자와 배치 인식 오류가 남음. 이 검증은 OCR 실행과 페이지 연결의 확인이며, 한국어 정확도 벤치마크나 복잡한 공문 표의 정확도 보장이 아님.

Docling·BGE-M3 등의 실제 모델 다운로드/실행, 실서비스 LLM, 기관 내부 실제 문서, 기관 계정·SSO, Windows 스크립트와 Docker/Render/Spaces/Vercel의 실제 배포는 이번 환경에서 검증하지 않음. 단일 업무공간 MVP이며 운영 배포 전 실제 문서로 검수해야 함.

## 실행

```bash
cd backend
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
cd ../frontend
npm ci
npm run build
```

실제 UI 캡처: screenshots/home.png, search.png, tasks.png, mobile.png. 모두 가상 샘플만 사용.

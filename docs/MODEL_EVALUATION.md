# 동일 합성자료 두 모델 검증 재현

이 검증기는 실제 공문이 아닌 고정된 교육자료 안내만 사용합니다. 기존 문서 DB·로컬 연결 폴더를 읽지 않으며, 별도 임시 DB에서 같은 질문과 같은 원문을 Gemma·GPT 경로에 전달합니다. 실제 직원 정보나 업무 문서를 전달하는 옵션은 없습니다.

저장소의 backend 폴더에서 실행합니다. Windows PowerShell 예시:

```powershell
$env:PYTHONUTF8='1'
..\.venv\Scripts\python.exe -m app.model_eval --output ..\work\model-eval-mock.json
```

기본 모드에는 외부 호출이 없습니다. 두 어댑터 이름이 기록되더라도 결과는 `mock_only`이며 실제 두 모델 실행 증거가 아닙니다. 인용 연결, 제출기한과 항목 검증의 기록 형식·실패 판정만 재현합니다.

실호출은 승인된 서버 실행환경에 `OPENAI_API_KEY`, `GEMINI_API_KEY`, `SEOMU_GPT_MODEL`, `SEOMU_GEMMA_MODEL`을 설정한 뒤에만 다음처럼 명시합니다. 키는 채팅이나 명령 인자로 전달하지 않습니다. 각 서비스의 접근권한과 이용비용을 먼저 확인해야 합니다. 후보 모델 이름과 실제 지원 여부는 계정별로 확인합니다.

```powershell
..\.venv\Scripts\python.exe -m app.model_eval --live --output ..\work\model-eval-live.json
```

JSON에는 공통 입력 SHA-256, UTC, 공급자, 요청 모델, 실행시간, mock/live, 근거 전환 여부, 인용 검증, 주요 날짜·제출 항목 일치가 기록됩니다. 응답 전문, 예외 상세, 키, HTTP 헤더는 저장하지 않습니다. `live`는 요청한 실행 모드이며 성공 여부는 `fallback`·`failure`·`status`로 확인합니다. 설정이 없으면 외부 호출 없이 실패가 기록됩니다.

인용 연결 통과는 모든 사실의 정확성을 보장하지 않습니다. 두 실행이 자동 검사에 통과해도 `two_model_completion: unverified`, `human_review_required: true`입니다. 모델 식별자를 바꿨다는 사실만으로 서로 다른 실제 모델이라고 단정하지 않습니다. 담당자는 공급자 운영기록으로 실제 서로 다른 모델임을 확인하고, 고정 합성 원문의 날짜·항목과 응답을 검토한 별도 확인기록을 남겨야 합니다. 이 검증은 문서 검색·근거 답변 흐름만 다루며 요청서 생성·정산 등 앱 전체 기능의 두 모델 완주 증거로 확대 해석하지 않습니다.


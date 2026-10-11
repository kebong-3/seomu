# Gemma / GPT 연결 안내

서무비서는 두 API를 문서 서버에 함께 설정하고, 화면에서 하나를 선택해 사용합니다. API 키가 없어도 기존 문서 인식·원문 검색·수동 자료 요청 기능은 사용할 수 있습니다.

| 모델 | 필요한 키 | 발급 링크 | 공식 문서 |
|---|---|---|---|
| Gemma (Google Gemini API로 호출) | `GEMINI_API_KEY` | https://aistudio.google.com/apikey | https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api |
| GPT (OpenAI Responses API) | `OPENAI_API_KEY` | https://platform.openai.com/api-keys | https://developers.openai.com/api/docs/quickstart |

문서 서버 환경변수에 키를 설정합니다. 예시는 `backend/.env.example`에 있습니다. 이 앱은 .env 파일을 자동으로 읽지 않으므로 호스팅 서비스의 환경변수 설정 또는 실행 환경에 직접 등록하고 서버를 재시작하세요.

- `SEOMU_GEMMA_MODEL=gemma-4-26b-a4b-it`
- `SEOMU_GPT_MODEL=gpt-5-mini`
- `SEOMU_AI_PROVIDER=gemma` (기존 기본 호출을 사용할 때만 적용; 화면에서는 선택한 모델이 우선합니다.)

계정에서 지원되는 모델명으로 변경할 수 있습니다. 키가 설정됐다는 표시는 실제 호출 성공을 뜻하지 않습니다. 계정 권한·사용량·요금과 모델 제공 여부는 각 공급자에서 확인하세요.

Vercel에는 화면이 배포됩니다. Python 문서 서버도 별도로 실행·배포하고 앱의 ‘문서 서버 연결·설정’에서 연결해야 합니다. API 키를 VITE_ 변수, 브라우저 입력, GitHub 저장소에 넣지 마세요. 문서 서버 접근키(SEOMU_API_TOKEN)는 공급자의 API 키와 다릅니다. 운영 서버에서는 HTTPS와 허용된 접속 주소(SEOMU_CORS_ORIGINS)를 설정하세요.

## 사용

1. ‘AI 연결 · Gemma / GPT’에서 상태를 확인합니다.
2. 문서함에서 공개 또는 외부 전송이 허용된 공문을 인식하고 원문을 엽니다.
3. 모델을 선택해 ‘AI로 요청 초안’을 누릅니다.
4. 기한·대상·항목의 원문 인용을 확인하고 확인란을 선택합니다.
5. 요청 양식에서 내용을 수정하고 실제 대상 직원을 직접 선택한 뒤 저장합니다.

선택한 공급자에만 질문과 문서 발췌를 전송합니다. 실패 시 다른 공급자로 자동 전환하지 않습니다. 원문 인용·명시된 날짜를 검증하지만 의미의 정확성을 보장하지 않습니다. 긴 문서는 일부만 전달되며, 별첨과 후반부를 담당자가 확인해야 합니다. AI는 요청을 자동 저장하거나 지급·승인을 결정하지 않습니다.

실제 키를 사용한 호출은 아직 검증하지 않았습니다. 테스트는 가상 응답으로 인증·공급자 선택·응답 처리·근거 검증을 확인합니다.

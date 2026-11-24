# HANDOFF — 다음 작업자에게

## 지금까지
### 2026-11-24 (1)
- 카페 A 맞춤 데모 완성 → 대표님(윤건님) 제작 확정
- 데모 링크: https://claude.ai/artifact/LjyTM2ZAf2G5ec1bUhx5zz (코드는 `demo/cafe-a-demo.html`)

### 2026-11-24 (2) — 1단계 완료: Next.js 웹앱으로 이식
- 저장소 루트에 Next.js 15 (App Router, TypeScript) 앱
- `lib/rules.ts`: 매장 규칙·시간대·공휴일·가중치 설정값 (법규·규칙은 여기서만 수정)
- `lib/engine.ts`: 데모 로직 이식 — `toDay`, `evaluate`, `solve`(담금질), `payroll`, `weeksOf`(월~일 주, 첫 주는 전달 포함), `ruleParse`, `missingMarks`
- `lib/nov2026.ts`: 11월 실제 근무표 데이터
- `components/`: `ScheduleApp`(탭·상태), `Calendar`(카페 A 표기), `PayTables`(수당표), `RulesPanel`
- `app/api/parse`: 요청 문장 → JSON. `ANTHROPIC_API_KEY` 없으면 503 → 화면이 규칙 기반 해석으로 대체
- 확인: `npm run build` 통과, `npm run test:engine` 전부 통과 (12월 편성 위반 0, 요청 반영, 52h 초과 없음), 브라우저 테스트 통과 (데스크톱·모바일)


### 2026-11-24 (3) — 2단계 일부: 실제 운영용 저장·로그인·직원 링크
- Supabase 프로젝트 `cafe-schedule` (ref `omwnawpubidjcmfhoyps`, 서울 리전, vagofit-pt's Org) 생성
- 스키마: `supabase/migrations/0001_init.sql` — stores, staff(A~F, 개인 토큰), sessions, requests, schedules
- 보안 구조: 테이블은 전부 RLS로 잠금(정책 없음). 브라우저는 SECURITY DEFINER RPC만 호출
  - 대표님: `owner_login(비밀번호)` → 30일 세션 토큰 → `owner_state / owner_save_schedule / owner_add_request / owner_set_request / owner_change_pass`
  - 직원: 개인 링크 토큰 → `staff_info / staff_request / staff_cancel` (자기 요청만, 대기 상태만 취소)
  - Supabase 보안 경고 "anon이 SECURITY DEFINER 실행 가능"은 의도된 것 (함수 안에서 세션·토큰 검사)
- 초기 대표님 비밀번호는 형민에게 채팅으로 전달됨 (저장소에 없음). 앱의 '직원 링크' 탭에서 변경 가능
- `lib/db.ts`: RPC 호출 (URL·publishable 키는 공개용 값이라 코드에 둠. env `NEXT_PUBLIC_SUPABASE_URL/KEY`로 덮어쓰기 가능)
- 화면: 로그인 → 근무표(자동 저장, 직원에게 공개/취소), 요청(승인 대기·승인·거절, 직접 입력), 수당표, 직원 링크(링크·안내문 복사), 규칙, 11월 검사
- 직원 화면 `/r/[token]`: 공개된 내 근무, 날짜 눌러 휴무·연차 요청, 내 요청 상태
- 월 선택: 2026-12, 2027-01 (엔진의 월 번호 13 = 2027년 1월, `ymOf`·`mLabel`). 1월 첫 주는 저장된 12월 근무표로 계산
- 승인된 요청만 편성에 반영. 대표님 화면은 30초마다 요청 새로고침
- 테스트: DB를 흉내 낸 브라우저 테스트로 로그인 실패/성공, 편성·저장·새로고침 유지, 공개, 직원 요청→승인, 1월 편성까지 통과 (컨테이너에서 Supabase 직접 접속은 막혀 있어 실서버 로그인은 형민이 확인)

## 실행
```
npm install
npm run dev          # http://localhost:3000
npm run test:engine  # 엔진 점검
```

## 아직 안 된 것 / 주의
- 편성(`solve`)이 브라우저 메인 스레드에서 약 4초 → 2단계에서 서버(OR-Tools)로 이동
- 편성 가능한 달은 `ScheduleApp.tsx`·`StaffPage.tsx`의 `MONTHS` 배열 (2월 이후 추가 시 공휴일도 `lib/rules.ts`에)
- 배포: https://cafe-schedule-azure.vercel.app (Vercel 프로젝트 cafe-schedule, main 푸시마다 자동 배포, 현재 누구나 접근 가능 → 2단계에서 로그인)

## 다음 할 일
1. (완료) 저장·로그인·직원 링크
2. `engine/`에 FastAPI + OR-Tools CP-SAT로 `evaluate()` 규칙 이식 → 같은 입력으로 TS 엔진과 결과 비교 → `/api/solve`로 교체
3. 월 선택(1월 이후), 직전 달 근무표를 DB에서 불러와 첫 주·연속근무 계산
4. 대표님 로그인, 직원 요청 링크(웹 폼) → 이후 텔레그램/카톡 채널
5. 대표님 확인 사항(★, F 마감, 포괄임금, 공휴일 영업) 반영 → `lib/rules.ts`

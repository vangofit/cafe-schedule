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

### 2026-11-24 (4) — 월영당 브랜드 디자인
- 카페 이름 '카페 A' → '월영당' (화면·DB `stores.name`, 마이그레이션 0002)
- 디자인 시스템 전면 교체 (`app/globals.css`): 밤 호수·달빛·한지 팔레트, 고운바탕 제목, 달+월영교 로고(`components/Brand.tsx`)
- 로그인 화면 = 월영교의 밤, 대표님 화면 상단 브랜드 바, 모바일 하단 고정 탭(요청 대기 수 배지), 직원 화면도 같은 헤더
- 홈 화면 추가용 `app/manifest.ts`, `app/icon.svg`
- 테스트: 흉내 DB로 전체 흐름 재통과, 데스크톱·모바일·로그인·직원 화면 스크린샷 확인

### 2026-11-24 (5) — 개선 5종
1. 근무표 이미지 저장: `lib/exporters.ts` `exportImage` — 화면 밖 `.exportMode`(1400px 데스크톱 형식)에 그린 뒤 html-to-image로 PNG. 폰은 공유 시트, PC는 다운로드
2. 요청 마감: `month_settings.deadline`, 대표님 화면 D-day·미요청 직원 표시, 직원 화면 잠금 + DB `staff_request`가 마감 후 거절(한국 날짜 기준 `_today_kst()`)
3. 대타·교환: `swaps` 테이블, 직원 `staff_swap_request`(공개된 근무표만, 음료 직원), 대표님 `SwapsPanel`에서 `applySwap`으로 미리 검사 → 승인 시 근무표에 적용·저장
4. 바쁜 날: `month_settings.busy_days` → 엔진 `dayType(m,d,busy)`가 주말형(음료 4명)으로 편성. 추천 목록은 `lib/rules.ts` `BUSY_SUGGEST`. 형식이 바뀐 날은 "다시 편성 필요" 위반으로 표시
5. 급여 정산: `staff.wage`, `staff.comp_ot`(포괄 포함 월 연장시간) → `lib/pay.ts` `finalPay`, 엑셀 3시트(근무표·주별 근로·월 합계/지급분) `exportExcel`(exceljs)
- 마이그레이션 `0003_features.sql` 적용됨 (owner_state/staff_info 응답에 month·swaps·today 추가)
- 테스트: 엔진 점검에 바쁜 날·교환 추가, 흉내 DB 브라우저 테스트로 5개 기능 전부 통과 (PNG·xlsx 실제 파일 열어 확인)

### 2026-11-24 (6) — 편성 엔진 OR-Tools 교체
- `api/solve.py`: Vercel Python 함수(OR-Tools CP-SAT). 반드시 규칙(필수 자리 정확히 1명 또는 빈자리 벌점, 하루 1자리, 요청 반영, 주 52h, 꽉 찬 주 휴무 1일, 7일 연속 금지)은 제약, 나머지는 점수. 시간 제한 8초
- `lib/cpsat.ts` `buildProblem`: 날짜·시간대·휴게·공휴일·바쁜 날·요청은 TS 엔진이 계산해 '문제'로 보냄 (규칙 한 곳에서 관리)
- 화면: 자동 편성 → `/api/solve` 호출, 실패하면 브라우저 보조 엔진(기존 담금질)으로 자동 대체. KPI에 '편성 엔진' 표시
- 점수에 `weeklyOverHour`(주 40h 초과 1시간당 2) 추가 → E 지원·★와 연장근로 부담의 균형. 대표님 선호에 따라 `lib/rules.ts` WEIGHTS 조정
- 비교 `scripts/compare.ts` (node --experimental-strip-types): 같은 조건에서 OR-Tools가 점수 더 낮음(=더 좋음), 연속근무 경고 0, 빡빡한 달 빈자리는 규칙상 불가능한 자리만 남음
- `vercel.json`: api/solve.py maxDuration 30초. `requirements.txt`: ortools

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

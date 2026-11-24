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

## 실행
```
npm install
npm run dev          # http://localhost:3000
npm run test:engine  # 엔진 점검
```

## 아직 안 된 것 / 주의
- 저장 없음: 새로고침하면 요청·근무표가 사라짐
- 편성(`solve`)이 브라우저 메인 스레드에서 약 4초 → 2단계에서 서버(OR-Tools)로 이동
- 편성 달이 12월로 고정 (`ScheduleApp.tsx`의 `MONTH`, 직전 달 데이터는 `NOV_2026`)
- 배포 안 함 (Vercel 연결은 형민 확인 후)

## 다음 할 일 (2단계)
1. Supabase 테이블: staff, settings(rules), requests, schedules(월), schedule_days → 근무표·요청 저장
2. `engine/`에 FastAPI + OR-Tools CP-SAT로 `evaluate()` 규칙 이식 → 같은 입력으로 TS 엔진과 결과 비교 → `/api/solve`로 교체
3. 월 선택(1월 이후), 직전 달 근무표를 DB에서 불러와 첫 주·연속근무 계산
4. 대표님 로그인, 직원 요청 링크(웹 폼) → 이후 텔레그램/카톡 채널
5. 대표님 확인 사항(★, F 마감, 포괄임금, 공휴일 영업) 반영 → `lib/rules.ts`

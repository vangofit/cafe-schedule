# HANDOFF — 다음 작업자에게

## 지금까지 (2026-11-24)
- 카페 A 맞춤 데모 완성 → 대표님(윤건님) 제작 확정
- 데모 링크: https://claude.ai/artifact/LjyTM2ZAf2G5ec1bUhx5zz (코드는 `demo/cafe-a-demo.html`)
- 규칙·확인 필요 사항·스택은 `CLAUDE.md` 참고

## 데모 코드 지도 (`demo/cafe-a-demo.html`)
- `NOV_RAW`: 11월 실제 근무표 전사 → `novDay()`로 공통 형식 변환
- `st.dec[i]`: 12월 날짜별 roles. 평일 [오픈, 미들, 마감] (오픈 = A~D | "E" | "★"), 주말 [s0..s3]
- `toDay()`: roles → 표시용 하루 객체 / `dayHours()`: 사람별 실근로
- `evaluate()`: 점수·위반 목록 / `solve()`: 담금질 탐색 / `payroll()`: 주별 수당
- `calHTML()`: 기존 스케줄표 형식 캘린더 (820px 이하 카드 목록)

## 다음 할 일 (순서대로)
1. Next.js + Supabase 프로젝트 생성, 테이블 설계: staff, shift_templates, rules(설정), requests, schedules(월), schedule_days
2. `engine/`에 FastAPI + OR-Tools로 `evaluate()` 규칙을 CP-SAT 모델로 이식 → 데모와 같은 입력으로 결과 비교
3. 대표님 화면: 캘린더(데모의 `calHTML` 표기 재현), 날짜 수정, 수당표
4. 직원 요청 폼(웹 링크) → 이후 텔레그램/카톡 채널
5. 대표님 확인 사항(★, F 마감, 포괄임금 등) 받으면 설정값 반영

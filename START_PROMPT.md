Claude Code를 이 폴더에서 열고 아래 문장을 그대로 붙여넣으세요.

---

이 폴더는 카페 A 근무표 자동 편성 시스템 프로젝트야. CLAUDE.md와 HANDOFF.md를 먼저 읽고, demo/cafe-a-demo.html의 규칙과 화면을 기준으로 실서비스 버전을 만들자.

1단계로 이것만 해줘:
1. Next.js(App Router, TypeScript) 프로젝트를 app/ 폴더에 만들고
2. demo/cafe-a-demo.html의 12월 캘린더 화면(기존 스케줄표와 같은 표기)을 React 컴포넌트로 옮기고
3. 편성 로직(toDay, evaluate, solve, payroll)은 일단 lib/ 아래 TypeScript로 그대로 옮겨서 데모와 같은 결과가 나오는지 확인

DB와 OR-Tools 엔진은 2단계에서 할 거야. 끝나면 HANDOFF.md를 갱신해줘.

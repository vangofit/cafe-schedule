// OR-Tools(CP-SAT) 엔진과 기존 담금질 엔진 비교
// 실행: node --experimental-strip-types scripts/compare.ts
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { evaluate, solve, fmtH, type MonthCtx, type Roles } from "../lib/engine.ts";
import { buildProblem } from "../lib/cpsat.ts";
import { NOV_2026 } from "../lib/nov2026.ts";

const cases: [string, MonthCtx][] = [
  ["12월 기본", { m: 12, reqs: [], prevDays: NOV_2026.slice(23) }],
  ["12월 요청 5건 + 바쁜 날 2일", { m: 12, reqs: [{ who: "C", day: 24, type: "lv" }, { who: "A", day: 31, type: "off" }, { who: "B", day: 26, type: "lv" }, { who: "D", day: 19, type: "off" }, { who: "A", day: 20, type: "lv" }], prevDays: NOV_2026.slice(23), busy: [24, 31] }],
  ["빡빡한 달: 연차 몰림(주말 2명 동시)", { m: 12, reqs: [{ who: "A", day: 12, type: "lv" }, { who: "B", day: 12, type: "lv" }, { who: "C", day: 13, type: "lv" }, { who: "D", day: 13, type: "lv" }, { who: "E", day: 12, type: "lv" }, { who: "A", day: 15, type: "lv" }, { who: "B", day: 16, type: "lv" }, { who: "C", day: 17, type: "lv" }], prevDays: NOV_2026.slice(23), busy: [24] }],
];
for (const [name, ctx] of cases) {
  writeFileSync("/tmp/pb.json", JSON.stringify(buildProblem(ctx, true, null)));
  const out = JSON.parse(execSync(`python3 -c "import json,sys; sys.path.insert(0,'api'); import solve; print(json.dumps(solve.solve(json.load(open('/tmp/pb.json')))))"`).toString());
  const t = Date.now(); const sa = solve(ctx, true, null); const saSec = (Date.now() - t) / 1000;
  const show = (label: string, R: Roles[], sec: number) => {
    const ev = evaluate(ctx, R, true); const h = Object.values(ev.hours);
    console.log(`  ${label}: 위반 ${ev.issues.filter((x) => x[0] === "bad").length}건 · 경고 ${ev.issues.filter((x) => x[0] === "warn").length} · 점수 ${ev.sc.toFixed(0)} · 근로시간 ${fmtH(Math.min(...h))}~${fmtH(Math.max(...h))}h · E지원 ${ev.eSup} · ★ ${ev.stars} · 주말E ${ev.eWeekend} · ${sec}초`);
  };
  console.log(`■ ${name}`);
  show(`OR-Tools(${out.status})`, out.roles, out.seconds);
  show("기존 엔진", sa, saSec);
}

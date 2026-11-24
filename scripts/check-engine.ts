// 엔진 점검: 12월을 편성해 규칙 위반이 없는지, 휴게 계산이 표기와 맞는지 확인
// 실행: npm run test:engine
import { evaluate, solve, work, weeksOf, payroll, type MonthCtx } from "../lib/engine.ts";
import { NOV_2026 } from "../lib/nov2026.ts";

const expect = (name: string, ok: boolean) => { console.log(`${ok ? "✓" : "✗"} ${name}`); if (!ok) process.exitCode = 1; };

// 휴게 계산이 카페 A 표기와 같은지
expect("0900-1630 = 7", work("0900-1630") === 7);
expect("1400-2230 = 7.5", work("1400-2230") === 7.5);
expect("1230-2230 = 9 (8/1)", work("1230-2230") === 9);
expect("1100-2230 = 10.5 (8/2.5)", work("1100-2230") === 10.5);
expect("0900-1830 = 8.5 (8/0.5)", work("0900-1830") === 8.5);
expect("12월 첫 주는 11/30부터", JSON.stringify(weeksOf(12)[0][0]) === "[11,30]");

const ctx: MonthCtx = { m: 12, reqs: [{ who: "C", day: 24, type: "lv" }, { who: "A", day: 31, type: "off" }, { who: "B", day: 26, type: "lv" }], prevDays: NOV_2026.slice(23) };
const t = Date.now();
const R = solve(ctx, true, null);
const ev = evaluate(ctx, R, true);
console.log(`편성 ${((Date.now() - t) / 1000).toFixed(1)}초, 점수 ${ev.sc.toFixed(1)}`);
expect("규칙 위반(bad) 0건", ev.issues.filter((x) => x[0] === "bad").length === 0);
expect("C 12/24 근무 없음", !ev.days[23].drink.some((s) => s.who === "C"));
expect("A 12/31 근무 없음", !ev.days[30].drink.some((s) => s.who === "A"));
const pay = payroll([NOV_2026[29], ...ev.days], weeksOf(12));
expect("주 52시간 초과 없음", pay.every((w) => Object.values(w.rows).every((r) => r.tot <= 52)));
console.log("음료 직원 월 근로시간:", ev.hours, "E 지원", ev.eSup, "★", ev.stars);

// OR-Tools 편성 서버(api/solve.py)에 보낼 '문제' 만들기
// 날짜·시간대·휴게·공휴일·요청 계산은 여기(TypeScript 엔진)에서 하고, 서버는 순수하게 푼다.
import { avail, daysIn, dayHours, dayType, dow, slotTimes, weeksOf, work, type MonthCtx, type Roles } from "./engine.ts";
import { DRINK, LIMITS, SHIFT, WEIGHTS } from "./rules.ts";

export function buildProblem(ctx: MonthCtx, allowStar: boolean, prev: Roles[] | null, timeLimit = 8) {
  const N = daysIn(ctx.m);
  const days = Array.from({ length: N }, (_, i) => {
    const d = i + 1, type = dayType(ctx.m, d, ctx.busy), times = slotTimes(ctx.m, d, type), av = avail(ctx, d);
    const weekdayDate = dow(ctx.m, d) >= 1 && dow(ctx.m, d) <= 5;
    const realWeekend = !weekdayDate;
    const wd = type === "wd";
    return {
      d, wd, avail: av.drink,
      eDessert: weekdayDate && av.E ? work(SHIFT.E) : 0,
      slots: times.map((t, j) => ({
        hours: work(t),
        kind: wd ? ["o", "m", "c"][j] : j === 0 ? "w0" : "w",
        late: t.endsWith("2230"), early: t.startsWith("09"),
        allowE: av.E && (wd ? j === 0 : realWeekend),
        eHours: wd ? 0 : work(t), // 평일 음료 오픈 지원은 디저트 근무와 같은 시간이라 추가 0
        allowStar: wd && j === 0 && allowStar,
      })),
    };
  });
  // 전달 날짜(첫 주·연속근무용)
  const prevH: Record<string, Record<string, number>> = {};
  ctx.prevDays.forEach((day) => { const h = dayHours(day); for (const p in h) (prevH[p] = prevH[p] || {})[`${day.m}-${day.d}`] = h[p]; });
  const weeks = weeksOf(ctx.m).map((w) => {
    const idx = w.filter(([mm]) => mm === ctx.m).map(([, d]) => d - 1);
    const fixed: Record<string, { h: number; n: number }> = {};
    [...DRINK, "E"].forEach((p) => {
      let h = 0, n = 0;
      w.filter(([mm]) => mm !== ctx.m).forEach(([mm, d]) => { const v = prevH[p]?.[`${mm}-${d}`]; if (v) { h += v; n++; } });
      fixed[p] = { h, n };
    });
    return { idx, fixed, full: w.length === 7 };
  });
  const prevWork: Record<string, boolean[]> = {};
  [...DRINK, "E"].forEach((p) => { prevWork[p] = ctx.prevDays.slice(-6).map((day) => !!prevH[p]?.[`${day.m}-${day.d}`]); });
  return {
    people: [...DRINK], days, weeks, prevWork, prev,
    weeklyMax: LIMITS.weeklyMax, weeklyBase: LIMITS.weeklyBase, timeLimit,
    weights: { ...WEIGHTS, keepPrev: 4 },
  };
}

export interface SolveResult { roles: Roles[] | null; status: string; seconds: number; objective?: number; bound?: number; error?: string }

export async function solveOnServer(ctx: MonthCtx, allowStar: boolean, prev: Roles[] | null, signal?: AbortSignal): Promise<SolveResult> {
  const r = await fetch("/api/solve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildProblem(ctx, allowStar, prev)), signal });
  if (!r.ok) throw new Error(`solve ${r.status}`);
  return r.json();
}

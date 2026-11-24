// 근무표 편성·검사·수당 계산 엔진
// demo/cafe-a-demo.html의 로직을 그대로 옮긴 것 (결과가 데모와 같아야 함).
// 2단계에서 편성(solve)은 Python OR-Tools CP-SAT 서버로 교체 예정.
import { ALL, DRINK, F_END, HOLIDAYS, LIMITS, SHIFT, WEIGHTS, YEAR } from "./rules.ts";

export type DayType = "wd" | "sat" | "sun";
export type Role = string | null; // "A"~"D" | "E"(음료 오픈 지원/주말 지원) | "★" | null
export type Roles = Role[]; // 평일 [오픈, 미들, 마감] / 주말 [s0..s3]
export interface Req { who: string; day: number; type: "lv" | "off" } // lv: 연차, off: 휴무 희망
export interface Slot { who: string | null; t: string }
export interface Day {
  m: number; d: number; type: DayType; hol: string | null; busy?: boolean;
  drink: Slot[]; star: boolean; dessert: string | null; f: string | null;
  off: string[]; lv: string[];
}
export type Issue = ["bad" | "warn", string];

// ───── 날짜·시간 ─────
/** m은 2026년 기준 월 번호 (13 = 2027년 1월). 실제 날짜 키 "YYYY-M-D" */
export const hkey = (m: number, d: number) => { const t = new Date(YEAR, m - 1, d); return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`; };
/** 화면 표시용 월 (13 → 1) */
export const mLabel = (m: number) => ((m - 1) % 12) + 1;
export const ymOf = (m: number) => { const t = new Date(YEAR, m - 1, 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`; };
export const dow = (m: number, d: number) => new Date(YEAR, m - 1, d).getDay();
export const daysIn = (m: number) => new Date(YEAR, m, 0).getDate();
const toH = (s: string) => +s.slice(0, 2) + +s.slice(2) / 60;
export function span(t: string) { const [a, b] = t.split("-"); return toH(b === "마감" ? F_END : b) - toH(a); }
/** 휴게: 출근~퇴근 8.5h 이상 1시간, 그 외 30분 (월영당 표기와 일치) */
export function work(t: string) { const s = span(t); return s - (s >= 8.5 ? 1 : s > 4 ? 0.5 : 0); }
export const fmtH = (h: number) => (Math.round(h * 10) / 10).toString();

/** busy: 대표님이 '바쁜 날'로 지정한 평일 → 공휴일처럼 주말형(음료 4명)으로 편성 */
export function dayType(m: number, d: number, busy?: number[]): DayType {
  const w = dow(m, d);
  if (w === 6) return "sat";
  if (w === 0) return "sun";
  if (HOLIDAYS[hkey(m, d)] || busy?.includes(d)) {
    const nd = new Date(YEAR, m - 1, d + 1);
    const nw = nd.getDay();
    const nh = !!HOLIDAYS[`${nd.getFullYear()}-${nd.getMonth() + 1}-${nd.getDate()}`];
    return nw === 0 || nw === 6 || nh ? "sat" : "sun"; // 공휴일 = 주말형
  }
  return "wd";
}

// ───── 사람별 그날 실근로 ─────
export function dayHours(day: Day): Record<string, number> {
  const h: Record<string, number> = {};
  day.drink.forEach((s) => { if (s.who) h[s.who] = (h[s.who] || 0) + work(s.t); });
  if (day.dessert && !h.E) h.E = work(day.dessert); // E가 음료 오픈 지원이면 같은 근무로 1번만
  if (day.f) h.F = work(day.f);
  return h;
}

// ───── 월 편성 컨텍스트 ─────
export interface MonthCtx { m: number; reqs: Req[]; prevDays: Day[]; busy?: number[] } // prevDays: 직전 달 마지막 주(연속근무·첫 주 계산용)

export function avail(ctx: MonthCtx, d: number) {
  const no = new Set(ctx.reqs.filter((r) => r.day === d).map((r) => r.who));
  return { drink: DRINK.filter((x) => !no.has(x)) as string[], E: !no.has("E"), F: !no.has("F") };
}
export function slotTimes(m: number, d: number, type: DayType) {
  if (type === "wd") return [dow(m, d) === 5 ? SHIFT.friOpen : SHIFT.wdOpen, SHIFT.mid, SHIFT.close];
  return type === "sat" ? SHIFT.sat : SHIFT.sun;
}
export function toDay(ctx: MonthCtx, d: number, roles: Roles): Day {
  const { m } = ctx;
  const type = dayType(m, d, ctx.busy), av = avail(ctx, d), times = slotTimes(m, d, type);
  const drink: Slot[] = []; let star = false;
  roles.forEach((w, i) => {
    if (type === "wd" && i === 0) {
      if (w === "★") { star = true; return; }
      if (w === "E") { drink.push({ who: "E", t: SHIFT.E }); return; }
    }
    if (times[i]) drink.push({ who: w, t: times[i] }); // 저장된 자리 수가 그날 형식과 다르면 무시
  });
  const working = new Set(drink.map((s) => s.who).filter(Boolean) as string[]);
  const lv = ctx.reqs.filter((r) => r.day === d && r.type === "lv").map((r) => r.who);
  const off: string[] = [];
  DRINK.forEach((x) => { if (!working.has(x) && !lv.includes(x)) off.push(x); });
  const wdN = dow(m, d);
  const isWeekdayDate = wdN >= 1 && wdN <= 5;
  const eDessert = isWeekdayDate && av.E; // 평일(공휴일 포함) E 디저트
  if (!eDessert && !working.has("E") && !lv.includes("E")) off.push("E");
  const fWorks = type !== "wd" && av.F;
  if (type !== "wd" && !fWorks && !lv.includes("F")) off.push("F");
  return { m, d, type, hol: HOLIDAYS[hkey(m, d)] || null, busy: !!ctx.busy?.includes(d) && !HOLIDAYS[hkey(m, d)], drink, star, dessert: eDessert ? SHIFT.E : null, f: fWorks ? SHIFT.F : null, off, lv };
}

function shuffle<T>(a: T[]) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const isWeekendDate = (m: number, d: number) => dow(m, d) === 0 || dow(m, d) === 6;

export function randomRoles(ctx: MonthCtx, d: number, allowStar: boolean): Roles {
  const type = dayType(ctx.m, d, ctx.busy), av = avail(ctx, d); const p = shuffle(av.drink);
  if (type === "wd") {
    let open: Role;
    if (p[2] && Math.random() < 0.65) open = p[2];
    else if (av.E && (Math.random() < 0.7 || !allowStar)) open = "E";
    else open = allowStar ? "★" : p[2] || "E";
    if (open === "E" && !av.E) open = allowStar ? "★" : p[2] || null;
    return [open, p[0] || null, p[1] || null];
  }
  const r: Roles = [p[0] || null, p[1] || null, p[2] || null, p[3] || null];
  const we = isWeekendDate(ctx.m, d);
  for (let i = 0; i < 4; i++) if (!r[i] && we && av.E && !r.includes("E")) r[i] = "E";
  return shuffle(r);
}

/** 월~일 주 목록. 첫 주는 직전 달 날짜를 포함 */
export function weeksOf(m: number): [number, number][][] {
  const n = daysIn(m); const weeks: [number, number][][] = [];
  let d = 1; const first = dow(m, 1); const back = (first + 6) % 7; // 월요일까지 거슬러 갈 일수
  if (back > 0) {
    const w: [number, number][] = []; const pm = m - 1, pn = daysIn(pm);
    for (let i = back; i > 0; i--) w.push([pm, pn - i + 1]);
    while (w.length < 7 && d <= n) w.push([m, d++]);
    weeks.push(w);
  }
  while (d <= n) { const w: [number, number][] = []; for (let i = 0; i < 7 && d <= n; i++) w.push([m, d++]); weeks.push(w); }
  return weeks;
}

export interface Evaluation {
  sc: number; issues: Issue[]; days: Day[];
  hours: Record<string, number>; // 음료 직원 월 근로시간
  eSup: number; stars: number; staffOpens: number; eWeekend: number;
}
export function evaluate(ctx: MonthCtx, R: Roles[], allowStar: boolean, detail = true): Evaluation {
  const days = R.map((r, i) => toDay(ctx, i + 1, r));
  const tl = [...ctx.prevDays, ...days];
  const H: Record<string, Record<string, number>> = {}; ALL.forEach((p) => (H[p] = {}));
  tl.forEach((day) => { const h = dayHours(day); for (const p in h) H[p][`${day.m}-${day.d}`] = h[p]; });
  let sc = 0; const issues: Issue[] = [];
  const push = (t: Issue[0], msg: string) => { if (detail) issues.push([t, msg]); };
  weeksOf(ctx.m).forEach((w) => {
    [...DRINK, "E"].forEach((p) => {
      let tot = 0, n = 0;
      w.forEach(([m, d]) => { const v = H[p][`${m}-${d}`]; if (v) { tot += v; n++; } });
      if (tot > LIMITS.weeklyMax) { sc += WEIGHTS.overWeeklyPerHour * (tot - LIMITS.weeklyMax); push("bad", `${p}: ${mLabel(w[0][0])}/${w[0][1]}~ 주 <b>${fmtH(tot)}시간</b> (52시간 초과)`); }
      if (w.length === 7 && n === 7) { sc += WEIGHTS.noDayOffInWeek; push("bad", `${p}: ${mLabel(w[0][0])}/${w[0][1]}~ 주에 쉬는 날이 없음`); }
    });
  });
  [...DRINK, "E"].forEach((p) => {
    let run = 0;
    tl.forEach((day) => {
      if (H[p][`${day.m}-${day.d}`]) { run++; if (run > 6) { sc += WEIGHTS.streakOver6; if (day.m === ctx.m) push("warn", `${p}: ${mLabel(day.m)}/${day.d}까지 ${run}일 연속 근무`); } }
      else run = 0;
    });
  });
  let eSup = 0, stars = 0, eWeekend = 0, staffOpens = 0;
  const cnt: Record<string, Record<string, number>> = {};
  DRINK.forEach((p) => (cnt[p] = { o: 0, m: 0, c: 0, w0: 0, h: 0 }));
  days.forEach((day, i) => {
    const r = R[i];
    if (r.length !== (day.type === "wd" ? 3 : 4)) { sc += WEIGHTS.emptySlot * 2; push("bad", `${mLabel(ctx.m)}/${day.d} 근무 형식(평일형/주말형)이 바뀌었어요 → 다시 편성 필요`); return; }
    if (day.type === "wd") {
      if (!r[1] || !r[2]) { sc += WEIGHTS.emptySlot; push("bad", `${mLabel(ctx.m)}/${day.d} 미들·마감 자리 비어 있음`); }
      if (r[0] === "E") { sc += WEIGHTS.eOpenSupport; eSup++; }
      else if (r[0] === "★") { sc += allowStar ? WEIGHTS.starOpen : WEIGHTS.starForbidden; stars++; }
      else if (!r[0]) sc += WEIGHTS.emptySlot;
      if (r[0] && (DRINK as readonly string[]).includes(r[0])) { cnt[r[0]].o++; staffOpens++; }
      if (r[1]) cnt[r[1]].m++;
      if (r[2]) cnt[r[2]].c++;
    } else {
      r.forEach((w, j) => {
        if (!w) { sc += WEIGHTS.emptySlot; push("bad", `${mLabel(ctx.m)}/${day.d} ${day.type === "sat" ? "토요일형" : "일요일형"} ${j + 1}번째 자리 비어 있음`); }
        else if (w === "E") { sc += WEIGHTS.eWeekend; eWeekend++; }
        else if (j === 0) cnt[w].w0++;
      });
    }
    if (i > 0) {
      const prev = days[i - 1];
      const late = prev.drink.filter((s) => s.who && s.t.endsWith("2230")).map((s) => s.who);
      const early = day.drink.filter((s) => s.who && s.t.startsWith("09")).map((s) => s.who);
      late.forEach((p) => { if (early.includes(p)) sc += WEIGHTS.closeThenOpen; });
    }
  });
  DRINK.forEach((p) => { for (let d = 1; d <= days.length; d++) cnt[p].h += H[p][`${ctx.m}-${d}`] || 0; });
  const mean = (k: string) => DRINK.reduce((a, p) => a + cnt[p][k], 0) / DRINK.length;
  ["h", "o", "m", "c", "w0"].forEach((k) => {
    const mu = mean(k);
    DRINK.forEach((p) => (sc += Math.abs(cnt[p][k] - mu) * (k === "h" ? WEIGHTS.fairHours : WEIGHTS.fairShiftCount)));
  });
  const hours: Record<string, number> = {}; DRINK.forEach((p) => (hours[p] = cnt[p].h));
  return { sc, issues, days, hours, eSup, stars, staffOpens, eWeekend };
}

/** 데모용 담금질 탐색. 실서비스는 OR-Tools로 교체 */
export function solve(ctx: MonthCtx, allowStar: boolean, prev: Roles[] | null, iters = 9000): Roles[] {
  const N = daysIn(ctx.m);
  let best: Roles[] | null = null, bestS = Infinity;
  const starts: Roles[][] = [];
  if (prev) starts.push(prev.map((r) => r.slice()));
  for (let k = 0; k < 3; k++) starts.push(Array.from({ length: N }, (_, i) => randomRoles(ctx, i + 1, allowStar)));
  const score = (R: Roles[]) => evaluate(ctx, R, allowStar, false).sc;
  for (const s0 of starts) {
    const R = s0.map((r, i) => { const av = avail(ctx, i + 1); return r.map((w) => (w && w !== "★" && w !== "E" && !av.drink.includes(w) ? null : w === "E" && !av.E ? null : w)); });
    let cur = score(R), temp = 40;
    for (let it = 0; it < iters; it++) {
      temp = Math.max(0.2, temp * 0.9994);
      const i = Math.floor(Math.random() * N), d = i + 1, old = R[i];
      let nr = old.slice(); const mv = Math.random(); const wd = dayType(ctx.m, d, ctx.busy) === "wd";
      if (mv < 0.25) nr = randomRoles(ctx, d, allowStar);
      else if (mv < 0.6) {
        const a = Math.floor(Math.random() * nr.length), b = Math.floor(Math.random() * nr.length);
        if (wd && (a === 0 || b === 0) && (nr[0] === "E" || nr[0] === "★")) continue;
        [nr[a], nr[b]] = [nr[b], nr[a]];
      } else {
        const av = avail(ctx, d); const offStaff = av.drink.filter((x) => !nr.includes(x));
        const opts: string[] = [...offStaff];
        if (wd) { if (av.E) opts.push("E@0"); if (allowStar) opts.push("★@0"); }
        else if (av.E && !nr.includes("E") && isWeekendDate(ctx.m, d)) opts.push("E");
        if (!opts.length) continue;
        const pick = opts[Math.floor(Math.random() * opts.length)];
        if (pick.includes("@0")) nr[0] = pick[0]; else nr[Math.floor(Math.random() * nr.length)] = pick;
      }
      R[i] = nr; const ns = score(R);
      if (ns <= cur || Math.random() < Math.exp((cur - ns) / temp)) { cur = ns; if (cur < bestS) { bestS = cur; best = R.map((r) => r.slice()); } }
      else R[i] = old;
    }
  }
  return best!;
}

// ───── 수당 계산 (월~일 주 단위) ─────
export interface PayRow { tot: number; dOT: number; wOT: number; hol8: number; holOT: number; n: number }
export interface PayWeek { w: [number, number][]; rows: Record<string, PayRow> }
export function payroll(days: Day[], weeks: [number, number][][]): PayWeek[] {
  const H: Record<string, Record<string, number>> = {};
  days.forEach((day) => { const h = dayHours(day); for (const p in h) (H[p] = H[p] || {})[`${day.m}-${day.d}`] = h[p]; });
  return weeks.map((w) => {
    const rows: Record<string, PayRow> = {};
    ALL.forEach((p) => {
      let tot = 0, reg = 0, dOT = 0, hol8 = 0, holOT = 0, n = 0;
      w.forEach(([m, d]) => {
        const v = (H[p] || {})[`${m}-${d}`]; if (!v) return; n++; tot += v;
        if (HOLIDAYS[hkey(m, d)]) { hol8 += Math.min(v, LIMITS.dailyBase); holOT += Math.max(0, v - LIMITS.dailyBase); }
        else { reg += Math.min(v, LIMITS.dailyBase); dOT += Math.max(0, v - LIMITS.dailyBase); }
      });
      rows[p] = { tot, dOT, wOT: Math.max(0, reg - LIMITS.weeklyBase), hol8, holOT, n };
    });
    return { w, rows };
  });
}

/** 근무표 이미지에서 옮긴 기존 근무표 검사: 근무도 휴무도 표시되지 않은 사람 */
export function missingMarks(days: Day[]): Issue[] {
  const out: Issue[] = [];
  days.forEach((day) => {
    const seen = new Set<string>([...day.drink.map((s) => s.who || ""), ...day.off, ...day.lv]);
    if (day.dessert) seen.add("E");
    DRINK.forEach((p) => { if (!seen.has(p)) out.push(["warn", `${mLabel(day.m)}/${day.d} <b>${p}</b>: 근무도 휴무도 표시되지 않음`]); });
  });
  return out;
}

/** 자연어 요청 → 요청 목록 (AI가 없을 때 쓰는 규칙 기반 해석) */
export function ruleParse(text: string): Req[] {
  const out: Req[] = [];
  text.split(/[,\n]|그리고/).forEach((seg) => {
    const who = (seg.match(/[A-F]/) || [])[0]; if (!who) return;
    const nums = [...seg.matchAll(/(\d{1,2})\s*일/g)].map((m) => +m[1]);
    const type = /연차/.test(seg) ? "lv" : "off";
    nums.forEach((day) => { if (day >= 1 && day <= 31) out.push({ who, day, type }); });
  });
  return out;
}

// ───── 대타·교환 ─────
export interface Swap { id: number; from_code: string; from_day: number; to_code: string; to_day: number | null; note: string | null; status: string }
/** 교환을 근무표에 적용. 불가능하면 이유 문자열 */
export function applySwap(R: Roles[], sw: Swap): Roles[] | string {
  const out = R.map((r) => r.slice());
  const a = out[sw.from_day - 1];
  if (!a) return "날짜가 근무표에 없어요";
  const i = a.indexOf(sw.from_code);
  if (i < 0) return `${sw.from_day}일에 ${sw.from_code} 근무가 없어요`;
  if (a.includes(sw.to_code)) return `${sw.from_day}일에 ${sw.to_code}도 이미 근무예요`;
  a[i] = sw.to_code;
  if (sw.to_day) {
    const b = out[sw.to_day - 1];
    if (!b) return "날짜가 근무표에 없어요";
    const j = b.indexOf(sw.to_code);
    if (j < 0) return `${sw.to_day}일에 ${sw.to_code} 근무가 없어요`;
    if (b.includes(sw.from_code)) return `${sw.to_day}일에 ${sw.from_code}도 이미 근무예요`;
    b[j] = sw.from_code;
  }
  return out;
}

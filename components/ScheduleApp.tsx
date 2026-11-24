"use client";
import { useMemo, useState, type ReactNode } from "react";
import Calendar from "./Calendar";
import PayTables from "./PayTables";
import RulesPanel from "./RulesPanel";
import {
  avail, dayType, dow, evaluate, fmtH, hkey, missingMarks, payroll, ruleParse, slotTimes, solve, weeksOf,
  type MonthCtx, type Req, type Roles,
} from "@/lib/engine";
import { NOV_2026, NOV_NOTES } from "@/lib/nov2026";
import { ALL, DRINK, HOLIDAYS, SHIFT, WEEKDAY_KO } from "@/lib/rules";

const MONTH = 12; // 편성할 달
type Tab = "rules" | "req" | "dec" | "pay" | "nov";
const EXAMPLES = ["C 24일 연차 쓸게요", "A는 31일 쉬고 싶어요, B는 25일 연차", "D 12월 19일 20일 휴무 희망합니다", "E 23일 연차"];

export default function ScheduleApp() {
  const [tab, setTab] = useState<Tab>("rules");
  const [reqs, setReqs] = useState<Req[]>([]);
  const [allowStar, setAllowStar] = useState(true);
  const [roles, setRoles] = useState<Roles[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editDay, setEditDay] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  const ctx: MonthCtx = useMemo(() => ({ m: MONTH, reqs, prevDays: NOV_2026.slice(23) }), [reqs]);
  const ev = useMemo(() => (roles ? evaluate(ctx, roles, allowStar) : null), [ctx, roles, allowStar]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(""), 1800); };
  const runSolve = () => {
    setBusy(true);
    setTimeout(() => {
      const t = performance.now();
      setRoles(solve(ctx, allowStar, roles));
      setMs(performance.now() - t); setDirty(false); setBusy(false); flash("12월 근무표를 짰어요");
    }, 30);
  };
  const go = (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); if ((t === "dec" || t === "pay") && !roles && !busy) runSolve(); };
  const addReqs = (list: Req[]) => {
    setReqs((prev) => {
      let next = prev.slice();
      list.forEach((r) => { if (!ALL.includes(r.who as never) || r.day < 1 || r.day > 31) return; next = next.filter((x) => !(x.who === r.who && x.day === r.day)); next.push(r); });
      return next.sort((a, b) => a.day - b.day || a.who.localeCompare(b.who));
    });
    setDirty(true);
  };

  return (
    <div className="wrap">
      <div className="top">
        <div className="badge">카페 A 근무표 자동 편성</div>
        <p>10·11월 실제 근무표에서 찾은 규칙으로 12월 근무표와 수당표를 자동으로 만듭니다.</p>
      </div>
      <nav className="tabs">
        {([["rules", "① 찾아낸 규칙"], ["req", "② 휴무·연차 요청"], ["dec", "③ 12월 근무표"], ["pay", "④ 12월 수당표"], ["nov", "⑤ 11월 근무표 검사"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => go(k)}>{l}</button>
        ))}
      </nav>

      {tab === "rules" && <RulesPanel />}
      {tab === "req" && <Requests reqs={reqs} onAdd={addReqs} onRemove={(i) => { setReqs(reqs.filter((_, j) => j !== i)); setDirty(true); }} />}

      {tab === "dec" && (
        <>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div><h2>12월 근무표 자동 편성</h2><p className="hint" style={{ margin: 0 }}>날짜를 누르면 직접 고칠 수 있어요. 고치면 바로 규칙을 다시 검사합니다.</p></div>
              <div className="row">
                <label className="mini row" style={{ gap: 4 }}><input type="checkbox" checked={allowStar} onChange={(e) => { setAllowStar(e.target.checked); setDirty(true); }} /> ★ 오픈 허용</label>
                <button className="btn pink" disabled={busy} onClick={runSolve}>{busy ? <><span className="spin" />편성 중…</> : "⚡ 자동 편성"}</button>
                {ev && <button className="btn line small" onClick={() => copyText(ev.days, flash)}>카톡용 복사</button>}
              </div>
            </div>
            {ev && (
              <>
                <div className="kpis">
                  <Kpi l="규칙 위반" v={`${ev.issues.filter((x) => x[0] === "bad").length}건`} color={ev.issues.some((x) => x[0] === "bad") ? "var(--red)" : "#0b6e2f"} />
                  <Kpi l="평일 오픈" v={<>{ev.staffOpens}<small> 직원</small> {ev.eSup}<small> E지원</small> {ev.stars}<small> ★</small></>} />
                  <Kpi l="음료 직원 월 근로시간" v={<>{fmtH(Math.min(...Object.values(ev.hours)))}~{fmtH(Math.max(...Object.values(ev.hours)))}<small>h</small></>} />
                  <Kpi l="E 조퇴 가능 일수" v={<>{ev.eSup}<small>일 (음료 오픈 지원)</small></>} />
                  <Kpi l="편성 시간" v={<>{ms != null ? (ms / 1000).toFixed(1) : "–"}<small>초</small></>} />
                </div>
                <div className="alerts">
                  {dirty && <div className="a-warn">요청이나 설정이 바뀌었어요. <b>⚡ 자동 편성</b>을 눌러 다시 짜 주세요.</div>}
                  {reqs.length > 0 && <div className="a-ok">✓ 휴무·연차 요청 {reqs.length}건 반영</div>}
                  {ev.issues.length ? ev.issues.map(([t, m], i) => <div key={i} className={`a-${t}`} dangerouslySetInnerHTML={{ __html: `${t === "bad" ? "⛔" : "⚠️"} ${m}` }} />)
                    : <div className="a-ok">✓ 주 52시간·주 1회 휴무·필수 자리 모두 지켰어요. 12/25 성탄절은 토요일형으로 편성했어요.</div>}
                </div>
              </>
            )}
          </div>
          <div className="card" style={{ padding: 12 }}>
            {ev ? <Calendar days={ev.days} m={MONTH} title="카페 A 2026년 12월 스케줄표" onPick={setEditDay}
              flags={new Set(ev.issues.map(([, m]) => { const x = m.match(/12\/(\d+)/); return x ? +x[1] : 0; }).filter(Boolean))} />
              : <p className="hint">편성 중…</p>}
          </div>
        </>
      )}

      {tab === "pay" && ev && (
        <div className="card">
          <h2>12월 수당표 (자동 계산)</h2>
          <p className="hint">근무표에서 바로 계산합니다. 주 단위는 월~일, 첫 주는 11/30 실제 근무 포함.</p>
          <PayTables weeks={payroll([NOV_2026[29], ...ev.days], weeksOf(MONTH))} title="12월" partialNote="12월분만 · 1월과 합산 필요" />
          <div className="notice"><b>※ 12월 스케줄 자동 점검</b><br />- 12/25 성탄절 근무는 휴일근로로 분리 계산<br />- 야간근로(22시 이후)는 기존처럼 22:00~22:10 퇴근 시 미포함으로 가정</div>
        </div>
      )}

      {tab === "pay" && !ev && <div className="card"><p className="hint">편성 중…</p></div>}
      {tab === "nov" && <NovCheck />}

      {editDay != null && roles && (
        <DayEditor d={editDay} ctx={ctx} roles={roles} allowStar={allowStar}
          onChange={(i, v) => setRoles(roles.map((r, k) => (k === editDay - 1 ? r.map((x, j) => (j === i ? v : x)) : r)))}
          onClose={() => setEditDay(null)} />
      )}
      <div className={`toast ${toast ? "on" : ""}`}>{toast}</div>
    </div>
  );
}

function Kpi({ l, v, color }: { l: string; v: ReactNode; color?: string }) {
  return <div className="kpi"><div className="l">{l}</div><div className="v" style={color ? { color } : undefined}>{v}</div></div>;
}

async function copyText(days: ReturnType<typeof evaluate>["days"], flash: (m: string) => void) {
  const txt = "카페 A 12월 스케줄\n" + days.map((day) => `${day.d}(${WEEKDAY_KO[dow(MONTH, day.d)]}) 음료 ${day.star ? "★ " : ""}${day.drink.map((s) => (s.who ? `${s.who} ${s.t}` : "빈자리")).join(", ")}${day.dessert ? " / 디저트 E" : ""}${day.f ? " / F 1430-마감" : ""} / 휴무 ${day.off.join("") || "-"}${day.lv.length ? " 연차 " + day.lv.join("") : ""}`).join("\n");
  try { await navigator.clipboard.writeText(txt); flash("단톡방에 붙여넣을 수 있게 복사했어요"); } catch { flash("복사가 막혀 있어요"); }
}

function Requests({ reqs, onAdd, onRemove }: { reqs: Req[]; onAdd: (r: Req[]) => void; onRemove: (i: number) => void }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<{ list: Req[]; mode: string; summary?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState("A"); const [day, setDay] = useState(1); const [type, setType] = useState<"lv" | "off">("lv");
  const parse = async () => {
    if (!text.trim()) return; setBusy(true);
    let res: { list: Req[]; mode: string; summary?: string } = { list: ruleParse(text), mode: "규칙" };
    try {
      const r = await fetch("/api/parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j.requests)) res = { list: j.requests, mode: "AI", summary: j.summary }; }
    } catch { /* AI 없이 규칙 기반 */ }
    setParsed(res); setBusy(false);
  };
  return (
    <div className="card">
      <h2>직원 휴무·연차 요청</h2>
      <p className="hint">나중에 직원이 카톡·텔레그램으로 보낸 메시지가 여기로 들어옵니다. 문장으로 써도 정리해요.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="예) C 24일 연차, A는 31일 쉬고 싶어요" />
      <div className="examples">{EXAMPLES.map((x) => <button key={x} onClick={() => setText(x)}>{x}</button>)}</div>
      <button className="btn" disabled={busy} onClick={parse}>{busy ? <><span className="spin" />정리 중…</> : "정리하기"}</button>
      {parsed && (
        <div className="parsed">
          <div className="mini">{parsed.mode === "AI" ? "🤖 AI가 정리한 결과" : "🔧 규칙 기반 정리 (AI 키를 넣으면 AI로 정리)"}</div>
          {parsed.summary && <div style={{ fontWeight: 700 }}>{parsed.summary}</div>}
          <ul style={{ margin: "6px 0" }}>
            {parsed.list.length ? parsed.list.map((r, i) => <li key={i}><b>{r.who}</b> 12/{r.day} → {r.type === "lv" ? "연차" : "휴무 희망"}</li>) : <li>요청을 찾지 못했어요</li>}
          </ul>
          {parsed.list.length > 0 && <button className="btn small" onClick={() => { onAdd(parsed.list); setParsed(null); setText(""); }}>이렇게 반영</button>}
        </div>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <span className="mini">직접 추가:</span>
        <select value={who} onChange={(e) => setWho(e.target.value)}>{ALL.map((p) => <option key={p}>{p}</option>)}</select>
        <select value={day} onChange={(e) => setDay(+e.target.value)}>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>12/{i + 1} ({WEEKDAY_KO[dow(MONTH, i + 1)]})</option>)}</select>
        <select value={type} onChange={(e) => setType(e.target.value as "lv" | "off")}><option value="lv">연차</option><option value="off">휴무 희망</option></select>
        <button className="btn small line" onClick={() => onAdd([{ who, day, type }])}>추가</button>
      </div>
      <div className="reqList">
        {reqs.length ? reqs.map((r, i) => (
          <div className="req" key={`${r.who}-${r.day}`}>
            <span><b>{r.who}</b> · 12/{r.day} ({WEEKDAY_KO[dow(MONTH, r.day)]}) <span className={`chip ${r.type === "lv" ? "c-lv" : "c-off"}`}>{r.type === "lv" ? "연차" : "휴무 희망"}</span></span>
            <button className="btn small line" onClick={() => onRemove(i)}>삭제</button>
          </div>
        )) : <div className="mini">아직 요청이 없어요. 요청을 넣고 ③에서 자동 편성을 누르면 반영됩니다.</div>}
      </div>
    </div>
  );
}

function DayEditor({ d, ctx, roles, allowStar, onChange, onClose }: { d: number; ctx: MonthCtx; roles: Roles[]; allowStar: boolean; onChange: (i: number, v: string | null) => void; onClose: () => void }) {
  const type = dayType(MONTH, d), r = roles[d - 1], times = slotTimes(MONTH, d, type), av = avail(ctx, d);
  const names = type === "wd" ? ["오픈", "미들", "마감"] : ["1번째", "2번째", "3번째", "4번째"];
  const ev = evaluate(ctx, roles, allowStar);
  const seen = new Set<string>(), dup = new Set<string>();
  r.forEach((w) => { if (w && w !== "★") { if (seen.has(w)) dup.add(w); seen.add(w); } });
  const rel = ev.issues.filter(([, m]) => r.some((p) => p && m.startsWith(p + ":")) || m.includes(`12/${d} `));
  return (
    <div className="modalBg on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h2 style={{ margin: 0 }}>12월 {d}일 ({WEEKDAY_KO[dow(MONTH, d)]}){HOLIDAYS[hkey(MONTH, d)] ? ` · ${HOLIDAYS[hkey(MONTH, d)]}` : ""}</h2>
        <p className="hint">{type === "wd" ? "평일 음료 3자리" : `${type === "sat" ? "토요일형" : "일요일형"} 음료 4자리`} · 바꾸면 바로 검사합니다</p>
        {r.map((w, i) => {
          const opts: string[] = type === "wd" && i === 0 ? [...DRINK, "E", "★"] : type !== "wd" ? ["", ...DRINK, "E"] : ["", ...DRINK];
          return (
            <div className="slotRow" key={i}>
              <div className="t">{names[i]}<small>{type === "wd" && i === 0 && w === "E" ? `${SHIFT.E} (E 음료 오픈 지원)` : times[i]}</small></div>
              <select value={w || ""} onChange={(e) => onChange(i, e.target.value || null)}>
                {opts.map((o) => <option key={o} value={o}>{o === "" ? "비움" : o === "★" ? "★ (별도 오픈)" : o === "E" ? "E 지원" : o}{o && !["★", "E"].includes(o) && !av.drink.includes(o) ? " – 요청 휴무" : ""}</option>)}
              </select>
            </div>
          );
        })}
        <div className="alerts">
          {dup.size > 0 && <div className="a-bad">⛔ {[...dup].join(",")} 같은 날 두 자리</div>}
          {rel.map(([t, m], i) => <div key={i} className={`a-${t}`} dangerouslySetInnerHTML={{ __html: m }} />)}
          {!dup.size && !rel.length && <div className="a-ok">✓ 문제 없음</div>}
        </div>
        <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={onClose}>완료</button></div>
      </div>
    </div>
  );
}

function NovCheck() {
  const weeks = weeksOf(11).filter((w) => w[0][0] === 11); // 11/2(월)부터
  const pay = payroll(NOV_2026, weeks);
  const findings = [...missingMarks(NOV_2026).map(([, m]) => m), ...NOV_NOTES];
  let max = { p: "", h: 0, w: "" };
  pay.forEach(({ w, rows }) => DRINK.forEach((p) => { if (rows[p].tot > max.h) max = { p, h: rows[p].tot, w: `11/${w[0][1]}~` }; }));
  const over = pay.some(({ rows }) => Object.values(rows).some((r) => r.tot > 52));
  const eSup = NOV_2026.filter((d) => d.type === "wd" && d.drink.some((s) => s.who === "E")).length;
  const stars = NOV_2026.filter((d) => d.star).length;
  return (
    <>
      <div className="card">
        <h2>11월 실제 근무표 자동 검사</h2>
        <p className="hint">기존에 만든 근무표도 같은 엔진으로 검사합니다. (11월 스케줄표를 그대로 옮긴 데이터)</p>
        <div className="kpis">
          <Kpi l="주 52시간 초과" v={over ? "있음" : "없음"} color={over ? "var(--red)" : "#0b6e2f"} />
          <Kpi l="가장 많이 일한 주" v={<>{max.p} {fmtH(max.h)}<small>h · {max.w}</small></>} />
          <Kpi l="E 음료 오픈 지원" v={<>{eSup}<small>일</small></>} />
          <Kpi l="★ 오픈" v={<>{stars}<small>일</small></>} />
        </div>
        <div className="alerts">{findings.map((m, i) => <div key={i} className="a-warn" dangerouslySetInnerHTML={{ __html: `⚠️ ${m}` }} />)}</div>
      </div>
      <div className="card" style={{ padding: 12 }}><Calendar days={NOV_2026} m={11} title="카페 A 2026년 11월 스케줄표 (실제)" flags={new Set([22, 23])} /></div>
      <div className="card"><h2>11월 주별 근로시간</h2><PayTables weeks={pay} title="11/2 ~ 11/30" partialNote="11/30만" /></div>
    </>
  );
}

"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Calendar from "./Calendar";
import PayTables from "./PayTables";
import RulesPanel from "./RulesPanel";
import {
  avail, dayType, daysIn, dow, evaluate, fmtH, hkey, mLabel, missingMarks, payroll, ruleParse, slotTimes, solve, toDay, weeksOf, ymOf,
  type Day, type MonthCtx, type Req, type Roles,
} from "@/lib/engine";
import { NOV_2026, NOV_NOTES } from "@/lib/nov2026";
import { ALL, DRINK, HOLIDAYS, SHIFT, WEEKDAY_KO } from "@/lib/rules";
import { db, store, type DbRequest, type DbStaff } from "@/lib/db";

const MONTHS = [12, 13]; // 편성 가능한 달 (12 = 2026년 12월, 13 = 2027년 1월)
type Tab = "sched" | "req" | "pay" | "links" | "rules" | "nov";
const EXAMPLES = ["C 24일 연차 쓸게요", "A는 31일 쉬고 싶어요, B는 25일 연차", "D 19일 20일 휴무 희망합니다"];
const SESSION_KEY = "cafe_owner_session";

export default function ScheduleApp() {
  const [session, setSession] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setSession(store.get(SESSION_KEY)); setReady(true); }, []);
  if (!ready) return null;
  if (!session) return <Login onLogin={(s) => { store.set(SESSION_KEY, s); setSession(s); }} />;
  return <Owner session={session} onLogout={() => { store.del(SESSION_KEY); setSession(null); }} />;
}

function Login({ onLogin }: { onLogin: (s: string) => void }) {
  const [pass, setPass] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { const s = await db.login(pass.trim()); if (s) onLogin(s); else setErr("비밀번호가 맞지 않아요."); }
    catch { setErr("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."); }
    setBusy(false);
  };
  return (
    <div className="wrap" style={{ maxWidth: 420, paddingTop: 60 }}>
      <div className="badge" style={{ display: "inline-block" }}>카페 A 근무표</div>
      <form className="card" onSubmit={submit}>
        <h2>대표님 로그인</h2>
        <p className="hint">비밀번호를 넣으면 이 기기에서 30일 동안 로그인이 유지돼요.</p>
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="비밀번호" style={{ width: "100%", marginBottom: 10 }} autoFocus />
        <button className="btn" disabled={busy || !pass} style={{ width: "100%" }}>{busy ? "확인 중…" : "들어가기"}</button>
        {err && <div className="alerts"><div className="a-bad">{err}</div></div>}
      </form>
      <p className="mini">직원분은 대표님께 받은 개인 링크로 들어오세요.</p>
    </div>
  );
}

function Owner({ session, onLogout }: { session: string; onLogout: () => void }) {
  const [m, setM] = useState(12);
  const [tab, setTab] = useState<Tab>("sched");
  const [staff, setStaff] = useState<DbStaff[]>([]);
  const [requests, setRequests] = useState<DbRequest[]>([]);
  const [roles, setRoles] = useState<Roles[] | null>(null);
  const [allowStar, setAllowStar] = useState(true);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [prevDays, setPrevDays] = useState<Day[]>([]);
  const [prevNote, setPrevNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [ms, setMs] = useState<number | null>(null);
  const [editDay, setEditDay] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  const ym = ymOf(m);
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 2000); };

  const fail = useCallback((e: unknown) => { if (e instanceof Error && e.message === "unauthorized") onLogout(); else setErr("저장·불러오기에 실패했어요. 인터넷 연결을 확인해 주세요."); }, [onLogout]);

  const load = useCallback(async (keepRoles = false) => {
    setErr("");
    try {
      const st = await db.state(session, ymOf(m));
      setStaff(st.staff); setRequests(st.requests);
      if (!keepRoles) {
        setRoles(st.schedule?.roles ?? null); setAllowStar(st.schedule?.allow_star ?? true);
        setStatus(st.schedule?.status ?? "draft"); setSavedAt(st.schedule?.updated_at ?? null);
      }
      if (m === 12) { setPrevDays(NOV_2026.slice(23)); setPrevNote(""); }
      else {
        const pv = await db.state(session, ymOf(m - 1));
        if (pv.schedule) {
          const pctx: MonthCtx = { m: m - 1, reqs: pv.requests.filter((r) => r.status === "approved").map((r) => ({ who: r.who, day: r.day, type: r.type })), prevDays: [] };
          const n = daysIn(m - 1);
          setPrevDays(Array.from({ length: 7 }, (_, i) => toDay(pctx, n - 6 + i, pv.schedule!.roles[n - 7 + i]))); setPrevNote("");
        } else { setPrevDays([]); setPrevNote(`${mLabel(m - 1)}월 근무표가 저장되어 있지 않아, 첫 주 52시간·연속근무 검사가 ${mLabel(m)}월 날짜만으로 계산돼요.`); }
      }
    } catch (e) { fail(e); }
    setLoading(false);
  }, [session, m, fail]);
  useEffect(() => { setLoading(true); setRoles(null); load(); }, [load]);
  // 직원 요청을 놓치지 않게 30초마다 요청 목록만 새로 불러옴
  useEffect(() => { const t = setInterval(() => load(true), 30000); return () => clearInterval(t); }, [load]);

  const approved: Req[] = useMemo(() => requests.filter((r) => r.status === "approved").map((r) => ({ who: r.who, day: r.day, type: r.type })), [requests]);
  const ctx: MonthCtx = useMemo(() => ({ m, reqs: approved, prevDays }), [m, approved, prevDays]);
  const ev = useMemo(() => (roles ? evaluate(ctx, roles, allowStar) : null), [ctx, roles, allowStar]);
  const pending = requests.filter((r) => r.status === "pending");
  const reqChangedSinceSave = useMemo(() => !!savedAt && requests.some((r) => r.status === "approved" && r.created_at > savedAt), [requests, savedAt]);

  // 저장 (날짜 수정은 0.9초 모아서 저장)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback(async (R: Roles[], st: "draft" | "published", star: boolean) => {
    try { const t = await db.saveSchedule(session, ym, R, star, st); setSavedAt(t); } catch (e) { fail(e); }
  }, [session, ym, fail]);
  const queueSave = (R: Roles[]) => { if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => save(R, status, allowStar), 900); };

  const runSolve = () => {
    setBusy(true);
    setTimeout(async () => {
      const t = performance.now(); const R = solve(ctx, allowStar, roles); setMs(performance.now() - t);
      setRoles(R); await save(R, status, allowStar); setBusy(false); flash(`${mLabel(m)}월 근무표를 짜고 저장했어요`);
    }, 30);
  };
  const publish = async (to: "draft" | "published") => { if (!roles) return; setStatus(to); await save(roles, to, allowStar); flash(to === "published" ? "직원 링크에 근무표를 공개했어요" : "공개를 취소했어요"); };

  const tabs: [Tab, string][] = [["sched", "근무표"], ["req", `요청${pending.length ? ` (${pending.length})` : ""}`], ["pay", "수당표"], ["links", "직원 링크"], ["rules", "규칙"], ["nov", "11월 검사"]];

  return (
    <div className="wrap">
      <div className="top" style={{ justifyContent: "space-between" }}>
        <div className="row"><div className="badge">카페 A 근무표</div>
          <select value={m} onChange={(e) => { setRoles(null); setLoading(true); setM(+e.target.value); }} style={{ fontWeight: 800 }}>
            {MONTHS.map((x) => <option key={x} value={x}>{ymOf(x).replace("-", "년 ")}월</option>)}
          </select>
        </div>
        <div className="row">
          {savedAt && <span className="mini">💾 저장됨 {new Date(savedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
          <button className="btn line small" onClick={onLogout}>로그아웃</button>
        </div>
      </div>
      <nav className="tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); window.scrollTo({ top: 0 }); load(true); }}>{l}</button>)}</nav>
      {err && <div className="alerts"><div className="a-bad">{err}</div></div>}
      {loading && <div className="card"><p className="hint">불러오는 중…</p></div>}

      {!loading && tab === "sched" && (
        <>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div><h2>{mLabel(m)}월 근무표</h2><p className="hint" style={{ margin: 0 }}>날짜를 누르면 고칠 수 있어요. 고친 내용은 자동 저장됩니다.</p></div>
              <div className="row">
                <label className="mini row" style={{ gap: 4 }}><input type="checkbox" checked={allowStar} onChange={(e) => setAllowStar(e.target.checked)} /> ★ 오픈 허용</label>
                <button className="btn pink" disabled={busy} onClick={runSolve}>{busy ? <><span className="spin" />편성 중…</> : roles ? "⚡ 다시 편성" : "⚡ 자동 편성"}</button>
                {roles && (status === "published"
                  ? <button className="btn line small" onClick={() => publish("draft")}>공개 취소</button>
                  : <button className="btn small" onClick={() => publish("published")}>직원에게 공개</button>)}
                {ev && <button className="btn line small" onClick={() => copyText(m, ev.days, flash)}>카톡용 복사</button>}
              </div>
            </div>
            <div className="alerts">
              {pending.length > 0 && <div className="a-warn">직원 요청 {pending.length}건이 승인을 기다려요. <a href="#" onClick={(e) => { e.preventDefault(); setTab("req"); }}>요청 탭에서 확인</a></div>}
              {reqChangedSinceSave && <div className="a-warn">근무표 저장 후 승인된 요청이 있어요. <b>⚡ 다시 편성</b>을 누르면 반영돼요.</div>}
              {prevNote && <div className="a-warn">{prevNote}</div>}
              {roles && <div className={status === "published" ? "a-ok" : "a-warn"}>{status === "published" ? "✓ 직원 링크에 공개된 근무표예요." : "아직 직원에게 공개하지 않은 초안이에요."}</div>}
            </div>
            {ev && (
              <>
                <div className="kpis">
                  <Kpi l="규칙 위반" v={`${ev.issues.filter((x) => x[0] === "bad").length}건`} color={ev.issues.some((x) => x[0] === "bad") ? "var(--red)" : "#0b6e2f"} />
                  <Kpi l="평일 오픈" v={<>{ev.staffOpens}<small> 직원</small> {ev.eSup}<small> E지원</small> {ev.stars}<small> ★</small></>} />
                  <Kpi l="음료 직원 월 근로시간" v={<>{fmtH(Math.min(...Object.values(ev.hours)))}~{fmtH(Math.max(...Object.values(ev.hours)))}<small>h</small></>} />
                  <Kpi l="E 조퇴 가능 일수" v={<>{ev.eSup}<small>일</small></>} />
                  {ms != null && <Kpi l="편성 시간" v={<>{(ms / 1000).toFixed(1)}<small>초</small></>} />}
                </div>
                <div className="alerts">
                  {ev.issues.length ? ev.issues.map(([t, msg], i) => <div key={i} className={`a-${t}`} dangerouslySetInnerHTML={{ __html: `${t === "bad" ? "⛔" : "⚠️"} ${msg}` }} />)
                    : <div className="a-ok">✓ 주 52시간·주 1회 휴무·필수 자리 모두 지켰어요.</div>}
                </div>
              </>
            )}
          </div>
          <div className="card" style={{ padding: 12 }}>
            {ev ? <Calendar days={ev.days} m={m} title={`카페 A ${ymOf(m).replace("-", "년 ")}월 스케줄표`} onPick={setEditDay}
              flags={new Set(ev.issues.map(([, msg]) => { const x = msg.match(new RegExp(`^${mLabel(m)}/(\\d+)`)) || msg.match(new RegExp(`${mLabel(m)}/(\\d+)까지`)); return x ? +x[1] : 0; }).filter(Boolean))} />
              : <p className="hint">아직 {mLabel(m)}월 근무표가 없어요. <b>⚡ 자동 편성</b>을 누르세요.</p>}
          </div>
        </>
      )}

      {!loading && tab === "req" && <Requests m={m} session={session} requests={requests} onChange={() => load(true)} onFail={fail} />}

      {!loading && tab === "pay" && (ev ? (
        <div className="card">
          <h2>{mLabel(m)}월 수당표 (자동 계산)</h2>
          <p className="hint">근무표에서 바로 계산합니다. 주 단위는 월~일, 첫 주는 전달 근무 포함.</p>
          <PayTables weeks={payroll([...prevDays, ...ev.days], weeksOf(m))} title={`${mLabel(m)}월`} partialNote={`${mLabel(m)}월분만 · 다음 달과 합산 필요`} />
          <div className="notice"><b>※ 자동 점검</b><br />- 공휴일 근무는 휴일근로로 분리 계산<br />- 야간근로(22시 이후)는 기존처럼 22:00~22:10 퇴근 시 미포함으로 가정</div>
        </div>
      ) : <div className="card"><p className="hint">근무표를 먼저 편성해 주세요.</p></div>)}

      {!loading && tab === "links" && <StaffLinks staff={staff} session={session} flash={flash} onFail={fail} />}
      {tab === "rules" && <RulesPanel />}
      {tab === "nov" && <NovCheck />}

      {editDay != null && roles && (
        <DayEditor m={m} d={editDay} ctx={ctx} roles={roles} allowStar={allowStar}
          onChange={(i, v) => { const R = roles.map((r, k) => (k === editDay - 1 ? r.map((x, j) => (j === i ? v : x)) : r)); setRoles(R); queueSave(R); }}
          onClose={() => setEditDay(null)} />
      )}
      <div className={`toast ${toast ? "on" : ""}`}>{toast}</div>
    </div>
  );
}

function Kpi({ l, v, color }: { l: string; v: ReactNode; color?: string }) {
  return <div className="kpi"><div className="l">{l}</div><div className="v" style={color ? { color } : undefined}>{v}</div></div>;
}

async function copyText(m: number, days: Day[], flash: (t: string) => void) {
  const txt = `카페 A ${mLabel(m)}월 스케줄\n` + days.map((day) => `${day.d}(${WEEKDAY_KO[dow(m, day.d)]}) 음료 ${day.star ? "★ " : ""}${day.drink.map((s) => (s.who ? `${s.who} ${s.t}` : "빈자리")).join(", ")}${day.dessert ? " / 디저트 E" : ""}${day.f ? " / F 1430-마감" : ""} / 휴무 ${day.off.join("") || "-"}${day.lv.length ? " 연차 " + day.lv.join("") : ""}`).join("\n");
  try { await navigator.clipboard.writeText(txt); flash("단톡방에 붙여넣을 수 있게 복사했어요"); } catch { flash("복사가 막혀 있어요"); }
}

const SRC: Record<string, string> = { owner: "대표님 입력", web: "직원 링크", kakao: "카카오톡", telegram: "텔레그램" };

function Requests({ m, session, requests, onChange, onFail }: { m: number; session: string; requests: DbRequest[]; onChange: () => void; onFail: (e: unknown) => void }) {
  const ym = ymOf(m);
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<{ list: Req[]; mode: string; summary?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState("A"); const [day, setDay] = useState(1); const [type, setType] = useState<"lv" | "off">("lv");
  const act = async (f: () => Promise<unknown>) => { setBusy(true); try { await f(); onChange(); } catch (e) { onFail(e); } setBusy(false); };
  const parse = async () => {
    if (!text.trim()) return; setBusy(true);
    let res: { list: Req[]; mode: string; summary?: string } = { list: ruleParse(text), mode: "규칙" };
    try {
      const r = await fetch("/api/parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, month: mLabel(m) }) });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j.requests)) res = { list: j.requests, mode: "AI", summary: j.summary }; }
    } catch { /* 규칙 기반 */ }
    setParsed(res); setBusy(false);
  };
  const pending = requests.filter((r) => r.status === "pending");
  const others = requests.filter((r) => r.status !== "pending");
  const item = (r: DbRequest) => (
    <div className="req" key={r.id}>
      <span><b>{r.who}</b> · {mLabel(m)}/{r.day} ({WEEKDAY_KO[dow(m, r.day)]}) <span className={`chip ${r.type === "lv" ? "c-lv" : "c-off"}`}>{r.type === "lv" ? "연차" : "휴무 희망"}</span>
        {r.status === "rejected" && <span className="chip" style={{ background: "#eee", color: "#777" }}>거절</span>}
        <span className="mini"> · {SRC[r.source] || r.source}{r.note ? ` · "${r.note}"` : ""}</span></span>
      <span className="row" style={{ gap: 4 }}>
        {r.status === "pending" && <><button className="btn small" disabled={busy} onClick={() => act(() => db.setRequest(session, r.id, "approved"))}>승인</button>
          <button className="btn small line" disabled={busy} onClick={() => act(() => db.setRequest(session, r.id, "rejected"))}>거절</button></>}
        {r.status !== "pending" && <button className="btn small line" disabled={busy} onClick={() => act(() => db.setRequest(session, r.id, "deleted"))}>삭제</button>}
      </span>
    </div>
  );
  return (
    <>
      <div className="card">
        <h2>승인 대기 {pending.length}건</h2>
        <p className="hint">직원이 개인 링크로 보낸 요청이에요. 승인한 요청만 자동 편성에 반영됩니다.</p>
        <div className="reqList">{pending.length ? pending.map(item) : <div className="mini">대기 중인 요청이 없어요.</div>}</div>
      </div>
      <div className="card">
        <h2>{mLabel(m)}월 확정 요청</h2>
        <div className="reqList">{others.length ? others.map(item) : <div className="mini">아직 없어요.</div>}</div>
      </div>
      <div className="card">
        <h2>대표님이 직접 넣기</h2>
        <p className="hint">카톡으로 받은 요청을 문장 그대로 붙여넣어도 정리해요. (대표님이 넣은 요청은 바로 승인)</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="예) C 24일 연차, A는 31일 쉬고 싶어요" />
        <div className="examples">{EXAMPLES.map((x) => <button key={x} onClick={() => setText(x)}>{x}</button>)}</div>
        <button className="btn" disabled={busy} onClick={parse}>정리하기</button>
        {parsed && (
          <div className="parsed">
            <div className="mini">{parsed.mode === "AI" ? "🤖 AI가 정리한 결과" : "🔧 규칙 기반 정리"}</div>
            {parsed.summary && <div style={{ fontWeight: 700 }}>{parsed.summary}</div>}
            <ul style={{ margin: "6px 0" }}>{parsed.list.length ? parsed.list.map((r, i) => <li key={i}><b>{r.who}</b> {mLabel(m)}/{r.day} → {r.type === "lv" ? "연차" : "휴무 희망"}</li>) : <li>요청을 찾지 못했어요</li>}</ul>
            {parsed.list.length > 0 && <button className="btn small" disabled={busy} onClick={() => act(async () => { for (const r of parsed.list) if (ALL.includes(r.who as never) && r.day >= 1 && r.day <= daysIn(m)) await db.addRequest(session, ym, r.who, r.day, r.type); setParsed(null); setText(""); })}>이렇게 반영</button>}
          </div>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <select value={who} onChange={(e) => setWho(e.target.value)}>{ALL.map((p) => <option key={p}>{p}</option>)}</select>
          <select value={day} onChange={(e) => setDay(+e.target.value)}>{Array.from({ length: daysIn(m) }, (_, i) => <option key={i} value={i + 1}>{mLabel(m)}/{i + 1} ({WEEKDAY_KO[dow(m, i + 1)]})</option>)}</select>
          <select value={type} onChange={(e) => setType(e.target.value as "lv" | "off")}><option value="lv">연차</option><option value="off">휴무 희망</option></select>
          <button className="btn small line" disabled={busy} onClick={() => act(() => db.addRequest(session, ym, who, day, type))}>추가</button>
        </div>
      </div>
    </>
  );
}

function StaffLinks({ staff, session, flash, onFail }: { staff: DbStaff[]; session: string; flash: (t: string) => void; onFail: (e: unknown) => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const [pw, setPw] = useState("");
  const copy = async (t: string, msg: string) => { try { await navigator.clipboard.writeText(t); flash(msg); } catch { flash("복사가 막혀 있어요"); } };
  const msgFor = (s: DbStaff) => `안녕하세요! 이제 휴무·연차 요청은 아래 개인 링크로 보내주세요.\n근무표 확정 전까지 넣어주시면 자동으로 반영되고, 확정된 근무표도 이 링크에서 볼 수 있어요.\n(본인 전용 링크라 다른 사람에게 공유하지 마세요)\n${origin}/r/${s.token}`;
  return (
    <>
      <div className="card">
        <h2>직원 개인 링크</h2>
        <p className="hint">직원마다 링크가 달라요. 카톡 개인톡으로 한 번만 보내주면, 직원은 앱 설치나 가입 없이 휴무·연차를 요청하고 확정된 근무표를 볼 수 있어요.</p>
        <div className="reqList">
          {staff.map((s) => (
            <div className="req" key={s.code}>
              <span><b>{s.code}</b> <span className="mini">{s.role}</span><br /><span className="mini" style={{ wordBreak: "break-all" }}>{origin}/r/{s.token}</span></span>
              <span className="row" style={{ gap: 4 }}>
                <button className="btn small line" onClick={() => copy(`${origin}/r/${s.token}`, `${s.code} 링크를 복사했어요`)}>링크 복사</button>
                <button className="btn small" onClick={() => copy(msgFor(s), `${s.code}에게 보낼 안내 문구를 복사했어요`)}>안내문 복사</button>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <h2>비밀번호 변경</h2>
        <p className="hint">바꾸면 다른 기기의 로그인은 풀려요. 8자 이상.</p>
        <div className="row"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 비밀번호" />
          <button className="btn small" disabled={pw.length < 8} onClick={async () => { try { await db.changePass(session, pw); setPw(""); flash("비밀번호를 바꿨어요"); } catch (e) { onFail(e); } }}>변경</button></div>
      </div>
    </>
  );
}

function DayEditor({ m, d, ctx, roles, allowStar, onChange, onClose }: { m: number; d: number; ctx: MonthCtx; roles: Roles[]; allowStar: boolean; onChange: (i: number, v: string | null) => void; onClose: () => void }) {
  const type = dayType(m, d), r = roles[d - 1], times = slotTimes(m, d, type), av = avail(ctx, d);
  const names = type === "wd" ? ["오픈", "미들", "마감"] : ["1번째", "2번째", "3번째", "4번째"];
  const ev = evaluate(ctx, roles, allowStar);
  const seen = new Set<string>(), dup = new Set<string>();
  r.forEach((w) => { if (w && w !== "★") { if (seen.has(w)) dup.add(w); seen.add(w); } });
  const rel = ev.issues.filter(([, msg]) => r.some((p) => p && msg.startsWith(p + ":")) || msg.includes(`${mLabel(m)}/${d} `));
  return (
    <div className="modalBg on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <h2 style={{ margin: 0 }}>{mLabel(m)}월 {d}일 ({WEEKDAY_KO[dow(m, d)]}){HOLIDAYS[hkey(m, d)] ? ` · ${HOLIDAYS[hkey(m, d)]}` : ""}</h2>
        <p className="hint">{type === "wd" ? "평일 음료 3자리" : `${type === "sat" ? "토요일형" : "일요일형"} 음료 4자리`} · 바꾸면 바로 검사하고 저장합니다</p>
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
          {rel.map(([t, msg], i) => <div key={i} className={`a-${t}`} dangerouslySetInnerHTML={{ __html: msg }} />)}
          {!dup.size && !rel.length && <div className="a-ok">✓ 문제 없음</div>}
        </div>
        <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={onClose}>완료</button></div>
      </div>
    </div>
  );
}

function NovCheck() {
  const weeks = weeksOf(11).filter((w) => w[0][0] === 11);
  const pay = payroll(NOV_2026, weeks);
  const findings = [...missingMarks(NOV_2026).map(([, msg]) => msg), ...NOV_NOTES];
  let max = { p: "", h: 0, w: "" };
  pay.forEach(({ w, rows }) => DRINK.forEach((p) => { if (rows[p].tot > max.h) max = { p, h: rows[p].tot, w: `11/${w[0][1]}~` }; }));
  const over = pay.some(({ rows }) => Object.values(rows).some((r) => r.tot > 52));
  return (
    <>
      <div className="card">
        <h2>11월 실제 근무표 자동 검사</h2>
        <p className="hint">기존에 만든 근무표도 같은 엔진으로 검사합니다.</p>
        <div className="kpis">
          <Kpi l="주 52시간 초과" v={over ? "있음" : "없음"} color={over ? "var(--red)" : "#0b6e2f"} />
          <Kpi l="가장 많이 일한 주" v={<>{max.p} {fmtH(max.h)}<small>h · {max.w}</small></>} />
          <Kpi l="E 음료 오픈 지원" v={<>{NOV_2026.filter((d) => d.type === "wd" && d.drink.some((s) => s.who === "E")).length}<small>일</small></>} />
          <Kpi l="★ 오픈" v={<>{NOV_2026.filter((d) => d.star).length}<small>일</small></>} />
        </div>
        <div className="alerts">{findings.map((msg, i) => <div key={i} className="a-warn" dangerouslySetInnerHTML={{ __html: `⚠️ ${msg}` }} />)}</div>
      </div>
      <div className="card" style={{ padding: 12 }}><Calendar days={NOV_2026} m={11} title="카페 A 2026년 11월 스케줄표 (실제)" flags={new Set([22, 23])} /></div>
      <div className="card"><h2>11월 주별 근로시간</h2><PayTables weeks={pay} title="11/2 ~ 11/30" partialNote="11/30만" /></div>
    </>
  );
}

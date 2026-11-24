"use client";
// 직원 개인 링크 화면: 휴무·연차 요청 + 공개된 내 근무 보기 (앱 설치·가입 없음)
import { useCallback, useEffect, useState } from "react";
import { daysIn, dow, fmtH, mLabel, toDay, work, ymOf, type Roles } from "@/lib/engine";
import { dDay } from "./OwnerPanels";
import { HOLIDAYS, WEEKDAY_KO } from "@/lib/rules";
import { db } from "@/lib/db";
import Brand from "./Brand";

const MONTHS = [12, 13];
type Info = NonNullable<Awaited<ReturnType<typeof db.staffInfo>>>;
const STATUS: Record<string, [string, string]> = { pending: ["대기", "#fdeee3"], approved: ["승인", "#e3f5e9"], rejected: ["거절", "#eee"] };

export default function StaffPage({ token }: { token: string }) {
  const [m, setM] = useState(12);
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [day, setDay] = useState<number | null>(null);
  const [type, setType] = useState<"lv" | "off">("off");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [swFrom, setSwFrom] = useState<number | "">("");
  const [swTo, setSwTo] = useState("");
  const [swToDay, setSwToDay] = useState<number | "">("");
  const [swNote, setSwNote] = useState("");
  const [swMsg, setSwMsg] = useState("");
  const ym = ymOf(m);

  const load = useCallback(async () => {
    try { setInfo(await db.staffInfo(token, ym)); } catch { setInfo(null); }
  }, [token, ym]);
  useEffect(() => { setInfo(undefined); load(); }, [load]);

  if (info === undefined) return <><Brand /><div className="wrap"><p className="hint">불러오는 중…</p></div></>;
  if (info === null) return <><Brand /><div className="wrap" style={{ maxWidth: 480 }}><div className="card"><h2>링크를 확인해 주세요</h2><p className="hint">유효하지 않은 링크예요. 대표님께 개인 링크를 다시 받아주세요.</p></div></div></>;

  const me = info.code;
  const busyDays = info.month?.busy_days ?? [];
  const myShifts = info.published ? myShiftList(m, info.published, me, busyDays) : null;
  const dd = dDay(info.month?.deadline ?? null, info.today);
  const locked = dd != null && dd < 0;
  const partnerShifts = info.published && swTo && swTo !== "E" ? myShiftList(m, info.published, swTo, busyDays) : [];
  const canSwap = info.published && "ABCD".includes(me);
  const sendSwap = async () => {
    if (!swFrom || !swTo) return; setBusy(true); setSwMsg("");
    try { await db.staffSwap(token, ym, +swFrom, swTo, swToDay ? +swToDay : null, swNote); setSwMsg("신청했어요. 대표님이 승인하면 근무표에 반영돼요."); setSwFrom(""); setSwTo(""); setSwToDay(""); setSwNote(""); await load(); }
    catch { setSwMsg("신청하지 못했어요. 잠시 후 다시 시도해 주세요."); }
    setBusy(false);
  };
  const send = async () => {
    if (!day) return; setBusy(true); setMsg("");
    try { await db.staffRequest(token, ym, day, type, note); setMsg(`${mLabel(m)}/${day} ${type === "lv" ? "연차" : "휴무"} 요청을 보냈어요. 대표님이 확인하면 '승인'으로 바뀌어요.`); setDay(null); setNote(""); await load(); }
    catch (e) { setMsg(e instanceof Error && e.message === "deadline" ? "요청 마감이 지났어요. 대표님께 직접 말씀해 주세요." : "보내지 못했어요. 잠시 후 다시 시도해 주세요."); }
    setBusy(false);
  };

  return (
    <>
    <Brand sub={`· ${me}님`} right={
      <select value={m} onChange={(e) => setM(+e.target.value)}>
        {MONTHS.map((x) => <option key={x} value={x}>{ymOf(x).replace("-", "년 ")}월</option>)}
      </select>} />
    <div className="wrap" style={{ maxWidth: 560 }}>
      <div className="card">
        <h2>{mLabel(m)}월 내 근무</h2>
        {myShifts ? (
          <div className="reqList">
            {myShifts.map((s) => (
              <div className="req" key={s.d}><span><b>{mLabel(m)}/{s.d}</b> ({WEEKDAY_KO[dow(m, s.d)]}){HOLIDAYS[`${ym.slice(0, 4)}-${+ym.slice(5)}-${s.d}`] ? " 🎌" : ""}</span>
                <span>{s.t ? <>{s.t} <span className="mini">({fmtH(work(s.t))}h)</span></> : <span className="mini">{s.label}</span>}</span></div>
            ))}
          </div>
        ) : <p className="hint" style={{ margin: 0 }}>아직 {mLabel(m)}월 근무표가 확정되지 않았어요. 확정되면 여기에 나와요.</p>}
      </div>

      {canSwap && (
        <div className="card">
          <h2>대타·근무 교환 신청</h2>
          <p className="hint">상대방과 먼저 이야기한 뒤 신청해 주세요. 대표님이 승인하면 근무표가 바뀌어요.</p>
          <div className="row">
            <select value={swFrom} onChange={(e) => setSwFrom(e.target.value ? +e.target.value : "")}>
              <option value="">내 근무 날짜</option>
              {myShifts!.filter((s) => s.t).map((s) => <option key={s.d} value={s.d}>{mLabel(m)}/{s.d} ({WEEKDAY_KO[dow(m, s.d)]}) {s.t}</option>)}
            </select>
            <select value={swTo} onChange={(e) => { setSwTo(e.target.value); setSwToDay(""); }}>
              <option value="">누구와</option>
              {info.staff.filter((c) => c !== me && "ABCDE".includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {swTo && (
            <div className="row" style={{ marginTop: 8 }}>
              <select value={swToDay} onChange={(e) => setSwToDay(e.target.value ? +e.target.value : "")}>
                <option value="">대타만 부탁 (내 근무를 {swTo}가 대신)</option>
                {partnerShifts.filter((s) => s.t && s.d !== swFrom).map((s) => <option key={s.d} value={s.d}>교환: {swTo}의 {mLabel(m)}/{s.d} ({WEEKDAY_KO[dow(m, s.d)]}) {s.t} 내가 대신</option>)}
              </select>
            </div>
          )}
          <input type="text" value={swNote} onChange={(e) => setSwNote(e.target.value)} placeholder="사유 (선택)" style={{ width: "100%", marginTop: 8 }} maxLength={100} />
          <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={!swFrom || !swTo || busy} onClick={sendSwap}>신청하기</button>
          {swMsg && <div className="alerts"><div className="a-ok">{swMsg}</div></div>}
          {info.swaps.length > 0 && (
            <div className="reqList" style={{ marginTop: 10 }}>
              {info.swaps.map((s) => (
                <div className="req" key={s.id}>
                  <span className="mini" style={{ color: "var(--ink)" }}>{s.to_day ? `${s.from_code} ${mLabel(m)}/${s.from_day} ↔ ${s.to_code} ${mLabel(m)}/${s.to_day}` : `${mLabel(m)}/${s.from_day} ${s.from_code} → ${s.to_code} 대타`}
                    <span className="chip" style={{ background: STATUS[s.status]?.[1], marginLeft: 6 }}>{STATUS[s.status]?.[0]}</span></span>
                  {s.status === "pending" && s.from_code === me && <button className="btn small line" onClick={async () => { await db.staffSwapCancel(token, s.id); load(); }}>취소</button>}
                </div>))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>휴무·연차 요청</h2>
          {dd != null && <span className="chip" style={{ background: locked ? "var(--hongSoft)" : "var(--moonSoft)", color: locked ? "var(--hong)" : "var(--night)", fontSize: 13 }}>{locked ? "마감됨" : dd === 0 ? "오늘 마감" : `마감 D-${dd}`}</span>}
        </div>
        <p className="hint">{locked ? "요청 마감이 지났어요. 급한 일은 대표님께 직접 말씀해 주세요." : info.month?.deadline ? `${info.month.deadline.slice(5).replace("-", "/")}까지 보내주세요. 날짜를 누르고 보내기를 누르세요.` : "날짜를 누르고 보내기를 누르세요. 근무표 확정 전에 보내주세요."}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 10 }}>
          {WEEKDAY_KO.map((w) => <div key={w} className="mini" style={{ textAlign: "center" }}>{w}</div>)}
          {Array.from({ length: dow(m, 1) }, (_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: daysIn(m) }, (_, i) => {
            const d = i + 1, mine = info.requests.find((r) => r.day === d && r.status !== "rejected"), on = day === d;
            return (
              <button key={d} onClick={() => setDay(on ? null : d)} style={{
                border: on ? "2px solid var(--night)" : "1px solid var(--line)", borderRadius: 9, padding: "8px 0", fontWeight: 700,
                background: on ? "var(--moonSoft)" : mine ? (mine.type === "lv" ? "var(--cheongSoft)" : "var(--hongSoft)") : "#fff", color: dow(m, d) === 0 ? "var(--hong)" : "inherit", fontFamily: "var(--serif)", fontSize: 15,
              }}>{d}</button>
            );
          })}
        </div>
        <div className="row">
          <button className={`btn small ${type === "off" ? "" : "line"}`} onClick={() => setType("off")}>휴무 희망</button>
          <button className={`btn small ${type === "lv" ? "" : "line"}`} onClick={() => setType("lv")}>연차</button>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모 (선택)" style={{ flex: 1, minWidth: 120 }} maxLength={100} />
        </div>
        <button className="btn moon" style={{ width: "100%", marginTop: 10 }} disabled={!day || busy || locked} onClick={send}>
          {day ? `${mLabel(m)}/${day} ${type === "lv" ? "연차" : "휴무"} 요청 보내기` : "날짜를 먼저 고르세요"}
        </button>
        {msg && <div className="alerts"><div className="a-ok">{msg}</div></div>}
      </div>

      <div className="card">
        <h2>내 요청</h2>
        <div className="reqList">
          {info.requests.length ? info.requests.map((r) => (
            <div className="req" key={r.id}>
              <span><b>{mLabel(m)}/{r.day}</b> ({WEEKDAY_KO[dow(m, r.day)]}) {r.type === "lv" ? "연차" : "휴무 희망"}
                <span className="chip" style={{ background: STATUS[r.status]?.[1], marginLeft: 6 }}>{STATUS[r.status]?.[0]}</span>
                {r.note && <span className="mini"> · {r.note}</span>}</span>
              {r.status === "pending" && <button className="btn small line" onClick={async () => { await db.staffCancel(token, r.id); load(); }}>취소</button>}
            </div>
          )) : <div className="mini">아직 보낸 요청이 없어요.</div>}
        </div>
      </div>
      <p className="mini">이 링크는 {me}님 전용이에요. 다른 사람에게 공유하지 마세요.</p>
    </div>
    </>
  );
}

function myShiftList(m: number, roles: Roles[], me: string, busy: number[] = []) {
  const ctx = { m, reqs: [], prevDays: [], busy };
  const out: { d: number; t: string | null; label: string }[] = [];
  roles.forEach((r, i) => {
    const day = toDay(ctx, i + 1, r);
    const s = day.drink.find((x) => x.who === me);
    if (s) out.push({ d: day.d, t: s.t, label: "" });
    else if (me === "E" && day.dessert) out.push({ d: day.d, t: day.dessert, label: "" });
    else if (me === "F" && day.f) out.push({ d: day.d, t: null, label: day.f.replace("-마감", "~마감") });
  });
  return out;
}

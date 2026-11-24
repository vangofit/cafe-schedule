"use client";
// 대표님 화면 보조 패널: 요청 마감·바쁜 날, 대타·교환 승인, 급여 설정·최종 지급분
import { useState } from "react";
import { applySwap, dayType, daysIn, dow, evaluate, fmtH, hkey, mLabel, ymOf, type MonthCtx, type Roles, type Swap } from "@/lib/engine";
import { BUSY_SUGGEST, HOLIDAYS, MIN_WAGE, WEEKDAY_KO } from "@/lib/rules";
import { db, type DbRequest, type DbStaff } from "@/lib/db";
import type { FinalRow } from "@/lib/pay";

export function dDay(deadline: string | null, today: string) {
  if (!deadline) return null;
  const diff = Math.round((new Date(deadline).getTime() - new Date(today).getTime()) / 86400000);
  return diff;
}

export function MonthSettings({ m, session, deadline, busy, today, staff, requests, onSaved, onFail }: {
  m: number; session: string; deadline: string | null; busy: number[]; today: string; staff: DbStaff[]; requests: DbRequest[];
  onSaved: (deadline: string | null, busy: number[]) => void; onFail: (e: unknown) => void;
}) {
  const [busyBusy, setBusyBusy] = useState(false);
  const save = async (dl: string | null, b: number[]) => { setBusyBusy(true); try { await db.setMonth(session, ymOf(m), dl, b); onSaved(dl, b); } catch (e) { onFail(e); } setBusyBusy(false); };
  const dd = dDay(deadline, today);
  const noReq = staff.map((s) => s.code).filter((c) => !requests.some((r) => r.who === c));
  const weekdays = Array.from({ length: daysIn(m) }, (_, i) => i + 1).filter((d) => dow(m, d) >= 1 && dow(m, d) <= 5 && !HOLIDAYS[hkey(m, d)]);
  const sugg = weekdays.filter((d) => BUSY_SUGGEST[hkey(m, d)] && !busy.includes(d));
  const [pick, setPick] = useState<number>(weekdays[0] || 1);
  const first = ymOf(m) + "-01";
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 280px" }}>
          <h2>요청 마감</h2>
          <p className="hint">마감일이 지나면 직원 링크에서 휴무·연차 요청이 잠겨요.</p>
          <div className="row">
            <label className="row" style={{ gap: 6 }}><span className="mini">마감일</span><input type="date" value={deadline ?? ""} max={first} onChange={(e) => save(e.target.value || null, busy)} disabled={busyBusy} style={{ minWidth: 160, minHeight: 40, background: "#fff" }} /></label>
            {!deadline && <span className="mini">눌러서 날짜를 고르세요</span>}
            {dd != null && <span className="chip" style={{ background: dd < 0 ? "var(--hongSoft)" : "var(--moonSoft)", color: dd < 0 ? "var(--hong)" : "var(--night)", fontSize: 13 }}>{dd < 0 ? "마감됨" : dd === 0 ? "오늘 마감" : `D-${dd}`}</span>}
          </div>
          <p className="mini" style={{ marginTop: 8 }}>요청이 아직 없는 직원: <b>{noReq.length ? noReq.join(", ") : "없음"}</b> <span className="mini">(필요 없으면 괜찮아요)</span></p>
        </div>
        <div style={{ flex: "1 1 300px" }}>
          <h2>바쁜 날</h2>
          <p className="hint">평일이라도 손님이 몰릴 날은 주말처럼 음료 4명으로 편성해요.</p>
          <div className="row" style={{ gap: 6 }}>
            {busy.sort((a, b) => a - b).map((d) => (
              <span key={d} className="chip" style={{ background: "var(--night)", color: "var(--moonSoft)", fontSize: 13, padding: "4px 10px" }}>
                {mLabel(m)}/{d}({WEEKDAY_KO[dow(m, d)]}) <a href="#" style={{ color: "var(--moon)", marginLeft: 4 }} onClick={(e) => { e.preventDefault(); save(deadline, busy.filter((x) => x !== d)); }}>✕</a>
              </span>))}
            {!busy.length && <span className="mini">지정된 날 없음</span>}
          </div>
          {sugg.length > 0 && <div className="row" style={{ marginTop: 8, gap: 6 }}><span className="mini">추천:</span>
            {sugg.map((d) => <button key={d} className="btn small line" disabled={busyBusy} onClick={() => save(deadline, [...busy, d])}>+ {mLabel(m)}/{d} {BUSY_SUGGEST[hkey(m, d)]}</button>)}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <select value={pick} onChange={(e) => setPick(+e.target.value)}>{weekdays.filter((d) => !busy.includes(d)).map((d) => <option key={d} value={d}>{mLabel(m)}/{d} ({WEEKDAY_KO[dow(m, d)]})</option>)}</select>
            <button className="btn small" disabled={busyBusy || busy.includes(pick)} onClick={() => save(deadline, [...busy, pick])}>바쁜 날로 지정</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SwapsPanel({ m, session, swaps, roles, ctx, allowStar, onApply, onChanged, onFail }: {
  m: number; session: string; swaps: Swap[]; roles: Roles[] | null; ctx: MonthCtx; allowStar: boolean;
  onApply: (R: Roles[]) => Promise<void>; onChanged: () => void; onFail: (e: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pending = swaps.filter((s) => s.status === "pending");
  const done = swaps.filter((s) => s.status !== "pending");
  const baseBad = roles ? evaluate(ctx, roles, allowStar).issues.filter((x) => x[0] === "bad").length : 0;
  const desc = (s: Swap) => s.to_day ? `${s.from_code}의 ${mLabel(m)}/${s.from_day} ↔ ${s.to_code}의 ${mLabel(m)}/${s.to_day} 교환` : `${mLabel(m)}/${s.from_day} ${s.from_code} 근무를 ${s.to_code}가 대신 (대타)`;
  return (
    <div className="card">
      <h2>대타·근무 교환 {pending.length ? `(${pending.length})` : ""}</h2>
      <p className="hint">직원이 개인 링크로 신청해요. 승인하면 근무표에 바로 반영되고, 규칙에 걸리면 미리 알려드려요.</p>
      <div className="reqList">
        {pending.map((s) => {
          const res = roles ? applySwap(roles, s) : "근무표가 없어요";
          const after = typeof res === "string" ? null : evaluate(ctx, res, allowStar).issues.filter((x) => x[0] === "bad");
          const worse = after ? after.length > baseBad : false;
          return (
            <div className="req" key={s.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div><b>{desc(s)}</b>{s.note && <span className="mini"> · &quot;{s.note}&quot;</span>}</div>
              {typeof res === "string" ? <div className="alerts"><div className="a-bad">적용 불가: {res}</div></div>
                : worse ? <div className="alerts">{after!.slice(0, 3).map(([, msg], i) => <div key={i} className="a-bad" dangerouslySetInnerHTML={{ __html: `승인하면: ${msg}` }} />)}</div>
                : <div className="alerts"><div className="a-ok">✓ 승인해도 규칙 문제 없음</div></div>}
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn small" disabled={busy || typeof res === "string"} onClick={async () => { setBusy(true); try { await onApply(res as Roles[]); await db.setSwap(session, s.id, "approved"); onChanged(); } catch (e) { onFail(e); } setBusy(false); }}>{worse ? "그래도 승인" : "승인"}</button>
                <button className="btn small line" disabled={busy} onClick={async () => { setBusy(true); try { await db.setSwap(session, s.id, "rejected"); onChanged(); } catch (e) { onFail(e); } setBusy(false); }}>거절</button>
              </div>
            </div>
          );
        })}
        {!pending.length && <div className="mini">대기 중인 교환 신청이 없어요.</div>}
        {done.slice(0, 10).map((s) => <div className="req" key={s.id}><span className="mini">{desc(s)}</span><span className="chip" style={{ background: s.status === "approved" ? "var(--ssukSoft)" : "#eee" }}>{s.status === "approved" ? "승인" : "거절"}</span></div>)}
      </div>
    </div>
  );
}

export function PayPanel({ session, staff, final, year, onSaved, onFail, onExcel }: {
  session: string; staff: DbStaff[]; final: FinalRow[]; year: number; onSaved: () => void; onFail: (e: unknown) => void; onExcel: () => void;
}) {
  const minW = MIN_WAGE[year];
  const [edit, setEdit] = useState<Record<string, { wage: string; comp: string }>>(() => Object.fromEntries(staff.map((s) => [s.code, { wage: s.wage ? String(s.wage) : "", comp: String(s.comp_ot ?? 0) }])));
  const save = async (code: string) => { const e = edit[code]; try { await db.setStaffPay(session, code, e.wage ? +e.wage : null, +e.comp || 0); onSaved(); } catch (er) { onFail(er); } };
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div><h2>포괄임금 제외한 최종 지급분</h2><p className="hint" style={{ margin: 0 }}>직원별 시급과 &apos;포괄임금에 포함된 월 연장시간&apos;을 넣으면 추가로 줄 시간과 금액을 계산해요.</p></div>
        <button className="btn moon" onClick={onExcel}>📥 정산 엑셀 받기</button>
      </div>
      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table className="tbl" style={{ minWidth: 720 }}>
          <thead><tr><th>직원</th><th>시급(원)</th><th>포괄 포함 연장(h)</th><th>월 근로</th><th>일반 연장</th><th>추가 지급 연장</th><th>휴일근로</th><th>휴일 8h 초과</th><th>야간(22~06)</th><th>예상 추가 수당</th></tr></thead>
          <tbody>
            {final.map((f) => (
              <tr key={f.code}>
                <td><b>{f.code}</b></td>
                <td><input type="number" style={{ width: 90, borderColor: minW && edit[f.code]?.wage && +edit[f.code].wage < minW ? "var(--hong)" : undefined }} value={edit[f.code]?.wage ?? ""} placeholder="미입력" onChange={(e) => setEdit({ ...edit, [f.code]: { ...edit[f.code], wage: e.target.value } })} onBlur={() => save(f.code)} />
                  {minW && edit[f.code]?.wage && +edit[f.code].wage < minW ? <div className="mini" style={{ color: "var(--hong)" }}>최저임금 {minW.toLocaleString()}원 미만</div> : null}</td>
                <td><input type="number" style={{ width: 70 }} value={edit[f.code]?.comp ?? "0"} onChange={(e) => setEdit({ ...edit, [f.code]: { ...edit[f.code], comp: e.target.value } })} onBlur={() => save(f.code)} /></td>
                <td>{fmtH(f.tot)}</td><td>{fmtH(f.generalOT)}</td><td><b>{fmtH(f.payableOT)}</b></td><td>{fmtH(f.hol8)}</td><td>{fmtH(f.holOT)}</td><td>{fmtH(f.night)}</td>
                <td><b>{f.money != null ? `${f.money.toLocaleString()}원` : "—"}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mini" style={{ marginTop: 8 }}>예상 추가 수당 = 추가 지급 연장×시급×1.5 + 휴일근로(8h 이내)×1.5 + 휴일 8h 초과×2.0 + 야간×0.5. 세무사·노무사 확인용 참고값이에요.</p>
      <div className="alerts">
        <div className="a-warn">야간(22:00~06:00) 근로는 실제 일한 시간 기준으로 50% 가산 대상이에요(근로기준법 제56조 제3항). 지금은 근무표의 퇴근 시각(22:30)으로 계산해요. 실제 퇴근이 22:00 전이면 0으로 바뀌어요.</div>
        {(() => { const f = final.find((x) => x.code === "F"); return f && f.maxWeek >= 15 ? <div className="a-warn">F의 주 근로시간이 15시간 이상인 주가 있어요({fmtH(f.maxWeek)}h) → 주휴수당 대상이에요.</div> : f && f.maxWeek > 0 ? <div className="a-ok">F 주 근로시간 최대 {fmtH(f.maxWeek)}h (15시간 미만 → 주휴수당 대상 아님). 마감 시각이 늦어지면 바뀔 수 있어요.</div> : null; })()}
      </div>
    </div>
  );
}

export { dayType };

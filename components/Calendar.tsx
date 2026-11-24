"use client";
// 월영당 스케줄표와 같은 표기로 한 달을 그린다 (820px 이하는 날짜별 카드 목록)
import { dow, fmtH, hkey, work, type Day } from "@/lib/engine";
import { HOLIDAYS, WEEKDAY_KO } from "@/lib/rules";

function Line({ who, t, eSup }: { who: string; t: string; eSup?: boolean }) {
  const w = work(t);
  return (
    <div className={`ln ${eSup ? "eSup" : ""}`}>
      <b>{who}</b>({t}, {w > 8 ? <>8/<span className="ot">{fmtH(w - 8)}</span></> : fmtH(w)})
    </div>
  );
}

export function DayInner({ day }: { day: Day }) {
  return (
    <>
      <div className="lbl">음료</div>
      {day.star && <div className="ln"><b>★</b></div>}
      {day.drink.map((s, i) =>
        s.who ? <Line key={i} who={s.who} t={s.t} eSup={s.who === "E"} /> : (
          <div key={i} className="ln" style={{ color: "var(--red)" }}><b>빈자리</b> ({s.t})</div>
        ))}
      {day.dessert && (<><div className="lbl">디저트</div><Line who="E" t={day.dessert} /></>)}
      {(day.off.length > 0 || day.lv.length > 0) && (
        <>
          <div className="lblR">휴무</div>
          <div className="offs">
            {day.off.join(" ")}
            {day.lv.map((x) => <span key={x} className="lv"> {x}(연)</span>)}
          </div>
        </>
      )}
      {day.f && <div className="fl">F({day.f.replace("-마감", "")}-마감)</div>}
    </>
  );
}

interface Props { days: Day[]; m: number; title: string; onPick?: (d: number) => void; flags?: Set<number> }

export default function Calendar({ days, m, title, onPick, flags }: Props) {
  const first = dow(m, days[0].d === 1 ? 1 : days[0].d);
  const tail = (7 - ((first + days.length) % 7)) % 7;
  const isRed = (d: number) => dow(m, d) === 0 || !!HOLIDAYS[hkey(m, d)];
  return (
    <div>
      <div className="calTitle">
        <div className="badge">{title}</div>
        <span className="legendStar">★음료 직원 - A / B / C / D</span>
        <span className="legendStar">★디저트 직원 - E</span>
        <span className="legendStar">★아르바이트 - F</span>
      </div>
      <div className="cal">
        {WEEKDAY_KO.map((w) => <div key={w} className="dh">{w}</div>)}
        {Array.from({ length: first }, (_, i) => <div key={`b${i}`} className="c blank" />)}
        {days.map((day) => (
          <div key={day.d} className={`c ${onPick ? "edit" : ""}`} onClick={() => onPick?.(day.d)}>
            {flags?.has(day.d) && <span className="flag">!</span>}
            <div className={`dn ${isRed(day.d) ? "red" : ""}`}>
              {day.d}{day.hol ? <small>{day.hol}</small> : day.busy ? <small style={{ color: "var(--moonDeep)" }}>바쁜 날</small> : null}
            </div>
            <DayInner day={day} />
          </div>
        ))}
        {Array.from({ length: tail }, (_, i) => <div key={`t${i}`} className="c blank" />)}
      </div>
      <div className="list">
        {days.map((day) => (
          <div key={day.d} className="dayCard" onClick={() => onPick?.(day.d)} style={onPick ? { cursor: "pointer" } : undefined}>
            {flags?.has(day.d) && <span className="flag">!</span>}
            <div className="hd">
              <span className="d" style={isRed(day.d) ? { color: "#f0505a" } : undefined}>{day.d}</span>
              <span className="w">
                {WEEKDAY_KO[dow(m, day.d)]}{day.hol ? ` · ${day.hol}` : day.busy ? " · 바쁜 날" : ""}
                {day.type !== "wd" && dow(m, day.d) > 0 && dow(m, day.d) < 6 ? " (주말형)" : ""}
              </span>
            </div>
            <DayInner day={day} />
          </div>
        ))}
      </div>
    </div>
  );
}

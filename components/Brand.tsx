// 월영당 헤더: 밤 호수 위 달과 목책교, 물결 반영
import type { ReactNode } from "react";

export function MoonMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="31" fill="#262f47" />
      <circle cx="38" cy="22" r="11" fill="#e8c46b" />
      <circle cx="42.5" cy="19" r="9.5" fill="#262f47" />
      {/* 월영교 */}
      <path d="M8 40 Q32 30 56 40" stroke="#8a6a4a" strokeWidth="2.4" fill="none" />
      {[14, 22, 30, 38, 46, 52].map((x) => <line key={x} x1={x} y1={x < 32 ? 40 - (x - 8) * 0.38 : 40 - (56 - x) * 0.38} x2={x} y2="45" stroke="#8a6a4a" strokeWidth="1.6" />)}
      {/* 물결에 비친 달 */}
      <path d="M18 50h10M33 50h12M22 55h18" stroke="#e8c46b" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

export default function Brand({ sub = "근무표", right }: { sub?: string; right?: ReactNode }) {
  return (
    <header className="brand">
      <div className="in">
        <div className="logo">
          <MoonMark />
          <div className="name">월영당 <span style={{ fontWeight: 400, opacity: 0.8 }}>{sub}</span><small>月映堂 · 안동 월영교</small></div>
        </div>
        {right && <div className="right">{right}</div>}
      </div>
      <svg className="ripple" viewBox="0 0 400 22" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 14 Q25 8 50 14 T100 14 T150 14 T200 14 T250 14 T300 14 T350 14 T400 14" stroke="#e8c46b" strokeWidth=".8" fill="none" opacity=".35" />
        <path d="M0 19 Q30 14 60 19 T120 19 T180 19 T240 19 T300 19 T360 19 T420 19" stroke="#e8c46b" strokeWidth=".6" fill="none" opacity=".2" />
      </svg>
    </header>
  );
}

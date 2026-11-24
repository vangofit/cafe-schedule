"use client";
// 카페 A 수당표 형식: 주별 빨간 박스 + 합산(남색) + 포괄임금 제외 최종 지급분(분홍)
import { fmtH, type PayWeek } from "@/lib/engine";
import { ALL } from "@/lib/rules";

export default function PayTables({ weeks, title, partialNote }: { weeks: PayWeek[]; title: string; partialNote: string }) {
  const sum: Record<string, { tot: number; dOT: number; wOT: number; hol8: number; holOT: number }> = {};
  ALL.forEach((p) => (sum[p] = { tot: 0, dOT: 0, wOT: 0, hol8: 0, holOT: 0 }));
  weeks.forEach(({ rows }) => ALL.forEach((p) => {
    const r = rows[p]; sum[p].tot += r.tot; sum[p].dOT += r.dOT; sum[p].wOT += r.wOT; sum[p].hol8 += r.hol8; sum[p].holOT += r.holOT;
  }));
  return (
    <>
      <div className="weeks">
        {weeks.map(({ w, rows }) => {
          const a = w[0], b = w[w.length - 1];
          return (
            <div className="wk" key={`${a[0]}-${a[1]}`}>
              <h3>{a[0]}월 {a[1]}일 ~ {b[0]}월 {b[1]}일 {w.length < 7 && <span className="mini">({partialNote})</span>}</h3>
              <table>
                <thead><tr><th>직원</th><th>근로</th><th>일8h초과</th><th>주40h초과</th><th>휴일근로</th><th>52h</th></tr></thead>
                <tbody>
                  {ALL.map((p) => {
                    const r = rows[p];
                    if (!r.n) return <tr key={p}><td>{p}</td><td colSpan={5} style={{ color: "#aaa" }}>근무 없음</td></tr>;
                    return (
                      <tr key={p}>
                        <td><b>{p}</b></td><td>{fmtH(r.tot)}</td><td>{fmtH(r.dOT)}</td><td>{fmtH(r.wOT)}</td>
                        <td>{r.hol8 ? `${fmtH(r.hol8)}${r.holOT ? "+" + fmtH(r.holOT) : ""}` : "0"}</td>
                        <td>{r.tot > 52 ? <span className="over">초과</span> : "✓"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
      <div className="sumWrap">
        <div className="sumBox n">
          <h3>{title} 합산</h3>
          <table>
            <thead><tr><th>직원</th><th>근로</th><th>일반 연장(일+주)</th><th>휴일 근로</th><th>휴일 연장</th></tr></thead>
            <tbody>
              {ALL.map((p) => (
                <tr key={p}><td>직원 {p}</td><td>{fmtH(sum[p].tot)}</td><td>{fmtH(sum[p].dOT + sum[p].wOT)}</td><td>{fmtH(sum[p].hol8)}</td><td>{fmtH(sum[p].holOT)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sumBox p">
          <h3>포괄임금 제외한 최종 수당 지급분</h3>
          <p style={{ margin: 0, fontSize: 14 }}>계약서의 포괄임금 포함 시간을 받으면 자동 차감됩니다. (대표님 확인 후 설정)</p>
        </div>
      </div>
    </>
  );
}

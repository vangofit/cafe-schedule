// 포괄임금을 뺀 최종 수당 계산 (수당표의 분홍 칸)
import { ALL, PAY_RATE } from "./rules";
// 야간 가산은 다른 가산과 겹쳐도 별도로 50% 더함 (제56조 제3항)
const NIGHT_RATE = 0.5;
import type { PayWeek } from "./engine";

export interface StaffPay { code: string; wage: number | null; comp_ot: number }
export interface FinalRow { code: string; tot: number; generalOT: number; compOT: number; payableOT: number; hol8: number; holOT: number; night: number; holDays: number; maxWeek: number; money: number | null }

export function finalPay(weeks: PayWeek[], pays: StaffPay[]): FinalRow[] {
  return ALL.map((code) => {
    let tot = 0, generalOT = 0, hol8 = 0, holOT = 0, night = 0, maxWeek = 0;
    weeks.forEach(({ rows }) => { const r = rows[code]; tot += r.tot; generalOT += r.dOT + r.wOT; hol8 += r.hol8; holOT += r.holOT; night += r.night; if (r.n) maxWeek = Math.max(maxWeek, r.tot); });
    const p = pays.find((x) => x.code === code);
    const compOT = p?.comp_ot ?? 0;
    const payableOT = Math.max(0, generalOT - compOT);
    const wage = p?.wage ?? null;
    const money = wage ? Math.round(payableOT * wage * PAY_RATE.overtime + hol8 * wage * PAY_RATE.holidayWithin8 + holOT * wage * PAY_RATE.holidayOver8 + night * wage * NIGHT_RATE) : null;
    return { code, tot, generalOT, compOT, payableOT, hol8, holOT, night, holDays: Math.round((hol8 / 8) * 10) / 10, maxWeek, money };
  });
}

/** 야간 가산 포함 여부를 대표님 포괄임금 계약에서 확인해야 함 — 포괄임금에 야간이 포함돼 있으면 comp에 합쳐 입력 */

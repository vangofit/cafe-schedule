// Supabase 연결 (RPC 함수만 호출 — 테이블은 RLS로 잠겨 있음, supabase/migrations/0001_init.sql 참고)
// URL과 publishable 키는 공개용 값이라 코드에 두어도 된다. 실제 권한은 비밀번호 세션·직원 토큰으로 DB 함수가 검사한다.
import type { Roles, Swap } from "./engine";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://omwnawpubidjcmfhoyps.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_evV8QxyOS4XxJ1NkTtqhSA_AKj8CuGf";

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: SUPABASE_KEY },
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const t = await r.text();
    const err = new Error(/unauthorized/.test(t) ? "unauthorized" : /deadline passed/.test(t) ? "deadline" : t.slice(0, 200));
    throw err;
  }
  const txt = await r.text();
  return (txt ? JSON.parse(txt) : null) as T;
}

export interface DbStaff { code: string; role: string; token: string; wage: number | null; comp_ot: number }
export interface DbRequest { id: number; who: string; day: number; type: "lv" | "off"; note: string | null; source: string; status: "pending" | "approved" | "rejected"; created_at: string }
export interface DbSchedule { roles: Roles[]; allow_star: boolean; status: "draft" | "published"; updated_at: string }
export interface DbMonth { deadline: string | null; busy_days: number[] }
export interface OwnerState { store: { name: string }; staff: DbStaff[]; requests: DbRequest[]; schedule: DbSchedule | null; month: DbMonth | null; swaps: Swap[]; today: string }
export interface StaffInfo {
  code: string; role: string; store: string; today: string; staff: string[];
  requests: { id: number; day: number; type: "lv" | "off"; note: string | null; status: string }[];
  published: Roles[] | null; month: DbMonth | null; swaps: Swap[];
}

export const db = {
  login: (pass: string) => rpc<string | null>("owner_login", { p_pass: pass }),
  state: (s: string, ym: string) => rpc<OwnerState>("owner_state", { p_session: s, p_ym: ym }),
  saveSchedule: (s: string, ym: string, roles: Roles[], allowStar: boolean, status: "draft" | "published") =>
    rpc<string>("owner_save_schedule", { p_session: s, p_ym: ym, p_roles: roles, p_allow_star: allowStar, p_status: status }),
  addRequest: (s: string, ym: string, who: string, day: number, type: "lv" | "off") =>
    rpc<number>("owner_add_request", { p_session: s, p_ym: ym, p_who: who, p_day: day, p_type: type, p_source: "owner" }),
  setRequest: (s: string, id: number, status: "approved" | "rejected" | "pending" | "deleted") =>
    rpc<null>("owner_set_request", { p_session: s, p_id: id, p_status: status }),
  changePass: (s: string, pass: string) => rpc<null>("owner_change_pass", { p_session: s, p_new: pass }),
  setMonth: (s: string, ym: string, deadline: string | null, busy: number[]) =>
    rpc<null>("owner_set_month", { p_session: s, p_ym: ym, p_deadline: deadline, p_busy: busy }),
  setStaffPay: (s: string, code: string, wage: number | null, compOt: number) =>
    rpc<null>("owner_set_staff_pay", { p_session: s, p_code: code, p_wage: wage, p_comp_ot: compOt }),
  setSwap: (s: string, id: number, status: "approved" | "rejected") => rpc<null>("owner_set_swap", { p_session: s, p_id: id, p_status: status }),
  staffInfo: (token: string, ym: string) => rpc<StaffInfo | null>("staff_info", { p_token: token, p_ym: ym }),
  staffSwap: (token: string, ym: string, fromDay: number, toCode: string, toDay: number | null, note: string) =>
    rpc<number>("staff_swap_request", { p_token: token, p_ym: ym, p_from_day: fromDay, p_to_code: toCode, p_to_day: toDay, p_note: note }),
  staffSwapCancel: (token: string, id: number) => rpc<null>("staff_swap_cancel", { p_token: token, p_id: id }),
  staffRequest: (token: string, ym: string, day: number, type: "lv" | "off", note: string) =>
    rpc<number>("staff_request", { p_token: token, p_ym: ym, p_day: day, p_type: type, p_note: note }),
  staffCancel: (token: string, id: number) => rpc<null>("staff_cancel", { p_token: token, p_id: id }),
};

export const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* 저장 불가 브라우저 */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* */ } },
};

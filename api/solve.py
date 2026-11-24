"""
월영당 근무표 편성 엔진 — Google OR-Tools CP-SAT
POST /api/solve  { problem }  →  { roles, status, objective, seconds }

규칙(날짜·시간대·휴게·공휴일 계산)은 TypeScript(lib/cpsat.ts)가 '문제'로 만들어 보내고,
여기서는 그 문제를 수학적으로 푼다. 반드시 지킬 규칙은 제약(hard), 나머지는 점수(soft).

hard: 자리마다 정확히 1명(또는 빈자리 벌점), 하루 1자리, 요청 휴무·연차(가능 인원에서 제외),
      주 52시간, 7일 꽉 찬 주에 하루 이상 휴무, 7일 연속 근무 금지
soft: 빈자리 400, ★ 35, 주말 E 25, E 음료 오픈 10, 월 근로시간·시간대 공평, 마감→다음날 오픈 4, 기존 근무표와 차이 4
"""
import json
import time
from http.server import BaseHTTPRequestHandler

from ortools.sat.python import cp_model


def solve(pb: dict) -> dict:
    t0 = time.time()
    W = pb["weights"]
    people = pb["people"]            # 음료 직원 A~D
    days = pb["days"]
    N = len(days)
    m = cp_model.CpModel()
    H2 = lambda h: int(round(h * 2))  # 0.5시간 단위 정수

    x, e, star, empty = {}, {}, {}, {}
    for i, day in enumerate(days):
        for j, s in enumerate(day["slots"]):
            opts = []
            for p in day["avail"]:
                x[p, i, j] = m.new_bool_var(f"x_{p}_{i}_{j}"); opts.append(x[p, i, j])
            if s.get("allowE"):
                e[i, j] = m.new_bool_var(f"e_{i}_{j}"); opts.append(e[i, j])
            if s.get("allowStar"):
                star[i, j] = m.new_bool_var(f"s_{i}_{j}"); opts.append(star[i, j])
            empty[i, j] = m.new_bool_var(f"empty_{i}_{j}"); opts.append(empty[i, j])
            m.add_exactly_one(opts)
        for p in day["avail"]:
            m.add_at_most_one(x[p, i, j] for j in range(len(day["slots"])) if (p, i, j) in x)
        m.add_at_most_one(e[i, j] for j in range(len(day["slots"])) if (i, j) in e)

    # 사람별 날짜별 근무 여부·시간
    work, hours = {}, {}
    for p in people + ["E"]:
        for i, day in enumerate(days):
            if p == "E":
                ev = [e[i, j] for j in range(len(day["slots"])) if (i, j) in e]
                dess = day.get("eDessert", 0)
                hrs = H2(dess) + sum(H2(day["slots"][j]["eHours"]) * e[i, j] for j in range(len(day["slots"])) if (i, j) in e)
                if dess > 0:
                    work[p, i] = 1
                elif ev:
                    w = m.new_bool_var(f"wE_{i}"); m.add(w == sum(ev)); work[p, i] = w
                else:
                    work[p, i] = 0
                hours[p, i] = hrs
            else:
                xs = [(j, x[p, i, j]) for j in range(len(day["slots"])) if (p, i, j) in x]
                if xs:
                    w = m.new_bool_var(f"w_{p}_{i}"); m.add(w == sum(v for _, v in xs)); work[p, i] = w
                    hours[p, i] = sum(H2(day["slots"][j]["hours"]) * v for j, v in xs)
                else:
                    work[p, i] = 0; hours[p, i] = 0

    # 주 52시간, 꽉 찬 주에 휴무 1일 이상
    overtime_terms = []
    for wk in pb["weeks"]:
        for p in people + ["E"]:
            fx = wk["fixed"].get(p, {"h": 0, "n": 0})
            m.add(sum(hours[p, i] for i in wk["idx"]) + H2(fx["h"]) <= H2(pb["weeklyMax"]))
            if wk["full"]:
                m.add(sum(work[p, i] for i in wk["idx"]) + fx["n"] <= 6)
            if p in people:  # 주 40시간 초과 시간(연장수당 부담)
                ot = m.new_int_var(0, 200, f"ot_{p}_{wk['idx'][0] if wk['idx'] else 0}")
                m.add(ot >= sum(hours[p, i] for i in wk["idx"]) + H2(fx["h"]) - H2(pb["weeklyBase"]))
                overtime_terms.append(ot)

    # 7일 연속 근무 금지 (전달 마지막 날들 포함)
    for p in people + ["E"]:
        seq = [int(b) for b in pb["prevWork"].get(p, [])] + [work[p, i] for i in range(N)]
        for a in range(len(seq) - 6):
            win = seq[a:a + 7]
            if any(not isinstance(v, int) for v in win):
                m.add(sum(win) <= 6)

    obj = []
    obj += [max(1, W["weeklyOverHour"] // 2) * ot for ot in overtime_terms]  # ot는 0.5시간 단위
    obj += [W["emptySlot"] * v for v in empty.values()]
    obj += [W["starOpen"] * v for v in star.values()]
    for (i, j), v in e.items():
        obj.append((W["eOpenSupport"] if days[i]["wd"] else W["eWeekend"]) * v)

    # 공평성: 월 근로시간 차이, 오픈/미들/마감/주말 1번 자리 횟수 차이
    def spread(exprs, name, ub):
        hi = m.new_int_var(0, ub, f"hi_{name}"); lo = m.new_int_var(0, ub, f"lo_{name}")
        for ex in exprs:
            m.add(hi >= ex); m.add(lo <= ex)
        return hi - lo
    tot = [sum(hours[p, i] for i in range(N)) for p in people]
    obj.append(W["fairHours"] * spread(tot, "h", 2 * 24 * 31))
    for kind in ["o", "m", "c", "w0"]:
        cnt = [sum(x[p, i, j] for i, day in enumerate(days) for j, s in enumerate(day["slots"]) if s["kind"] == kind and (p, i, j) in x) for p in people]
        obj.append(W["fairShiftCount"] * 2 * spread(cnt, kind, 31))

    # 마감(22:30 종료) 다음 날 09시 오픈 회피
    for p in people:
        for i in range(N - 1):
            late = [x[p, i, j] for j, s in enumerate(days[i]["slots"]) if s["late"] and (p, i, j) in x]
            early = [x[p, i + 1, j] for j, s in enumerate(days[i + 1]["slots"]) if s["early"] and (p, i + 1, j) in x]
            if late and early:
                b = m.new_bool_var(f"co_{p}_{i}")
                m.add(b >= sum(late) + sum(early) - 1)
                obj.append(W["closeThenOpen"] * b)

    # 재편성: 기존 근무표와 차이 최소화
    prev = pb.get("prev")
    if prev:
        for i, day in enumerate(days):
            if i >= len(prev) or len(prev[i]) != len(day["slots"]):
                continue
            for j in range(len(day["slots"])):
                was = prev[i][j]
                if was in people and (was, i, j) in x:
                    obj.append(W["keepPrev"] * (1 - x[was, i, j]))

    m.minimize(sum(obj))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(pb.get("timeLimit", 8))
    solver.parameters.num_workers = 8
    st = solver.solve(m)
    if st not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"status": solver.status_name(st), "roles": None, "seconds": round(time.time() - t0, 2)}

    roles = []
    for i, day in enumerate(days):
        r = []
        for j in range(len(day["slots"])):
            who = None
            for p in day["avail"]:
                if (p, i, j) in x and solver.value(x[p, i, j]):
                    who = p
            if (i, j) in e and solver.value(e[i, j]):
                who = "E"
            if (i, j) in star and solver.value(star[i, j]):
                who = "★"
            r.append(who)
        roles.append(r)
    return {"status": solver.status_name(st), "roles": roles, "objective": solver.objective_value,
            "bound": solver.best_objective_bound, "seconds": round(time.time() - t0, 2)}


class handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(200, {"ok": True, "engine": "ortools-cp-sat"})

    def do_POST(self):
        try:
            n = int(self.headers.get("content-length", 0))
            if n > 2_000_000:
                return self._send(413, {"error": "too large"})
            pb = json.loads(self.rfile.read(n) or b"{}")
            if len(pb.get("days", [])) > 31 or len(pb.get("people", [])) > 12:
                return self._send(400, {"error": "bad problem"})
            self._send(200, solve(pb))
        except Exception as ex:  # noqa: BLE001
            self._send(500, {"error": str(ex)[:300]})

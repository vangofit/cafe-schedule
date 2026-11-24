"""
카페 근무표 자동 편성 데모 (Google OR-Tools CP-SAT)
- 직원별 가능 요일/시간, 휴무 요청
- 요일·시간대별 필요 인원
- 법규 규칙: 주 최대시간, 하루 최대시간, 주 1일 이상 휴무
- 목표: 필요 인원 최대한 채우기 + 직원 희망 시간에 가깝게 + 공평하게
실행: pip install ortools  →  python cafe_scheduler_demo.py
"""
from ortools.sat.python import cp_model

DAYS = ["월", "화", "수", "목", "금", "토", "일"]
# 시간대(블록): 오픈 / 미들 / 마감, 각 블록 시간(h)
SHIFTS = {"오픈 08-13": 5, "미들 12-17": 5, "마감 17-22": 5}
SHIFT_NAMES = list(SHIFTS)

# 요일×시간대별 필요 인원 (매월/매주 사장님이 바꾸는 값)
DEMAND = {
    "월": [1, 1, 1], "화": [1, 1, 1], "수": [1, 1, 1], "목": [1, 1, 1],
    "금": [1, 2, 2], "토": [2, 2, 2], "일": [2, 2, 1],
}

# 직원 정보: 주 최대시간, 희망 주 시간, 불가능 요일, 불가능 시간대
STAFF = {
    "지은":   {"max_week": 40, "want": 30, "off_days": ["일"], "no_shift": []},
    "민수":   {"max_week": 25, "want": 20, "off_days": ["월", "화"], "no_shift": ["오픈 08-13"]},
    "서연":   {"max_week": 20, "want": 15, "off_days": ["수"], "no_shift": ["마감 17-22"]},
    "도윤":   {"max_week": 30, "want": 25, "off_days": [], "no_shift": []},
    "하린":   {"max_week": 14, "want": 10, "off_days": ["월", "화", "수", "목"], "no_shift": []},  # 주 15시간 미만 유지 희망
    "준호":   {"max_week": 25, "want": 20, "off_days": ["토"], "no_shift": ["오픈 08-13"]},
}
MAX_DAY_HOURS = 8   # 하루 최대 근무 (휴게 제외 기준, 예시값)

m = cp_model.CpModel()
x = {(e, d, s): m.new_bool_var(f"{e}_{d}_{s}")
     for e in STAFF for d in DAYS for s in SHIFT_NAMES}

short = {}
for d in DAYS:
    for i, s in enumerate(SHIFT_NAMES):
        need = DEMAND[d][i]
        # 부족 인원을 변수로 두어 '못 채우면 실패'가 아니라 '부족을 최소화'
        short[d, s] = m.new_int_var(0, need, f"short_{d}_{s}")
        m.add(sum(x[e, d, s] for e in STAFF) + short[d, s] >= need)
        m.add(sum(x[e, d, s] for e in STAFF) <= need)  # 과잉 배치 금지

dev = []
for e, info in STAFF.items():
    for d in DAYS:
        day_hours = sum(SHIFTS[s] * x[e, d, s] for s in SHIFT_NAMES)
        m.add(day_hours <= MAX_DAY_HOURS)
        for s in SHIFT_NAMES:
            if d in info["off_days"] or s in info["no_shift"]:
                m.add(x[e, d, s] == 0)
    week = sum(SHIFTS[s] * x[e, d, s] for d in DAYS for s in SHIFT_NAMES)
    m.add(week <= info["max_week"])
    # 주 1일 이상 완전 휴무 (주휴일 확보)
    works = [m.new_bool_var(f"w_{e}_{d}") for d in DAYS]
    for k, d in enumerate(DAYS):
        for s in SHIFT_NAMES:
            m.add_implication(x[e, d, s], works[k])
    m.add(sum(works) <= 6)
    # 희망 시간과의 차이
    gap = m.new_int_var(0, 60, f"gap_{e}")
    m.add_abs_equality(gap, week - info["want"])
    dev.append(gap)

# 목표: 부족 인원(가중치 100) + 희망시간 차이(가중치 1)
m.minimize(100 * sum(short.values()) + sum(dev))

solver = cp_model.CpSolver()
solver.parameters.max_time_in_seconds = 10
res = solver.solve(m)
print("결과:", solver.status_name(res), f"({solver.wall_time:.2f}초)")

col = 8
print("\n" + "시간대".ljust(12) + "".join(d.ljust(col) for d in DAYS))
for s in SHIFT_NAMES:
    for slot in range(2):
        row = (s if slot == 0 else "").ljust(12)
        for d in DAYS:
            names = [e for e in STAFF if solver.value(x[e, d, s])]
            row += (names[slot] if slot < len(names) else "").ljust(col)
        print(row)

print("\n직원별 주간 시간:")
for e, info in STAFF.items():
    h = sum(SHIFTS[s] * solver.value(x[e, d, s]) for d in DAYS for s in SHIFT_NAMES)
    flag = "  ← 주 15시간 미만" if h < 15 else ""
    print(f"  {e}: {h}h (희망 {info['want']}h, 최대 {info['max_week']}h){flag}")
miss = [(d, s) for (d, s), v in short.items() if solver.value(v) > 0]
print("\n못 채운 자리:", miss if miss else "없음")

// 카페 A 매장 규칙 설정값
// 법규·매장 규칙은 코드에 흩어 두지 않고 이 파일에서만 관리한다.
// (대표님 확인 후 바뀔 수 있는 값은 "확인 필요" 표시)

export const YEAR = 2026;

export const DRINK = ["A", "B", "C", "D"] as const; // 음료 정직원
export const ALL = ["A", "B", "C", "D", "E", "F"] as const; // E: 디저트, F: 주말 아르바이트
export type Staff = (typeof ALL)[number];

export const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

// 공휴일 (key: "YYYY-M-D")
export const HOLIDAYS: Record<string, string> = {
  "2026-10-3": "개천절",
  "2026-10-5": "대체공휴일",
  "2026-10-9": "한글날",
  "2026-12-25": "성탄절",
};

export const F_END = "2210"; // F '마감' 시각 — 확인 필요

// 시간대 (HHMM-HHMM)
export const SHIFT = {
  wdOpen: "0900-1630",
  friOpen: "0900-1800",
  mid: "1230-2230",
  close: "1400-2230",
  E: "0800-1700",
  sat: ["0900-1830", "1100-2230", "1230-2230", "1300-2230"],
  sun: ["0900-1730", "1030-1900", "1230-2230", "1300-2230"],
  F: "1430-마감",
};

export const LIMITS = {
  weeklyMax: 52, // 주 52시간
  dailyBase: 8, // 일 8시간 초과 = 연장
  weeklyBase: 40, // 주 40시간 초과 = 연장
  minWage2027: 10700,
};

// 편성 점수 가중치 (낮을수록 좋은 근무표)
export const WEIGHTS = {
  overWeeklyPerHour: 1000,
  noDayOffInWeek: 800,
  streakOver6: 300,
  emptySlot: 400,
  eOpenSupport: 10,
  starOpen: 35,
  starForbidden: 5000,
  eWeekend: 25,
  fairHours: 3,
  fairShiftCount: 4,
  closeThenOpen: 4,
};

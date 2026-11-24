// 내보내기: 근무표 이미지(PNG), 급여 정산 엑셀(.xlsx)
import { dow, fmtH, mLabel, work, ymOf, type Day, type PayWeek } from "./engine";
import { ALL, WEEKDAY_KO } from "./rules";
import type { FinalRow } from "./pay";

async function deliver(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  // 폰에서는 공유 시트(카톡 바로 보내기), 안 되면 다운로드
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] }) && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch { /* 취소 시 다운로드로 */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 화면 밖에 그려 둔 기존 스케줄표 형식 노드를 PNG로 */
export async function exportImage(node: HTMLElement, m: number) {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
  if (!blob) throw new Error("이미지 생성 실패");
  await deliver(blob, `월영당_${ymOf(m)}_스케줄표.png`);
}

const lineOf = (who: string | null, t: string) => {
  if (!who) return `빈자리(${t})`;
  const w = work(t); return `${who}(${t}, ${w > 8 ? `8/${fmtH(w - 8)}` : fmtH(w)})`;
};

export async function exportExcel(m: number, days: Day[], weeks: PayWeek[], final: FinalRow[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook(); wb.creator = "월영당 근무표";
  const head = (ws: import("exceljs").Worksheet) => { ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } }; ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B2235" } }; ws.views = [{ state: "frozen", ySplit: 1 }]; };

  const s1 = wb.addWorksheet("근무표");
  s1.columns = [{ header: "날짜", width: 8 }, { header: "요일", width: 6 }, { header: "구분", width: 10 }, { header: "음료", width: 70 }, { header: "디저트", width: 22 }, { header: "알바", width: 16 }, { header: "휴무", width: 10 }, { header: "연차", width: 8 }];
  days.forEach((d) => s1.addRow([`${mLabel(m)}/${d.d}`, WEEKDAY_KO[dow(m, d.d)], d.hol || (d.busy ? "바쁜 날" : d.type === "wd" ? "평일" : "주말"),
    [...(d.star ? ["★"] : []), ...d.drink.map((s) => lineOf(s.who, s.t))].join(", "), d.dessert ? lineOf("E", d.dessert) : "", d.f ? `F(${d.f})` : "", d.off.join(" "), d.lv.join(" ")]));
  head(s1);

  const s2 = wb.addWorksheet("주별 근로");
  s2.columns = [{ header: "주", width: 18 }, { header: "직원", width: 6 }, { header: "근로시간", width: 10 }, { header: "일 8h 초과", width: 11 }, { header: "주 40h 초과", width: 11 }, { header: "휴일근로(8h 이내)", width: 16 }, { header: "휴일 8h 초과", width: 12 }, { header: "야간(22~06)", width: 11 }, { header: "52시간", width: 8 }];
  weeks.forEach(({ w, rows }) => ALL.forEach((p) => { const r = rows[p]; if (!r.n) return;
    s2.addRow([`${mLabel(w[0][0])}/${w[0][1]}~${mLabel(w[w.length - 1][0])}/${w[w.length - 1][1]}`, p, r.tot, r.dOT, r.wOT, r.hol8, r.holOT, r.night, r.tot > 52 ? "초과" : "정상"]); }));
  head(s2);

  const s3 = wb.addWorksheet("월 합계·지급분");
  s3.columns = [{ header: "직원", width: 6 }, { header: "월 근로시간", width: 12 }, { header: "일반 연장(합계)", width: 15 }, { header: "포괄임금 포함", width: 13 }, { header: "추가 지급 연장", width: 14 }, { header: "휴일근로(8h 이내)", width: 16 }, { header: "휴일 8h 초과", width: 12 }, { header: "야간(22~06)", width: 11 }, { header: "예상 추가 수당(원)", width: 18 }];
  final.forEach((f) => s3.addRow([f.code, f.tot, f.generalOT, f.compOT, f.payableOT, f.hol8, f.holOT, f.night, f.money ?? "시급 미입력"]));
  s3.addRow([]); s3.addRow(["※ 예상 추가 수당 = 추가 지급 연장×시급×1.5 + 휴일 8h 이내×1.5 + 휴일 8h 초과×2.0 + 야간×0.5 (근로기준법 제56조, 세무사 확인용 참고값)"]);
  head(s3);

  const buf = await wb.xlsx.writeBuffer();
  await deliver(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `월영당_${ymOf(m)}_수당정산.xlsx`);
}

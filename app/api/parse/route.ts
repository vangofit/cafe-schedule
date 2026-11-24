// 직원 요청 문장 → {who, day, type} 목록
// ANTHROPIC_API_KEY 환경변수가 있으면 Claude로, 없으면 503을 돌려주고 화면은 규칙 기반 해석을 쓴다.
export async function POST(req: Request) {
  const { text, month } = (await req.json()) as { text?: string; month?: number };
  const mm = month || 12;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !text) return Response.json({ error: "AI 미설정" }, { status: 503 });
  const prompt = `카페 직원(A~F)의 ${mm}월 휴무·연차 요청 메시지를 구조화하라.
"연차"라고 하면 type "lv", 쉬고 싶다·휴무·빼달라는 "off". 날짜는 ${mm}월의 일(day) 숫자만.
메시지: """${text}"""
JSON만 출력: {"requests":[{"who":"C","day":24,"type":"lv"}],"summary":"한국어 한 문장"}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5", max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) return Response.json({ error: "AI 호출 실패" }, { status: 502 });
  const data = (await r.json()) as { content: { type: string; text?: string }[] };
  const out = data.content.find((c) => c.type === "text")?.text || "";
  try { return Response.json(JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1))); }
  catch { return Response.json({ error: "해석 실패" }, { status: 502 }); }
}

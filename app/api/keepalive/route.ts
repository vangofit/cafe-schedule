// Supabase 무료 플랜은 7일간 활동이 없으면 일시정지된다 → Vercel Cron이 매일 한 번 호출해 DB를 깨워 둔다.
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ping`, {
    method: "POST", cache: "no-store",
    headers: { "content-type": "application/json", apikey: SUPABASE_KEY },
    body: "{}",
  });
  const body = await r.text();
  return new Response(JSON.stringify({ status: r.status, body: r.ok ? JSON.parse(body) : body.slice(0, 200) }), {
    status: r.ok ? 200 : 502, headers: { "content-type": "application/json" },
  });
}

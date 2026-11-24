-- 무료 플랜 일시정지 방지용: Vercel Cron이 매일 호출 (데이터를 읽거나 쓰지 않음, 개수만 셈)
create or replace function public.ping()
returns json language sql security definer set search_path = public as $$
  select json_build_object('ok', true, 'at', now(), 'staff', (select count(*) from staff));
$$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

-- 기능 추가: 요청 마감, 바쁜 날(주말형 편성), 대타·교환, 급여 설정(시급·포괄임금 포함 연장시간)

alter table public.staff add column if not exists wage int;              -- 시급 (원)
alter table public.staff add column if not exists comp_ot numeric not null default 0; -- 월 포괄임금에 포함된 연장시간

create table if not exists public.month_settings (
  store_id uuid not null references public.stores(id) on delete cascade,
  ym text not null check (ym ~ '^\d{4}-\d{2}$'),
  deadline date,                       -- 휴무·연차 요청 마감일 (이날까지 받음)
  busy_days int[] not null default '{}', -- 주말형(음료 4명)으로 편성할 평일
  primary key (store_id, ym)
);
alter table public.month_settings enable row level security;

create table if not exists public.swaps (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  ym text not null,
  from_code text not null, from_day int not null check (from_day between 1 and 31),
  to_code text not null, to_day int check (to_day between 1 and 31), -- to_day 없으면 대타(내 근무를 상대가 대신)
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists swaps_store_ym on public.swaps (store_id, ym);
alter table public.swaps enable row level security;

create or replace function public._today_kst() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- 대표님 상태: 월 설정·교환·급여 설정 포함
create or replace function public.owner_state(p_session text, p_ym text) returns json
language plpgsql security definer set search_path = public stable as $$
declare sid uuid := _require_store(p_session);
begin
  return json_build_object(
    'store', (select json_build_object('name', name) from stores where id = sid),
    'staff', (select coalesce(json_agg(json_build_object('code', code, 'role', role, 'token', token, 'wage', wage, 'comp_ot', comp_ot) order by code), '[]') from staff where store_id = sid and active),
    'requests', (select coalesce(json_agg(json_build_object('id', id, 'who', staff_code, 'day', day, 'type', type, 'note', note, 'source', source, 'status', status, 'created_at', created_at) order by day, staff_code), '[]') from requests where store_id = sid and ym = p_ym),
    'schedule', (select json_build_object('roles', roles, 'allow_star', allow_star, 'status', status, 'updated_at', updated_at) from schedules where store_id = sid and ym = p_ym),
    'month', (select json_build_object('deadline', deadline, 'busy_days', busy_days) from month_settings where store_id = sid and ym = p_ym),
    'swaps', (select coalesce(json_agg(json_build_object('id', id, 'from_code', from_code, 'from_day', from_day, 'to_code', to_code, 'to_day', to_day, 'note', note, 'status', status, 'created_at', created_at) order by created_at desc), '[]') from swaps where store_id = sid and ym = p_ym),
    'today', _today_kst()
  );
end $$;

create or replace function public.owner_set_month(p_session text, p_ym text, p_deadline date, p_busy int[]) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := _require_store(p_session);
begin
  insert into month_settings(store_id, ym, deadline, busy_days) values (sid, p_ym, p_deadline, coalesce(p_busy, '{}'))
  on conflict (store_id, ym) do update set deadline = excluded.deadline, busy_days = excluded.busy_days;
end $$;

create or replace function public.owner_set_staff_pay(p_session text, p_code text, p_wage int, p_comp_ot numeric) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := _require_store(p_session);
begin
  update staff set wage = p_wage, comp_ot = coalesce(p_comp_ot, 0) where store_id = sid and code = p_code;
end $$;

create or replace function public.owner_set_swap(p_session text, p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := _require_store(p_session);
begin
  if p_status not in ('approved','rejected','pending') then raise exception 'bad status'; end if;
  update swaps set status = p_status where id = p_id and store_id = sid;
end $$;

-- 직원: 마감·바쁜 날·교환 정보 포함
create or replace function public.staff_info(p_token text, p_ym text) returns json
language plpgsql security definer set search_path = public stable as $$
declare s record;
begin
  select st.store_id, st.code, st.role, so.name as store_name into s from staff st join stores so on so.id = st.store_id where st.token = p_token and st.active;
  if s is null then return null; end if;
  return json_build_object(
    'code', s.code, 'role', s.role, 'store', s.store_name, 'today', _today_kst(),
    'staff', (select coalesce(json_agg(code order by code), '[]') from staff where store_id = s.store_id and active),
    'requests', (select coalesce(json_agg(json_build_object('id', id, 'day', day, 'type', type, 'note', note, 'status', status) order by day), '[]') from requests where store_id = s.store_id and staff_code = s.code and ym = p_ym),
    'published', (select roles from schedules where store_id = s.store_id and ym = p_ym and status = 'published'),
    'month', (select json_build_object('deadline', deadline, 'busy_days', busy_days) from month_settings where store_id = s.store_id and ym = p_ym),
    'swaps', (select coalesce(json_agg(json_build_object('id', id, 'from_code', from_code, 'from_day', from_day, 'to_code', to_code, 'to_day', to_day, 'note', note, 'status', status) order by created_at desc), '[]') from swaps where store_id = s.store_id and ym = p_ym and (from_code = s.code or to_code = s.code))
  );
end $$;

-- 마감 이후 요청 차단
create or replace function public.staff_request(p_token text, p_ym text, p_day int, p_type text, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare s record; rid bigint; dl date;
begin
  select store_id, code into s from staff where token = p_token and active;
  if s is null then raise exception 'unauthorized'; end if;
  select deadline into dl from month_settings where store_id = s.store_id and ym = p_ym;
  if dl is not null and _today_kst() > dl then raise exception 'deadline passed'; end if;
  if (select count(*) from requests where store_id = s.store_id and staff_code = s.code and ym = p_ym) >= 15 then raise exception 'too many'; end if;
  delete from requests where store_id = s.store_id and staff_code = s.code and ym = p_ym and day = p_day and status = 'pending';
  insert into requests(store_id, staff_code, ym, day, type, note, source, status)
  values (s.store_id, s.code, p_ym, p_day, p_type, left(p_note, 200), 'web', 'pending') returning id into rid;
  return rid;
end $$;

create or replace function public.staff_swap_request(p_token text, p_ym text, p_from_day int, p_to_code text, p_to_day int, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare s record; rid bigint;
begin
  select store_id, code into s from staff where token = p_token and active;
  if s is null then raise exception 'unauthorized'; end if;
  if not exists (select 1 from schedules where store_id = s.store_id and ym = p_ym and status = 'published') then raise exception 'not published'; end if;
  if not exists (select 1 from staff where store_id = s.store_id and code = p_to_code and active) or p_to_code = s.code then raise exception 'bad partner'; end if;
  if (select count(*) from swaps where store_id = s.store_id and ym = p_ym and from_code = s.code and status = 'pending') >= 5 then raise exception 'too many'; end if;
  insert into swaps(store_id, ym, from_code, from_day, to_code, to_day, note)
  values (s.store_id, p_ym, s.code, p_from_day, p_to_code, p_to_day, left(p_note, 200)) returning id into rid;
  return rid;
end $$;

create or replace function public.staff_swap_cancel(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select store_id, code into s from staff where token = p_token and active;
  if s is null then raise exception 'unauthorized'; end if;
  delete from swaps where id = p_id and store_id = s.store_id and from_code = s.code and status = 'pending';
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke execute on function public._today_kst() from public, anon, authenticated;
grant execute on function public.owner_state(text, text), public.owner_set_month(text, text, date, int[]),
  public.owner_set_staff_pay(text, text, int, numeric), public.owner_set_swap(text, bigint, text),
  public.staff_info(text, text), public.staff_request(text, text, int, text, text),
  public.staff_swap_request(text, text, int, text, int, text), public.staff_swap_cancel(text, bigint)
  to anon, authenticated;

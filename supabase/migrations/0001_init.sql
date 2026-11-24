-- 카페 근무표 자동 편성: 기본 스키마
-- 보안 방식: 모든 테이블은 RLS로 잠그고(정책 없음), 브라우저는 아래 SECURITY DEFINER 함수만 호출한다.
--   - 대표님: 비밀번호 → 세션 토큰 → owner_* 함수
--   - 직원: 개인 링크 토큰 → staff_* 함수 (자기 요청만)

create extension if not exists pgcrypto with schema extensions;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_pass_hash text not null,
  created_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null,                 -- A~F (데모 단계는 이니셜)
  role text not null,                 -- 음료 / 디저트 / 알바
  token text not null unique,         -- 직원 개인 요청 링크
  active boolean not null default true,
  unique (store_id, code)
);

create table public.sessions (
  token text primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  expires_at timestamptz not null
);

create table public.requests (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  staff_code text not null,
  ym text not null check (ym ~ '^\d{4}-\d{2}$'),
  day int not null check (day between 1 and 31),
  type text not null check (type in ('lv','off')),  -- lv: 연차, off: 휴무 희망
  note text,
  source text not null default 'owner',              -- owner / web / kakao / telegram
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index on public.requests (store_id, ym);

create table public.schedules (
  store_id uuid not null references public.stores(id) on delete cascade,
  ym text not null check (ym ~ '^\d{4}-\d{2}$'),
  roles jsonb not null,
  allow_star boolean not null default true,
  status text not null default 'draft' check (status in ('draft','published')),
  updated_at timestamptz not null default now(),
  primary key (store_id, ym)
);

alter table public.stores enable row level security;
alter table public.staff enable row level security;
alter table public.sessions enable row level security;
alter table public.requests enable row level security;
alter table public.schedules enable row level security;

-- ───── 내부 도우미 ─────
create or replace function public._store_of_session(p_session text) returns uuid
language sql security definer set search_path = public stable as $$
  select store_id from sessions where token = p_session and expires_at > now()
$$;

create or replace function public._require_store(p_session text) returns uuid
language plpgsql security definer set search_path = public stable as $$
declare sid uuid;
begin
  sid := _store_of_session(p_session);
  if sid is null then raise exception 'unauthorized' using errcode = '28000'; end if;
  return sid;
end $$;

-- ───── 대표님 ─────
create or replace function public.owner_login(p_pass text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare sid uuid; tok text;
begin
  perform pg_sleep(0.3); -- 무차별 대입 완화
  select id into sid from stores where owner_pass_hash = crypt(p_pass, owner_pass_hash) limit 1;
  if sid is null then return null; end if;
  tok := encode(gen_random_bytes(24), 'hex');
  insert into sessions(token, store_id, expires_at) values (tok, sid, now() + interval '30 days');
  delete from sessions where expires_at < now();
  return tok;
end $$;

create or replace function public.owner_state(p_session text, p_ym text) returns json
language plpgsql security definer set search_path = public stable as $$
declare sid uuid := _require_store(p_session);
begin
  return json_build_object(
    'store', (select json_build_object('name', name) from stores where id = sid),
    'staff', (select coalesce(json_agg(json_build_object('code', code, 'role', role, 'token', token) order by code), '[]') from staff where store_id = sid and active),
    'requests', (select coalesce(json_agg(json_build_object('id', id, 'who', staff_code, 'day', day, 'type', type, 'note', note, 'source', source, 'status', status, 'created_at', created_at) order by day, staff_code), '[]') from requests where store_id = sid and ym = p_ym),
    'schedule', (select json_build_object('roles', roles, 'allow_star', allow_star, 'status', status, 'updated_at', updated_at) from schedules where store_id = sid and ym = p_ym)
  );
end $$;

create or replace function public.owner_save_schedule(p_session text, p_ym text, p_roles jsonb, p_allow_star boolean, p_status text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare sid uuid := _require_store(p_session); t timestamptz := now();
begin
  insert into schedules(store_id, ym, roles, allow_star, status, updated_at)
  values (sid, p_ym, p_roles, p_allow_star, coalesce(p_status, 'draft'), t)
  on conflict (store_id, ym) do update set roles = excluded.roles, allow_star = excluded.allow_star, status = excluded.status, updated_at = t;
  return t;
end $$;

create or replace function public.owner_add_request(p_session text, p_ym text, p_who text, p_day int, p_type text, p_source text default 'owner') returns bigint
language plpgsql security definer set search_path = public as $$
declare sid uuid := _require_store(p_session); rid bigint;
begin
  if not exists (select 1 from staff where store_id = sid and code = p_who) then raise exception 'unknown staff'; end if;
  delete from requests where store_id = sid and ym = p_ym and staff_code = p_who and day = p_day;
  insert into requests(store_id, staff_code, ym, day, type, source, status)
  values (sid, p_who, p_ym, p_day, p_type, coalesce(p_source, 'owner'), 'approved') returning id into rid;
  return rid;
end $$;

create or replace function public.owner_set_request(p_session text, p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := _require_store(p_session);
begin
  if p_status = 'deleted' then delete from requests where id = p_id and store_id = sid;
  else update requests set status = p_status where id = p_id and store_id = sid; end if;
end $$;

create or replace function public.owner_change_pass(p_session text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare sid uuid := _require_store(p_session);
begin
  if length(p_new) < 8 then raise exception '비밀번호는 8자 이상'; end if;
  update stores set owner_pass_hash = crypt(p_new, gen_salt('bf')) where id = sid;
  delete from sessions where store_id = sid and token <> p_session;
end $$;

-- ───── 직원 (개인 링크) ─────
create or replace function public.staff_info(p_token text, p_ym text) returns json
language plpgsql security definer set search_path = public stable as $$
declare s record;
begin
  select st.store_id, st.code, st.role, so.name as store_name into s from staff st join stores so on so.id = st.store_id where st.token = p_token and st.active;
  if s is null then return null; end if;
  return json_build_object(
    'code', s.code, 'role', s.role, 'store', s.store_name,
    'requests', (select coalesce(json_agg(json_build_object('id', id, 'day', day, 'type', type, 'note', note, 'status', status) order by day), '[]') from requests where store_id = s.store_id and staff_code = s.code and ym = p_ym),
    'published', (select roles from schedules where store_id = s.store_id and ym = p_ym and status = 'published')
  );
end $$;

create or replace function public.staff_request(p_token text, p_ym text, p_day int, p_type text, p_note text) returns bigint
language plpgsql security definer set search_path = public as $$
declare s record; rid bigint;
begin
  select store_id, code into s from staff where token = p_token and active;
  if s is null then raise exception 'unauthorized'; end if;
  if (select count(*) from requests where store_id = s.store_id and staff_code = s.code and ym = p_ym) >= 15 then raise exception '요청이 너무 많아요'; end if;
  delete from requests where store_id = s.store_id and staff_code = s.code and ym = p_ym and day = p_day and status = 'pending';
  insert into requests(store_id, staff_code, ym, day, type, note, source, status)
  values (s.store_id, s.code, p_ym, p_day, p_type, left(p_note, 200), 'web', 'pending') returning id into rid;
  return rid;
end $$;

create or replace function public.staff_cancel(p_token text, p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select store_id, code into s from staff where token = p_token and active;
  if s is null then raise exception 'unauthorized'; end if;
  delete from requests where id = p_id and store_id = s.store_id and staff_code = s.code and status = 'pending';
end $$;

-- ───── 권한: 테이블은 막고, 공개 함수만 열기 ─────
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.owner_login(text), public.owner_state(text, text),
  public.owner_save_schedule(text, text, jsonb, boolean, text), public.owner_add_request(text, text, text, int, text, text),
  public.owner_set_request(text, bigint, text), public.owner_change_pass(text, text),
  public.staff_info(text, text), public.staff_request(text, text, int, text, text), public.staff_cancel(text, bigint)
  to anon, authenticated;

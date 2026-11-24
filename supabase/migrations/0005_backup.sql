-- 주간 자동 백업: GitHub Actions가 backup_export()를 불러 암호화된 전체 데이터를 비공개 저장소 backups 브랜치에 저장.
-- 내보내는 내용은 OpenPGP 대칭 암호(AES-256)로 잠겨 있어, 누가 호출해도 암호문만 받는다.
-- 암호(passphrase)는 backup_secret 테이블에만 있고 이 파일·저장소에는 없다 (SQL로 따로 넣음).
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.backup_secret (id int primary key default 1 check (id = 1), pass text not null);
alter table public.backup_secret enable row level security;

create or replace function public.backup_export()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare j json; k text;
begin
  select pass into k from backup_secret where id = 1;
  if k is null then raise exception 'backup not configured'; end if;
  select json_build_object(
    'at', now(),
    'stores', (select coalesce(json_agg(t), '[]') from stores t),
    'staff', (select coalesce(json_agg(t), '[]') from staff t),
    'requests', (select coalesce(json_agg(t), '[]') from requests t),
    'schedules', (select coalesce(json_agg(t), '[]') from schedules t),
    'month_settings', (select coalesce(json_agg(t), '[]') from month_settings t),
    'swaps', (select coalesce(json_agg(t), '[]') from swaps t)
  ) into j;
  return armor(pgp_sym_encrypt(j::text, k, 'cipher-algo=aes256, compress-algo=1'));
end $$;
revoke all on function public.backup_export() from public;
grant execute on function public.backup_export() to anon, authenticated;

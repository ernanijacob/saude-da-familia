-- Execute once in Supabase SQL Editor. This creates family-scoped storage and
-- server-enforced membership/administrator checks. The browser never receives
-- a service_role secret.
create extension if not exists pgcrypto;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Minha família',
  invite_code text not null unique default upper(encode(gen_random_bytes(6), 'hex')),
  created_at timestamptz not null default now()
);
create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','user')),
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  updated_at timestamptz not null default now()
);
create table if not exists public.family_data (
  family_id uuid primary key references public.families(id) on delete cascade,
  data jsonb not null default '{"people":[],"shifts":{},"medications":[],"doses":{},"measurements":[],"theme":"light"}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.is_family_member(p_family_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.family_members fm where fm.family_id=p_family_id and fm.user_id=auth.uid());
$$;

create or replace function public.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do update set display_name = excluded.display_name;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

create or replace function public.bootstrap_family(p_family_name text default 'Minha família', p_invite_code text default null)
returns table(family_id uuid, family_name text, member_role text, invite_code text)
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_family public.families%rowtype; v_role text;
begin
  if v_uid is null then raise exception 'É necessário entrar na conta.'; end if;
  select fm.family_id, fm.role into family_id, v_role from public.family_members fm where fm.user_id = v_uid limit 1;
  if family_id is not null then
    select f.* into v_family from public.families f where f.id = family_id;
  elsif nullif(trim(p_invite_code), '') is not null then
    select f.* into v_family from public.families f where f.invite_code = upper(trim(p_invite_code));
    if v_family.id is null then raise exception 'Código de acesso familiar inválido.'; end if;
    insert into public.family_members(family_id,user_id,role) values(v_family.id,v_uid,'user') on conflict do nothing;
    family_id := v_family.id; v_role := 'user';
  else
    insert into public.families(name) values(coalesce(nullif(trim(p_family_name), ''),'Minha família')) returning * into v_family;
    insert into public.family_members(family_id,user_id,role) values(v_family.id,v_uid,'admin');
    insert into public.family_data(family_id) values(v_family.id);
    family_id := v_family.id; v_role := 'admin';
  end if;
  family_name := v_family.name;
  update public.family_data fd set data=jsonb_set(fd.data,'{family}',to_jsonb(v_family.name),true)
  where fd.family_id=v_family.id and not (fd.data ? 'family');
  member_role := v_role;
  invite_code := case when v_role = 'admin' then v_family.invite_code else null end;
  return next;
end; $$;

create or replace function public.save_family_data(p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_family uuid; v_role text; v_old jsonb;
begin
  select fm.family_id, fm.role into v_family, v_role from public.family_members fm where fm.user_id = auth.uid() limit 1;
  if v_family is null then raise exception 'Conta sem espaço familiar.'; end if;
  select fd.data into v_old from public.family_data fd where fd.family_id = v_family;
  if v_role <> 'admin' and v_old is not null and
    ((p_data->'people') is distinct from (v_old->'people') or (p_data->'family') is distinct from (v_old->'family')) then
    raise exception 'Apenas administradores podem alterar pessoas e nome da família.';
  end if;
  insert into public.family_data(family_id,data,updated_at) values(v_family,p_data,now())
  on conflict (family_id) do update set data=excluded.data, updated_at=now();
  if v_role = 'admin' and p_data ? 'family' then
    update public.families set name=coalesce(nullif(trim(p_data->>'family'),''),'Minha família') where id=v_family;
  end if;
end; $$;

create or replace function public.list_family_members()
returns table(user_id uuid, display_name text, email text, role text)
language sql stable security definer set search_path = '' as $$
  select u.id, coalesce(p.display_name, split_part(u.email,'@',1)), u.email, fm.role
  from public.family_members fm join auth.users u on u.id=fm.user_id
  left join public.profiles p on p.id=u.id
  where fm.family_id=(select m.family_id from public.family_members m where m.user_id=auth.uid() limit 1)
  order by coalesce(p.display_name,split_part(u.email,'@',1));
$$;

create or replace function public.update_family_member(p_user_id uuid, p_name text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_family uuid; v_role text; v_admin_count integer;
begin
  select fm.family_id,fm.role into v_family,v_role from public.family_members fm where fm.user_id=auth.uid() limit 1;
  if v_role <> 'admin' then raise exception 'Apenas administradores podem gerenciar contas.'; end if;
  if p_role not in ('admin','user') then raise exception 'Perfil inválido.'; end if;
  if not exists(select 1 from public.family_members where family_id=v_family and user_id=p_user_id) then raise exception 'Conta não pertence a esta família.'; end if;
  select count(*) into v_admin_count from public.family_members where family_id=v_family and role='admin';
  if p_user_id=auth.uid() and p_role <> 'admin' and v_admin_count=1 then raise exception 'Mantenha ao menos um administrador.'; end if;
  update public.family_members set role=p_role where family_id=v_family and user_id=p_user_id;
  update public.profiles set display_name=coalesce(nullif(trim(p_name),''),display_name),updated_at=now() where id=p_user_id;
end; $$;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.profiles enable row level security;
alter table public.family_data enable row level security;
drop policy if exists family_data_read_members on public.family_data;
create policy family_data_read_members on public.family_data for select to authenticated
using (public.is_family_member(family_id));
drop policy if exists family_members_read_siblings on public.family_members;
create policy family_members_read_siblings on public.family_members for select to authenticated
using (public.is_family_member(family_id));
drop policy if exists profiles_read_siblings on public.profiles;
create policy profiles_read_siblings on public.profiles for select to authenticated
using (exists(select 1 from public.family_members sibling where sibling.user_id=profiles.id and public.is_family_member(sibling.family_id)));
revoke all on public.families,public.family_members,public.profiles,public.family_data from anon,authenticated;
grant select on public.family_data,public.family_members,public.profiles to authenticated;
revoke all on function public.is_family_member(uuid), public.bootstrap_family(text,text), public.save_family_data(jsonb), public.list_family_members(), public.update_family_member(uuid,text,text) from public,anon;
grant execute on function public.is_family_member(uuid), public.bootstrap_family(text,text), public.save_family_data(jsonb), public.list_family_members(), public.update_family_member(uuid,text,text) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.family_data;
exception when duplicate_object then null;
end $$;

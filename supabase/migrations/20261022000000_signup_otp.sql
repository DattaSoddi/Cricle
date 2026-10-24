create table if not exists public.circle_signup_otps (
  id uuid primary key,
  phone_hash text not null,
  email_hash text,
  requester_hash text not null,
  phone_code_hash text not null,
  email_code_hash text,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists circle_signup_otps_phone_created_idx
  on public.circle_signup_otps (phone_hash, created_at desc);
create index if not exists circle_signup_otps_email_created_idx
  on public.circle_signup_otps (email_hash, created_at desc)
  where email_hash is not null;
create index if not exists circle_signup_otps_requester_created_idx
  on public.circle_signup_otps (requester_hash, created_at desc);

alter table public.circle_signup_otps enable row level security;
revoke all on public.circle_signup_otps from anon, authenticated;
grant select, insert, update, delete on public.circle_signup_otps to service_role;

create or replace function public.reserve_circle_signup_otp(
  p_challenge_id uuid,
  p_phone_hash text,
  p_email_hash text,
  p_requester_hash text,
  p_phone_code_hash text,
  p_email_code_hash text,
  p_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_count integer;
  lock_key text;
begin
  for lock_key in
    select lock_value
      from unnest(array[
        'phone:' || p_phone_hash,
        case when p_email_hash is null then null else 'email:' || p_email_hash end,
        'requester:' || p_requester_hash
      ]) as keys(lock_value)
      where lock_value is not null
      order by lock_value
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_key, 0));
  end loop;

  if exists (
    select 1 from public.circle_signup_otps
      where phone_hash = p_phone_hash and created_at >= now() - interval '1 minute'
  ) then
    return 'phone_minute';
  end if;
  select count(*) into request_count
    from public.circle_signup_otps
    where phone_hash = p_phone_hash and created_at >= now() - interval '1 hour';
  if request_count >= 5 then
    return 'phone_hour';
  end if;

  if p_email_hash is not null then
    if exists (
      select 1 from public.circle_signup_otps
        where email_hash = p_email_hash and created_at >= now() - interval '1 minute'
    ) then
      return 'email_minute';
    end if;
    select count(*) into request_count
      from public.circle_signup_otps
      where email_hash = p_email_hash and created_at >= now() - interval '1 hour';
    if request_count >= 5 then
      return 'email_hour';
    end if;
  end if;

  if exists (
    select 1 from public.circle_signup_otps
      where requester_hash = p_requester_hash and created_at >= now() - interval '1 minute'
  ) then
    return 'requester_minute';
  end if;
  select count(*) into request_count
    from public.circle_signup_otps
    where requester_hash = p_requester_hash and created_at >= now() - interval '1 hour';
  if request_count >= 10 then
    return 'requester_hour';
  end if;

  insert into public.circle_signup_otps (
    id, phone_hash, email_hash, requester_hash, phone_code_hash, email_code_hash, expires_at
  ) values (
    p_challenge_id, p_phone_hash, p_email_hash, p_requester_hash,
    p_phone_code_hash, p_email_code_hash, p_expires_at
  );
  return 'reserved';
end;
$$;

revoke all on function public.reserve_circle_signup_otp(uuid, text, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reserve_circle_signup_otp(uuid, text, text, text, text, text, timestamptz) to service_role;

create or replace function public.verify_circle_signup_otp(
  p_challenge_id uuid,
  p_phone_code_hash text,
  p_email_code_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge public.circle_signup_otps%rowtype;
begin
  select *
    into challenge
    from public.circle_signup_otps
    where id = p_challenge_id
    for update;

  if not found
    or challenge.verified_at is not null
    or challenge.expires_at <= now()
    or challenge.attempts >= 5 then
    return false;
  end if;

  if challenge.phone_code_hash <> p_phone_code_hash
    or (challenge.email_code_hash is not null and challenge.email_code_hash <> p_email_code_hash) then
    update public.circle_signup_otps
      set attempts = attempts + 1
      where id = p_challenge_id;
    return false;
  end if;

  update public.circle_signup_otps
    set verified_at = now(),
        phone_code_hash = '',
        email_code_hash = null
    where id = p_challenge_id;
  return true;
end;
$$;

revoke all on function public.verify_circle_signup_otp(uuid, text, text) from public, anon, authenticated;
grant execute on function public.verify_circle_signup_otp(uuid, text, text) to service_role;

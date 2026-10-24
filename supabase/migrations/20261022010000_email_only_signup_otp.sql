alter table public.circle_signup_otps
  alter column phone_code_hash drop not null;

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

  if challenge.email_code_hash is null
    or p_email_code_hash is null
    or challenge.email_code_hash <> p_email_code_hash then
    update public.circle_signup_otps
      set attempts = attempts + 1
      where id = p_challenge_id;
    return false;
  end if;

  update public.circle_signup_otps
    set verified_at = now(),
        phone_code_hash = null,
        email_code_hash = null
    where id = p_challenge_id;
  return true;
end;
$$;

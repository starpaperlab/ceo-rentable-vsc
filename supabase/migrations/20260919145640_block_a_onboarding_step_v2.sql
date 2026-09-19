begin;
update public.business_config
set onboarding_step = 9,
    updated_at = timezone('utc', now())
where onboarding_status = 'completed'
  and onboarding_step < 9;
commit;

-- Funções (RPC) chamadas pelo app. Todas exigem usuário logado.

-- Cria o casal do usuário logado (dono) e uma conta de cartão padrão.
create or replace function public.create_household(p_name text, p_display_name text, p_with_default_account boolean default true)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.members where user_id = v_user) then
    raise exception 'already_in_household' using errcode = 'P0001';
  end if;

  insert into public.households (name, created_by) values (trim(p_name), v_user) returning id into v_household;
  insert into public.members (household_id, user_id, display_name, role) values (v_household, v_user, trim(p_display_name), 'owner');

  if p_with_default_account then
    insert into public.accounts (household_id, kind, institution, name)
    values (v_household, 'credit_card', 'santander', 'Santander Unique Visa');
  end if;
  return v_household;
end;
$$;

-- Gera um convite (link) para a pessoa entrar no casal. Só o dono.
create or replace function public.create_invite(p_email text default null)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select household_id into v_household from public.members where user_id = v_user and role = 'owner';
  if v_household is null then raise exception 'not_owner' using errcode = 'P0001'; end if;

  -- só um convite pendente por vez
  delete from public.invites where household_id = v_household and accepted_at is null;
  insert into public.invites (household_id, token, email, created_by)
  values (v_household, v_token, nullif(trim(coalesce(p_email, '')), ''), v_user);
  return v_token;
end;
$$;

-- Pré-visualiza o convite antes de aceitar.
create or replace function public.peek_invite(p_token text)
returns table (household_name text, inviter_name text, valid boolean)
language sql stable security definer
set search_path = public
as $$
  select h.name,
         coalesce(m.display_name, ''),
         (i.accepted_at is null and i.expires_at > now())
  from public.invites i
  join public.households h on h.id = i.household_id
  left join public.members m on m.household_id = i.household_id and m.user_id = i.created_by
  where i.token = p_token and auth.uid() is not null;
$$;

-- Aceita o convite: entra no casal (máximo 2 pessoas).
create or replace function public.accept_invite(p_token text, p_display_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_inv public.invites%rowtype;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.members where user_id = v_user) then
    raise exception 'already_in_household' using errcode = 'P0001';
  end if;

  select * into v_inv from public.invites where token = p_token for update;
  if not found then raise exception 'invite_not_found' using errcode = 'P0001'; end if;
  if v_inv.accepted_at is not null then raise exception 'invite_used' using errcode = 'P0001'; end if;
  if v_inv.expires_at <= now() then raise exception 'invite_expired' using errcode = 'P0001'; end if;
  if (select count(*) from public.members where household_id = v_inv.household_id) >= 2 then
    raise exception 'household_full' using errcode = 'P0001';
  end if;

  insert into public.members (household_id, user_id, display_name, role)
  values (v_inv.household_id, v_user, trim(p_display_name), 'member');
  update public.invites set accepted_by = v_user, accepted_at = now() where id = v_inv.id;
  return v_inv.household_id;
end;
$$;

-- Correção manual → regra do casal + aplica aos lançamentos informados (valem para os dois).
-- O app calcula quais lançamentos casam com a regra usando o mesmo código do core.
create or replace function public.save_rule_and_apply(
  p_pattern text,
  p_match_type text,
  p_category_id smallint,
  p_owner_user_id uuid,
  p_tx_ids uuid[]
) returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid;
  v_count integer;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select household_id into v_household from public.members where user_id = v_user;
  if v_household is null then raise exception 'no_household' using errcode = 'P0001'; end if;
  if p_owner_user_id is not null and not exists (select 1 from public.members where household_id = v_household and user_id = p_owner_user_id) then
    raise exception 'owner_not_in_household' using errcode = 'P0001';
  end if;

  insert into public.rules (household_id, pattern, match_type, category_id, owner_user_id, created_by)
  values (v_household, trim(p_pattern), p_match_type, p_category_id, p_owner_user_id, v_user)
  on conflict (household_id, pattern, match_type)
  do update set category_id = excluded.category_id, owner_user_id = excluded.owner_user_id;

  update public.transactions t
     set category_id = p_category_id,
         category_source = 'rule',
         confidence = 'alta',
         needs_review = false,
         owner_user_id = coalesce(p_owner_user_id, t.owner_user_id)
   where t.household_id = v_household
     and t.id = any (p_tx_ids)
     and (not t.is_private or t.owner_user_id = v_user);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Confirma a fatura. Se a conferência falhou, só com p_force (aceitando a diferença).
create or replace function public.confirm_statement(p_statement_id uuid, p_force boolean default false)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_st public.statements%rowtype;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_st from public.statements where id = p_statement_id for update;
  if not found or not public.is_member(v_st.household_id) then
    raise exception 'statement_not_found' using errcode = 'P0001';
  end if;
  if v_st.reconcile_status = 'fail' and not p_force then
    raise exception 'reconcile_failed' using errcode = 'P0001';
  end if;
  update public.statements
     set status = 'confirmed',
         confirmed_by = v_user,
         confirmed_at = now(),
         forced_diff_cents = case when reconcile_status = 'fail' then computed_total_cents - declared_total_cents else null end
   where id = p_statement_id;
end;
$$;

-- Permissões: só usuários logados chamam as funções.
revoke all on function public.create_household(text, text, boolean) from public, anon;
revoke all on function public.create_invite(text) from public, anon;
revoke all on function public.peek_invite(text) from public, anon;
revoke all on function public.accept_invite(text, text) from public, anon;
revoke all on function public.save_rule_and_apply(text, text, smallint, uuid, uuid[]) from public, anon;
revoke all on function public.confirm_statement(uuid, boolean) from public, anon;
grant execute on function public.create_household(text, text, boolean) to authenticated;
grant execute on function public.create_invite(text) to authenticated;
grant execute on function public.peek_invite(text) to authenticated;
grant execute on function public.accept_invite(text, text) to authenticated;
grant execute on function public.save_rule_and_apply(text, text, smallint, uuid, uuid[]) to authenticated;
grant execute on function public.confirm_statement(uuid, boolean) to authenticated;

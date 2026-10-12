-- Outras fontes de extrato (OFX, JSON) e direitos do titular (sair, remover, excluir, exportar).

-- ───────────── formato de origem e status "não verificável"
alter table public.statements
  add column format text not null default 'santander_pdf' check (format in ('santander_pdf', 'ofx', 'json'));

alter table public.statements drop constraint statements_reconcile_status_check;
alter table public.statements
  add constraint statements_reconcile_status_check check (reconcile_status in ('ok', 'rounding', 'fail', 'unverified'));

-- ───────────── apagar um usuário não pode ser bloqueado por "quem criou/confirmou/era dono"
-- Todas as chaves para auth.users sem regra de exclusão passam a "set null" (colunas deixam de ser NOT NULL).
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.confdeltype = 'a'
      and c.connamespace = 'public'::regnamespace
  loop
    execute format('alter table %s alter column %I drop not null', r.tbl, r.col);
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users (id) on delete set null', r.tbl, r.conname, r.col);
  end loop;
end $$;

-- ───────────── desligar uma pessoa do casal (uso interno das funções abaixo)
-- Política: os gastos pessoais de quem sai são APAGADOS (só ela os via; exporte antes);
-- o resto fica com o casal, sem dono ("nosso").
create or replace function public.detach_member(p_household uuid, p_user uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  delete from public.transactions where household_id = p_household and is_private and owner_user_id = p_user;
  update public.transactions set owner_user_id = null where household_id = p_household and owner_user_id = p_user;
  update public.account_cards set holder_user_id = null where household_id = p_household and holder_user_id = p_user;
  update public.rules set owner_user_id = null where household_id = p_household and owner_user_id = p_user;
  delete from public.push_tokens where household_id = p_household and user_id = p_user;
  delete from public.invites where household_id = p_household and accepted_at is null and created_by = p_user;
  delete from public.members where household_id = p_household and user_id = p_user;
end;
$$;
revoke all on function public.detach_member(uuid, uuid) from public, anon, authenticated;

-- Sair do casal (o outro continua; se quem sai é o dono, o outro vira dono).
create or replace function public.leave_household()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_h uuid;
  v_role text;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select household_id, role into v_h, v_role from public.members where user_id = v_user;
  if v_h is null then raise exception 'no_household' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.members where household_id = v_h and user_id <> v_user) then
    raise exception 'last_member' using errcode = 'P0001', hint = 'Você é a única pessoa do casal: exclua o casal.';
  end if;
  if v_role = 'owner' then
    update public.members set role = 'owner' where household_id = v_h and user_id <> v_user;
  end if;
  perform public.detach_member(v_h, v_user);
end;
$$;

-- O dono remove o outro membro do casal.
create or replace function public.remove_member(p_user uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_h uuid;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select household_id into v_h from public.members where user_id = v_user and role = 'owner';
  if v_h is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if p_user = v_user then raise exception 'cannot_remove_self' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.members where household_id = v_h and user_id = p_user) then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  perform public.detach_member(v_h, p_user);
end;
$$;

-- Excluir o casal inteiro (apaga tudo, para os dois). Dono ou única pessoa; exige digitar o nome.
-- Os arquivos do Storage precisam ser removidos ANTES, pela API do Storage (o banco não apaga o arquivo físico).
create or replace function public.delete_household(p_confirm_name text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_h uuid;
  v_role text;
  v_name text;
  v_count int;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select m.household_id, m.role, h.name into v_h, v_role, v_name
  from public.members m join public.households h on h.id = m.household_id where m.user_id = v_user;
  if v_h is null then raise exception 'no_household' using errcode = 'P0001'; end if;
  select count(*) into v_count from public.members where household_id = v_h;
  if v_role <> 'owner' and v_count > 1 then raise exception 'not_owner' using errcode = 'P0001'; end if;
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(v_name)) then raise exception 'confirm_mismatch' using errcode = 'P0001'; end if;
  delete from public.households where id = v_h; -- cascata: contas, faturas, lançamentos, regras, orçamentos, metas…
end;
$$;

-- Exportar os dados que a pessoa pode ver (portabilidade). SECURITY INVOKER: a RLS vale, então
-- o gasto pessoal do par NÃO entra. Convites e tokens de push ficam de fora.
create or replace function public.export_household_data()
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'note', 'Apenas os dados que você pode ver; gastos pessoais do seu par não estão incluídos.',
    'household', (select to_jsonb(h) from public.households h limit 1),
    'members', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.members m),
    'accounts', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from public.accounts a),
    'account_cards', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.account_cards c),
    'statements', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.statements s),
    'transactions', (select coalesce(jsonb_agg(to_jsonb(t) - 'dedupe_hash'), '[]'::jsonb) from public.transactions t),
    'rules', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.rules r),
    'budgets', (select coalesce(jsonb_agg(to_jsonb(b)), '[]'::jsonb) from public.budgets b),
    'goals', (select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from public.goals g),
    'saved_queries', (select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from public.saved_queries q),
    'settings', (select to_jsonb(hs) from public.household_settings hs limit 1)
  )
$$;

revoke all on function public.leave_household() from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
revoke all on function public.delete_household(text) from public, anon;
revoke all on function public.export_household_data() from public, anon;
grant execute on function public.leave_household() to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.delete_household(text) to authenticated;
grant execute on function public.export_household_data() to authenticated;

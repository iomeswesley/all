-- Fase 3: IR (tipo de dedução + comprovantes), configurações do casal e perguntas salvas.

alter table public.transactions
  add column tax_kind text check (tax_kind in ('saude', 'educacao', 'outros'));

-- O comprovante precisa estar na pasta do próprio casal (impede apontar para arquivo alheio).
alter table public.transactions
  add constraint transactions_attachment_in_household
  check (attachment_path is null or attachment_path like household_id::text || '/%');

create table public.household_settings (
  household_id           uuid primary key references public.households (id) on delete cascade,
  monthly_income_cents   bigint not null default 0 check (monthly_income_cents >= 0),
  other_fixed_cents      bigint not null default 0 check (other_fixed_cents >= 0),
  -- limite anual de dedução com instrução por pessoa; confira o valor vigente da Receita
  education_limit_cents  bigint not null default 356150 check (education_limit_cents >= 0),
  updated_at             timestamptz not null default now()
);
alter table public.household_settings enable row level security;
create policy household_settings_all on public.household_settings for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create table public.saved_queries (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  created_by    uuid not null references auth.users (id),
  name          text not null check (char_length(name) between 1 and 60),
  question      text not null check (char_length(question) between 3 and 300),
  created_at    timestamptz not null default now()
);
alter table public.saved_queries enable row level security;
create policy saved_queries_select on public.saved_queries for select to authenticated using (public.is_member(household_id));
create policy saved_queries_insert on public.saved_queries for insert to authenticated
  with check (public.is_member(household_id) and created_by = auth.uid());
create policy saved_queries_delete on public.saved_queries for delete to authenticated using (public.is_member(household_id));

-- Comprovantes (notas fiscais) em bucket privado, por casal.
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
on conflict (id) do update set public = false;

create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_member(public.path_household(name)));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_member(public.path_household(name)));
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_member(public.path_household(name)));

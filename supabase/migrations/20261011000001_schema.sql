-- Finanças do casal — esquema principal.
-- Valores monetários SEMPRE em centavos (bigint). Datas como date.

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now()
);

create table public.members (
  household_id  uuid not null references public.households (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 40),
  role          text not null default 'member' check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),
  primary key (household_id, user_id)
);
-- Cada pessoa pertence a um casal: simplifica "qual é o meu casal".
create unique index members_one_household_per_user on public.members (user_id);

create table public.invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  token         text not null unique,
  email         text,
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '7 days'),
  accepted_by   uuid references auth.users (id),
  accepted_at   timestamptz
);
create index invites_household_idx on public.invites (household_id);

create table public.accounts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  kind          text not null check (kind in ('checking', 'credit_card')),
  institution   text not null,
  name          text not null,
  closing_day   smallint check (closing_day between 1 and 31),
  due_day       smallint check (due_day between 1 and 31),
  -- 'manual' = alimentada por upload de fatura; reservado para integrações futuras
  source        text not null default 'manual' check (source in ('manual')),
  created_at    timestamptz not null default now()
);
create index accounts_household_idx on public.accounts (household_id);

-- Só os 4 últimos dígitos do cartão. Nunca o número completo.
create table public.account_cards (
  account_id      uuid not null references public.accounts (id) on delete cascade,
  household_id    uuid not null references public.households (id) on delete cascade,
  last4           char(4) not null check (last4 ~ '^[0-9]{4}$'),
  label           text,
  -- dono padrão dos lançamentos deste cartão (null = "nosso")
  holder_user_id  uuid references auth.users (id),
  primary key (account_id, last4)
);

create table public.statements (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references public.households (id) on delete cascade,
  account_id          uuid not null references public.accounts (id) on delete cascade,
  status              text not null default 'needs_review' check (status in ('needs_review', 'confirmed')),
  closing_date        date not null,
  due_date            date not null,
  period_start        date,
  product             text,

  -- Declarado pelo banco
  declared_total_cents             bigint not null,
  declared_previous_balance_cents  bigint,
  declared_payments_cents          bigint,
  declared_credits_cents           bigint,
  declared_expenses_cents          bigint,
  declared_expenses_usd_cents      bigint,
  declared_future_cents            bigint,   -- saldo de obrigações futuras

  -- Calculado a partir dos lançamentos
  computed_total_cents   bigint not null,
  computed_future_cents  bigint,
  reconcile_status       text not null default 'fail' check (reconcile_status in ('ok', 'rounding', 'fail')),
  reconcile_checks       jsonb not null default '[]'::jsonb,
  forced_diff_cents      bigint,             -- diferença aceita manualmente na confirmação

  minimum_payment_cents  bigint,
  credit_limit_cents     bigint,
  available_limit_cents  bigint,
  best_purchase_date     date,
  annuity_cents          bigint,
  annuity_paid_cents     bigint,
  annuity_discount_percent numeric(5, 2),

  -- PDF original no bucket privado "statements": {household_id}/{uuid}.pdf
  file_path    text not null,
  file_sha256  text not null,

  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  confirmed_by  uuid references auth.users (id),
  confirmed_at  timestamptz,

  unique (household_id, file_sha256),
  -- uma fatura por conta e vencimento
  unique (household_id, account_id, due_date)
);
create index statements_household_due_idx on public.statements (household_id, due_date desc);

create table public.categories (
  id    smallint primary key,
  slug  text not null unique,
  name  text not null
);

-- Dicionário de estabelecimentos. household_id null = global (seed, somente leitura).
create table public.merchants (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references public.households (id) on delete cascade,
  pattern       text not null,
  match_type    text not null check (match_type in ('prefix', 'contains', 'regex')),
  real_name     text not null,
  segment       text,
  category_id   smallint not null references public.categories (id),
  confidence    text not null check (confidence in ('alta', 'media', 'baixa'))
);
create unique index merchants_unique_pattern
  on public.merchants (coalesce(household_id, '00000000-0000-0000-0000-000000000000'::uuid), pattern, match_type);

-- Regras do casal (vencem o dicionário).
create table public.rules (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  pattern        text not null,
  match_type     text not null check (match_type in ('prefix', 'contains', 'regex')),
  category_id    smallint references public.categories (id),
  owner_user_id  uuid references auth.users (id),
  priority       int not null default 100,
  created_by     uuid not null references auth.users (id),
  created_at     timestamptz not null default now(),
  unique (household_id, pattern, match_type)
);

create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  account_id      uuid not null references public.accounts (id) on delete cascade,
  statement_id    uuid references public.statements (id) on delete cascade,
  card_last4      char(4),

  posted_on         date not null,
  description_raw   text not null,
  description_clean text not null,
  merchant_name     text,

  amount_cents      bigint not null,        -- + gasto; − pagamento/crédito/estorno
  amount_usd_cents  bigint,
  fx_rate           numeric(12, 6),
  installment_n     smallint,
  installment_total smallint,
  check (installment_n is null or (installment_n >= 1 and installment_total >= installment_n)),

  kind     text not null check (kind in ('avista', 'parcela', 'estorno', 'encargo', 'pagamento')),
  section  text check (section in ('pagamentos', 'parcelamentos', 'despesas')),

  category_id      smallint references public.categories (id),
  category_source  text not null default 'none' check (category_source in ('rule', 'merchant', 'heuristic', 'manual', 'none')),
  confidence       text not null default 'baixa' check (confidence in ('alta', 'media', 'baixa')),
  needs_review     boolean not null default false,

  -- null = "nosso"; "meu"/"dela" é derivado de quem está olhando
  owner_user_id    uuid references auth.users (id),
  is_private       boolean not null default false,
  tax_deductible   boolean not null default false,
  attachment_path  text,
  purchase_flag    text,

  source       text not null default 'pdf' check (source in ('pdf', 'csv', 'ofx', 'json', 'manual')),
  dedupe_hash  text not null,
  created_at   timestamptz not null default now(),

  unique (household_id, dedupe_hash)
);
create index transactions_statement_idx on public.transactions (household_id, statement_id);
create index transactions_posted_idx on public.transactions (household_id, posted_on);
create index transactions_review_idx on public.transactions (household_id) where needs_review;

create table public.budgets (
  household_id  uuid not null references public.households (id) on delete cascade,
  category_id   smallint not null references public.categories (id),
  month         date not null check (extract(day from month) = 1),
  limit_cents   bigint not null check (limit_cents >= 0),
  primary key (household_id, category_id, month)
);

create table public.goals (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  name           text not null,
  target_cents   bigint not null check (target_cents > 0),
  saved_cents    bigint not null default 0 check (saved_cents >= 0),
  due_date       date,
  created_at     timestamptz not null default now()
);

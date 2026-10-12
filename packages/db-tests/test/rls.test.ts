import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { MERCHANT_SEEDS } from "../../core/src/seeds/merchants.ts";
import { addUser, asAnon, asUser, createDb, rejects } from "./harness.ts";

let db: PGlite;
let ana: string, bia: string, carlos: string, dora: string, eva: string; // A: ana+bia · B: carlos+dora · eva: sem casal
let hA: string, hB: string, accA: string, accB: string, stA: string, stB: string, txA: string, txB: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

async function seedHousehold(user: string, name: string) {
  return asUser(db, user, async () => {
    const [{ id }] = await q<{ id: string }>("select public.create_household($1, $2) as id", [name, name.split(" ")[0]]);
    const [acc] = await q<{ id: string }>("select id from public.accounts where household_id = $1", [id]);
    const [st] = await q<{ id: string }>(
      `insert into public.statements (household_id, account_id, closing_date, due_date, declared_total_cents, computed_total_cents, reconcile_status, file_path, file_sha256, created_by)
       values ($1, $2, '2026-08-31', '2026-09-06', 672972, 672972, 'ok', $3, $4, $5) returning id`,
      [id, acc!.id, `${id}/a.pdf`, `sha-${name}`, user],
    );
    const [tx] = await q<{ id: string }>(
      `insert into public.transactions (household_id, account_id, statement_id, posted_on, description_raw, description_clean, amount_cents, kind, dedupe_hash, needs_review)
       values ($1, $2, $3, '2026-08-04', 'DIVINA GULA PAES', 'Divina Gula Paes', 1100, 'avista', 'hash-1', true) returning id`,
      [id, acc!.id, st!.id],
    );
    return { household: id, account: acc!.id, statement: st!.id, tx: tx!.id };
  });
}

beforeAll(async () => {
  db = await createDb();
  [ana, bia, carlos, dora, eva] = await Promise.all(["ana", "bia", "carlos", "dora", "eva"].map((n) => addUser(db, `${n}@example.com`)));
  const a = await seedHousehold(ana, "Ana e Bia");
  const b = await seedHousehold(carlos, "Carlos e Dora");
  ({ household: hA, account: accA, statement: stA, tx: txA } = a);
  ({ household: hB, account: accB, statement: stB, tx: txB } = b);
});

describe("migrations e seeds", () => {
  it("12 categorias fixas e dicionário global do core", async () => {
    expect((await q("select * from public.categories")).length).toBe(12);
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from public.merchants where household_id is null");
    expect(n).toBe(new Set(MERCHANT_SEEDS.map((m) => `${m.pattern}|${m.matchType}`)).size);
  });

  it("todo valor monetário é bigint (centavos)", async () => {
    const cols = await q<{ table_name: string; column_name: string; data_type: string }>(
      `select table_name, column_name, data_type from information_schema.columns
       where table_schema = 'public' and (column_name like '%\\_cents' escape '\\')`,
    );
    expect(cols.length).toBeGreaterThan(15);
    for (const c of cols) expect(c.data_type, `${c.table_name}.${c.column_name}`).toBe("bigint");
  });

  it("não há coluna para número completo de cartão, CPF ou senha", async () => {
    const cols = await q<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public'");
    for (const c of cols) expect(c.column_name).not.toMatch(/card_number|pan|cpf|password|senha|cvv/i);
    const [{ t }] = await q<{ t: string }>("select data_type as t from information_schema.columns where table_name='account_cards' and column_name='last4'");
    expect(t).toBe("character");
  });

  it("RLS ligada em todas as tabelas públicas", async () => {
    const rows = await q<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
  });
});

describe("casal e convite", () => {
  it("criador vira dono e recebe conta padrão", async () => {
    const m = await asUser(db, ana, () => q("select user_id, role from public.members"));
    expect(m).toEqual([{ user_id: ana, role: "owner" }]);
    expect((await asUser(db, ana, () => q("select * from public.accounts"))).length).toBe(1);
  });

  it("não cria um segundo casal", async () => {
    expect(await rejects(asUser(db, ana, () => q("select public.create_household('X','Y')")), "already_in_household")).toBe(true);
  });

  it("só o dono convida; convite entra uma vez e o casal tem no máximo 2 pessoas", async () => {
    const token = await asUser(db, ana, async () => (await q<{ t: string }>("select public.create_invite('bia@example.com') as t"))[0]!.t);
    expect(token).toHaveLength(64);

    const preview = await asUser(db, bia, () => q("select * from public.peek_invite($1)", [token]));
    expect(preview).toEqual([{ household_name: "Ana e Bia", inviter_name: "Ana", valid: true }]);

    await asUser(db, bia, () => q("select public.accept_invite($1, 'Bia')", [token]));
    expect(await rejects(asUser(db, eva, () => q("select public.accept_invite($1, 'Eva')", [token])), "invite_used")).toBe(true);

    // novo convite com casal cheio
    const t2 = await asUser(db, ana, async () => (await q<{ t: string }>("select public.create_invite() as t"))[0]!.t);
    expect(await rejects(asUser(db, eva, () => q("select public.accept_invite($1, 'Eva')", [t2])), "household_full")).toBe(true);

    // os dois enxergam os mesmos dados
    const seenByBia = await asUser(db, bia, () => q("select id from public.transactions"));
    expect(seenByBia.map((r: any) => r.id)).toEqual([txA]);
    expect((await asUser(db, bia, () => q("select * from public.members"))).length).toBe(2);
  });

  it("quem não é dono não convida; convite inexistente e expirado falham", async () => {
    expect(await rejects(asUser(db, bia, () => q("select public.create_invite()")), "not_owner")).toBe(true);
    expect(await rejects(asUser(db, eva, () => q("select public.accept_invite('naoexiste', 'Eva')")), "invite_not_found")).toBe(true);
    const t = await asUser(db, carlos, async () => (await q<{ t: string }>("select public.create_invite() as t"))[0]!.t);
    await db.query("update public.invites set expires_at = now() - interval '1 minute' where token = $1", [t]);
    expect(await rejects(asUser(db, eva, () => q("select public.accept_invite($1, 'Eva')", [t])), "invite_expired")).toBe(true);
  });

  it("convite não se aceita sem login e o token não vaza para outros casais", async () => {
    expect(await asAnon(db, () => q("select * from public.invites"))).toEqual([]);
    const seen = await asUser(db, carlos, () => q("select * from public.invites"));
    expect(seen.every((i: any) => i.household_id === hB)).toBe(true);
    expect(await asUser(db, bia, () => q("select * from public.invites"))).toEqual([]); // bia não é dona
  });
});

describe("isolamento entre casais (RLS)", () => {
  const tables = ["accounts", "statements", "transactions", "rules", "budgets", "goals", "account_cards", "households", "members"];

  it("o casal B não lê nada do casal A em nenhuma tabela", async () => {
    await asUser(db, ana, () => q("insert into public.rules (household_id, pattern, match_type, category_id, created_by) values ($1,'X','contains',1,$2)", [hA, ana]));
    await asUser(db, ana, () => q("insert into public.goals (household_id, name, target_cents) values ($1,'Viagem',100000)", [hA]));
    await asUser(db, ana, () => q("insert into public.budgets (household_id, category_id, month, limit_cents) values ($1,1,'2026-09-01',50000)", [hA]));
    await asUser(db, ana, () => q("insert into public.account_cards (account_id, household_id, last4) values ($1,$2,'1111')", [accA, hA]));
    for (const t of tables) {
      const rows = await asUser(db, carlos, () => q(`select * from public.${t}`));
      const leaked = rows.filter((r: any) => r.household_id === hA || r.id === hA);
      expect(leaked, `vazou em ${t}`).toEqual([]);
    }
  });

  it("não escreve no casal alheio (insert/update/delete)", async () => {
    const attempts = [
      `insert into public.transactions (household_id, account_id, posted_on, description_raw, description_clean, amount_cents, kind, dedupe_hash) values ('${hA}','${accA}','2026-01-01','x','x',1,'avista','evil')`,
      `insert into public.accounts (household_id, kind, institution, name) values ('${hA}','checking','x','x')`,
      `insert into public.rules (household_id, pattern, match_type, created_by) values ('${hA}','x','contains','${carlos}')`,
      `insert into public.statements (household_id, account_id, closing_date, due_date, declared_total_cents, computed_total_cents, file_path, file_sha256, created_by) values ('${hA}','${accA}','2026-01-01','2026-01-06',1,1,'${hA}/e.pdf','e','${carlos}')`,
      `insert into public.members (household_id, user_id, display_name, role) values ('${hA}','${carlos}','x','member')`,
    ];
    for (const sql of attempts) expect(await rejects(asUser(db, carlos, () => q(sql))), sql).toBe(true);

    const upd = await asUser(db, carlos, () => db.query("update public.transactions set amount_cents = 1 where id = $1", [txA]));
    expect(upd.affectedRows).toBe(0);
    const del = await asUser(db, carlos, () => db.query("delete from public.statements where id = $1", [stA]));
    expect(del.affectedRows).toBe(0);
    const [{ n }] = await q<{ n: number }>("select count(*)::int as n from public.transactions where household_id = $1 and amount_cents = 1100", [hA]);
    expect(n).toBe(1);
  });

  it("não mexe em lançamento alheio via funções (regra, confirmação)", async () => {
    const n = await asUser(db, carlos, async () => (await q<{ c: number }>("select public.save_rule_and_apply('DIVINA','contains',1::smallint,null,$1::uuid[]) as c", [[txA]]))[0]!.c);
    expect(n).toBe(0);
    expect((await q("select category_id from public.transactions where id = $1", [txA]))[0]).toEqual({ category_id: null });
    expect(await rejects(asUser(db, carlos, () => q("select public.confirm_statement($1)", [stA])), "statement_not_found")).toBe(true);
  });

  it("usuário sem casal e anônimo não veem nada", async () => {
    for (const t of tables) {
      expect(await asUser(db, eva, () => q(`select * from public.${t}`)), t).toEqual([]);
    }
    // `anon` tem o privilégio de tabela do Supabase, mas a RLS não deixa passar nenhuma linha
    for (const t of tables) expect(await asAnon(db, () => q(`select * from public.${t}`)), `anon em ${t}`).toEqual([]);
    expect(await rejects(asAnon(db, () => q("insert into public.goals (household_id, name, target_cents) values ($1,'x',1)", [hA])))).toBe(true);
    // e as funções não estão disponíveis sem login
    expect(await rejects(asAnon(db, () => q("select public.create_household('x','y')")), "permission denied")).toBe(true);
    expect(await rejects(asAnon(db, () => q("select public.accept_invite('t','x')")), "permission denied")).toBe(true);
  });

  it("categorias e dicionário global: leitura sim, escrita não; dicionário do casal é do casal", async () => {
    expect((await asUser(db, eva, () => q("select * from public.categories"))).length).toBe(12);
    expect((await asUser(db, eva, () => q("select * from public.merchants"))).length).toBeGreaterThan(100);
    expect(await rejects(asUser(db, ana, () => q("insert into public.merchants (household_id, pattern, match_type, real_name, category_id, confidence) values (null,'EVIL','contains','x',1,'alta')")))).toBe(true);
    const upd = await asUser(db, ana, () => db.query("update public.merchants set category_id = 12 where household_id is null"));
    expect(upd.affectedRows).toBe(0);
    await asUser(db, ana, () => q("insert into public.merchants (household_id, pattern, match_type, real_name, category_id, confidence) values ($1,'PADARIA DO ZE','contains','Padaria do Zé',2,'alta')", [hA]));
    expect((await asUser(db, carlos, () => q("select * from public.merchants where pattern = 'PADARIA DO ZE'"))).length).toBe(0);
    expect((await asUser(db, bia, () => q("select * from public.merchants where pattern = 'PADARIA DO ZE'"))).length).toBe(1);
  });
});

describe("modo gasto pessoal", () => {
  it("lançamento privado de uma pessoa não aparece para o parceiro", async () => {
    await asUser(db, ana, () =>
      q(`insert into public.transactions (household_id, account_id, statement_id, posted_on, description_raw, description_clean, amount_cents, kind, dedupe_hash, is_private, owner_user_id)
         values ($1,$2,$3,'2026-08-05','SURPRESA','Surpresa',9900,'avista','hash-priv',true,$4)`, [hA, accA, stA, ana]));
    expect((await asUser(db, ana, () => q("select id from public.transactions where is_private"))).length).toBe(1);
    expect((await asUser(db, bia, () => q("select id from public.transactions where is_private"))).length).toBe(0);
  });
});

describe("faturas: unicidade, confirmação e view", () => {
  it("mesmo PDF e mesmo lançamento não entram duas vezes no casal (mas podem em outro casal)", async () => {
    expect(await rejects(asUser(db, ana, () => q(
      `insert into public.statements (household_id, account_id, closing_date, due_date, declared_total_cents, computed_total_cents, file_path, file_sha256, created_by)
       values ($1,$2,'2026-09-30','2026-10-06',1,1,$3,'sha-Ana e Bia',$4)`, [hA, accA, `${hA}/b.pdf`, ana])), "duplicate")).toBe(true);
    expect(await rejects(asUser(db, ana, () => q(
      `insert into public.transactions (household_id, account_id, statement_id, posted_on, description_raw, description_clean, amount_cents, kind, dedupe_hash)
       values ($1,$2,$3,'2026-08-04','DIVINA GULA PAES','x',1100,'avista','hash-1')`, [hA, accA, stA])), "duplicate")).toBe(true);
    await asUser(db, carlos, () => q(
      `select 1 from public.transactions where dedupe_hash = 'hash-1'`)); // B tem o mesmo hash e isso é permitido
  });

  it("confirmar: com conferência 'fail' exige força e registra a diferença", async () => {
    const st = await asUser(db, carlos, async () =>
      (await q<{ id: string }>(
        `insert into public.statements (household_id, account_id, closing_date, due_date, declared_total_cents, computed_total_cents, reconcile_status, file_path, file_sha256, created_by)
         values ($1,$2,'2026-09-30','2026-10-06',100000,100050,'fail',$3,'sha-fail',$4) returning id`, [hB, accB, `${hB}/f.pdf`, carlos]))[0]!.id);
    expect(await rejects(asUser(db, carlos, () => q("select public.confirm_statement($1)", [st])), "reconcile_failed")).toBe(true);
    await asUser(db, carlos, () => q("select public.confirm_statement($1, true)", [st]));
    const [row] = await q<{ status: string; forced_diff_cents: string }>("select status, forced_diff_cents::text from public.statements where id = $1", [st]);
    expect(row).toEqual({ status: "confirmed", forced_diff_cents: "50" });
  });

  it("v_transactions só mostra faturas confirmadas, com a competência (mês do vencimento)", async () => {
    expect((await asUser(db, ana, () => q("select id from public.v_transactions"))).length).toBe(0);
    await asUser(db, ana, () => q("select public.confirm_statement($1)", [stA]));
    const rows = await asUser(db, ana, () => q<{ statement_month: string }>("select statement_month from public.v_transactions"));
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.statement_month))).toEqual(new Set(["2026-09"]));
    expect((await asUser(db, carlos, () => q("select * from public.v_transactions where household_id = $1", [hA]))).length).toBe(0);
  });
});

describe("correção manual → regra para os dois", () => {
  it("cria a regra, atualiza os lançamentos e a regra vale para o parceiro", async () => {
    const n = await asUser(db, ana, async () =>
      (await q<{ c: number }>("select public.save_rule_and_apply('DIVINA GULA','contains',2::smallint,$1,$2::uuid[]) as c", [bia, [txA]]))[0]!.c);
    expect(n).toBe(1);
    const [t] = await q("select category_id, category_source, confidence, needs_review, owner_user_id from public.transactions where id = $1", [txA]);
    expect(t).toEqual({ category_id: 2, category_source: "rule", confidence: "alta", needs_review: false, owner_user_id: bia });
    const rules = await asUser(db, bia, () => q("select pattern, category_id from public.rules where pattern = 'DIVINA GULA'"));
    expect(rules).toEqual([{ pattern: "DIVINA GULA", category_id: 2 }]);
    // chamar de novo atualiza em vez de duplicar
    await asUser(db, bia, () => q("select public.save_rule_and_apply('DIVINA GULA','contains',1::smallint,null,$1::uuid[])", [[txA]]));
    expect((await q("select category_id from public.rules where pattern = 'DIVINA GULA'"))).toEqual([{ category_id: 1 }]);
  });

  it("dono precisa ser do casal", async () => {
    expect(await rejects(asUser(db, ana, () => q("select public.save_rule_and_apply('X','contains',1::smallint,$1,$2::uuid[])", [carlos, [txA]])), "owner_not_in_household")).toBe(true);
  });
});

describe("Storage: PDFs no bucket privado", () => {
  it("o bucket é privado", async () => {
    const buckets = await q("select id, public from storage.buckets");
    expect(buckets.find((b: any) => b.id === "statements")).toEqual({ id: "statements", public: false });
    expect(buckets.every((b: any) => b.public === false)).toBe(true);
  });
  it("cada casal só acessa a própria pasta", async () => {
    await asUser(db, ana, () => q("insert into storage.objects (bucket_id, name) values ('statements', $1)", [`${hA}/fatura.pdf`]));
    expect(await rejects(asUser(db, ana, () => q("insert into storage.objects (bucket_id, name) values ('statements', $1)", [`${hB}/fatura.pdf`])))).toBe(true);
    expect(await rejects(asUser(db, ana, () => q("insert into storage.objects (bucket_id, name) values ('statements', 'sem-pasta.pdf')")))).toBe(true);
    expect(await rejects(asUser(db, ana, () => q("insert into storage.objects (bucket_id, name) values ('statements', 'nao-e-uuid/x.pdf')")))).toBe(true);
    expect((await asUser(db, bia, () => q("select name from storage.objects"))).length).toBe(1);
    expect((await asUser(db, carlos, () => q("select name from storage.objects"))).length).toBe(0);
    expect((await asUser(db, eva, () => q("select name from storage.objects"))).length).toBe(0);
    const del = await asUser(db, carlos, () => db.query("delete from storage.objects where name = $1", [`${hA}/fatura.pdf`]));
    expect(del.affectedRows).toBe(0);
  });
});

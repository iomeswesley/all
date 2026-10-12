import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { processStatement } from "../../../supabase/functions/parse-statement/process.ts";
import { addUser, asUser, createDb, rejects } from "./harness.ts";
import { sqlStore } from "./sql-store.ts";

let db: PGlite;
let ana: string, bia: string, household: string, cardAcc: string, bankAcc: string;
const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

const OFX = (end: string, extra = "") => `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL</CURDEF>
<BANKACCTFROM><BANKID>260</BANKID><ACCTID>998877-1</ACCTID></BANKACCTFROM>
<BANKTRANLIST><DTSTART>20261001</DTSTART><DTEND>${end}</DTEND>
<STMTTRN><DTPOSTED>20261003</DTPOSTED><TRNAMT>-120.00</TRNAMT><FITID>1</FITID><MEMO>PIX PADARIA</MEMO></STMTTRN>
<STMTTRN><DTPOSTED>20261005</DTPOSTED><TRNAMT>8500.00</TRNAMT><FITID>2</FITID><MEMO>SALARIO</MEMO></STMTTRN>
<STMTTRN><DTPOSTED>20261010</DTPOSTED><TRNAMT>-39.90</TRNAMT><FITID>3</FITID><MEMO>TARIFA MENSAL</MEMO></STMTTRN>${extra}
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const JSONSTATEMENT = (declared: number | undefined, due = "2026-10-07", tag = "") =>
  JSON.stringify({
    version: 1, bank: "Banco X", closingDate: "2026-09-30", dueDate: due, declaredTotalCents: declared,
    transactions: [
      { date: "2026-09-05", description: `MERCADO${tag}`, amountCents: 7000 },
      { date: "2026-09-10", description: `ESTORNO LOJA${tag}`, amountCents: -1000 },
      { date: "2026-09-12", description: `PAGAMENTO FATURA${tag}`, amountCents: -50000, kind: "pagamento" },
    ],
  });

const run = (user: string, source: any, over: Record<string, unknown> = {}) =>
  processStatement(sqlStore(db, user), { source, sha256: `sha-${Math.random()}`, filePath: `${household}/x.bin`, userId: user, ...over });

beforeAll(async () => {
  db = await createDb();
  ana = await addUser(db, "ana@x.com");
  bia = await addUser(db, "bia@x.com");
  household = await asUser(db, ana, async () => (await q("select public.create_household('Casa','Ana') as id"))[0].id);
  const tk = await asUser(db, ana, async () => (await q("select public.create_invite() as t"))[0].t);
  await asUser(db, bia, () => q("select public.accept_invite($1,'Bia')", [tk]));
  cardAcc = (await q("select id from public.accounts where household_id=$1", [household]))[0].id;
  bankAcc = (await asUser(db, ana, async () => (await q("insert into public.accounts (household_id, kind, institution, name) values ($1,'checking','nubank','Nubank conta') returning id", [household]))[0].id)) as string;
});

describe("várias contas e outros bancos no banco real", () => {
  it("OFX de conta corrente: grava em 'não verificável', entradas não são gasto, confirma e vai ao painel", async () => {
    const r = await run(ana, { format: "ofx", text: OFX("20261031") }, { accountId: bankAcc });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.reconcile.status).toBe("unverified");
    expect(r.reconcile.canAutoConfirm).toBe(true);
    const [st] = await q("select format, reconcile_status, status, account_id from public.statements where id = $1", [r.statementId]);
    expect(st).toEqual({ format: "ofx", reconcile_status: "unverified", status: "needs_review", account_id: bankAcc });
    await asUser(db, ana, () => q("select public.confirm_statement($1)", [r.statementId])); // 'unverified' confirma sem força
    const rows = await asUser(db, bia, () => q("select kind, amount_cents::int as c, statement_month from public.v_transactions order by amount_cents desc"));
    expect(rows.map((x: any) => [x.kind, x.c, x.statement_month])).toEqual([["encargo", 3990, "2026-10"], ["avista", 12000, "2026-10"], ["pagamento", -850000, "2026-10"]].sort((a: any, b: any) => b[1] - a[1]));
  });

  it("mesmo período já confirmado não é sobrescrito", async () => {
    const again = await run(ana, { format: "ofx", text: OFX("20261031") }, { accountId: bankAcc });
    expect(again.status).toBe("already_confirmed");
  });

  it("extrato que se SOBREPÕE ao anterior importa só o que é novo (sem derrubar nem duplicar)", async () => {
    const extra = `<STMTTRN><DTPOSTED>20261112</DTPOSTED><TRNAMT>-77.00</TRNAMT><FITID>9</FITID><MEMO>PIX FARMACIA</MEMO></STMTTRN>`;
    const r = await run(ana, { format: "ofx", text: OFX("20261130", extra) }, { accountId: bankAcc });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r).toMatchObject({ transactionCount: 1, skippedDuplicates: 3 });
    expect(r.warnings.join(" ")).toMatch(/3 lançamento\(s\) já importado/);
    expect((await q("select description_raw from public.transactions where statement_id = $1", [r.statementId])).map((t: any) => t.description_raw)).toEqual(["PIX FARMACIA"]);
    // o mesmo arquivo de novo não tem nada novo e não cria fatura
    const before = (await q("select count(*)::int as n from public.statements"))[0].n;
    await asUser(db, ana, () => q("select public.confirm_statement($1)", [r.statementId]));
    const nothing = await run(ana, { format: "ofx", text: OFX("20261130", extra) }, { accountId: bankAcc, sha256: "outro-arquivo" });
    expect(nothing.status).toBe("already_confirmed"); // mesmo fechamento já confirmado
    const nothing2 = await run(ana, { format: "ofx", text: OFX("20261215", extra) }, { accountId: bankAcc });
    expect(nothing2).toEqual({ status: "nothing_new", skippedDuplicates: 4 });
    expect((await q("select count(*)::int as n from public.statements"))[0].n).toBe(before);
  });

  it("contas diferentes não colidem: Santander (PDF) e OFX convivem no mesmo painel", async () => {
    const dir = path.resolve(import.meta.dirname, "../../../fixtures/santander");
    const items = JSON.parse(fs.readFileSync(path.join(dir, "2026-09.items.json"), "utf8"));
    const r = await run(ana, { format: "pdf", items }, { accountId: cardAcc });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.reconcile.status).toBe("ok"); // PDF Santander continua conferindo de verdade
    await asUser(db, ana, () => q("select public.confirm_statement($1)", [r.statementId]));
    const months = (await asUser(db, ana, () => q("select distinct statement_month from public.v_transactions order by 1"))).map((x: any) => x.statement_month);
    expect(months).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("JSON assistido: total que bate confirma; total que não bate bloqueia; sem total é 'não verificável'", async () => {
    const good = await run(ana, { format: "json", text: JSONSTATEMENT(6000) }, { accountId: cardAcc });
    expect(good.status === "ok" && good.reconcile.status).toBe("ok"); // 7000 − 1000 = 6000
    const bad = await run(ana, { format: "json", text: JSONSTATEMENT(5999, "2026-10-07", " B") }, { accountId: cardAcc }); // mesmo vencimento: substitui o rascunho
    expect(bad.status).toBe("ok");
    if (bad.status !== "ok") return;
    expect(bad.reconcile).toMatchObject({ status: "fail", canAutoConfirm: false, totalDiffCents: 1 });
    expect(await rejects(asUser(db, ana, () => q("select public.confirm_statement($1)", [bad.statementId])), "reconcile_failed")).toBe(true);
    const none = await run(ana, { format: "json", text: JSONSTATEMENT(undefined, "2026-11-07", " C") }, { accountId: cardAcc });
    expect(none.status === "ok" && none.reconcile.status).toBe("unverified");
  });

  it("JSON com total que repete lançamentos já importados é recusado (não dá para conferir só parte)", async () => {
    const text = JSONSTATEMENT(6000, "2026-12-07", " C"); // mesmas descrições/valores do JSON sem total já gravado
    const r = await run(ana, { format: "json", text }, { accountId: cardAcc });
    expect(r).toMatchObject({ status: "overlap_with_total", skippedDuplicates: 3 }); // 2 lançamentos + o pagamento
  });

  it("arquivo inválido ou banco desconhecido: 'unsupported', nada é gravado", async () => {
    const before = (await q("select count(*)::int as n from public.statements"))[0].n;
    const badJson = await run(ana, { format: "json", text: "isto não é json" });
    expect(badJson).toMatchObject({ status: "unsupported" });
    const pdf = await run(ana, { format: "pdf", items: [{ p: 1, x: 0, y: 0, w: 1, s: "Outro Banco" }] });
    expect(pdf.status === "unsupported" && pdf.message).toMatch(/OFX/);
    expect((await q("select count(*)::int as n from public.statements"))[0].n).toBe(before);
  });

  it("a conta 'Pix e dinheiro' nunca recebe importação", async () => {
    const cash = await asUser(db, ana, async () => (await q("select public.ensure_cash_account() as id"))[0].id);
    await expect(run(ana, { format: "ofx", text: OFX("20261231") }, { accountId: cash })).rejects.toThrow(/Conta não encontrada/);
  });

  it("o par vê as mesmas contas; outro casal não vê as contas", async () => {
    expect((await asUser(db, bia, () => q("select name from public.accounts order by name"))).map((a: any) => a.name)).toContain("Nubank conta");
    const carlos = await addUser(db, "carlos@x.com");
    await asUser(db, carlos, () => q("select public.create_household('Outra','Carlos')"));
    expect((await asUser(db, carlos, () => q("select name from public.accounts"))).map((a: any) => a.name)).not.toContain("Nubank conta");
  });
});

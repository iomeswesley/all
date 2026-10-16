import { describe, expect, it } from "vitest";
import type { PlannedExpense } from "../src/planned.ts";
import {
  descriptionSimilarity,
  descriptionTokens,
  pastOpenOccurrences,
  scorePlannedMatch,
  suggestPlannedMatches,
  type MatchTx,
  type PlannedMark,
} from "../src/planned-match.ts";

const TODAY = "2026-10-16";
const plan = (p: Partial<PlannedExpense> & Pick<PlannedExpense, "firstDate">): PlannedExpense => ({
  id: p.id ?? "p1", description: p.description ?? "IPVA", amountCents: p.amountCents ?? 250000, repeat: p.repeat ?? "once", occurrences: p.occurrences ?? null, categoryId: null, ...p,
});
const tx = (t: Partial<MatchTx> & Pick<MatchTx, "id">): MatchTx => ({
  postedOn: "2026-10-10", statementMonth: "2026-10", descriptionRaw: "DETRAN SP IPVA", amountCents: 250000, kind: "avista", card: false, ...t,
});
const run = (planned: PlannedExpense[], txs: MatchTx[], marks: PlannedMark[] = []) => suggestPlannedMatches({ planned, txs, marks, today: TODAY });

describe("tokens e semelhança de descrição", () => {
  it("normaliza acento, caixa e ignora números e palavras vazias", () => {
    expect([...descriptionTokens("Matrícula da escola 2027")]).toEqual(["MATRICULA", "ESCOLA"]);
    expect(descriptionSimilarity("IPVA", "DETRAN*IPVA 2026")).toBe(1);
    expect(descriptionSimilarity("Viagem praia", "LATAM AIRLINES")).toBe(0);
    expect(descriptionSimilarity("Seguro carro", "PORTO SEGURO AUTO")).toBe(0.5);
  });
});

describe("pontuação do par", () => {
  const o = { amountCents: 100000, date: "2026-10-10", description: "Dentista" };
  it("valor igual e mesmo dia já é alta confiança, mesmo sem descrição parecida", () => {
    expect(scorePlannedMatch(o, tx({ id: "a", amountCents: 100000, postedOn: "2026-10-10", descriptionRaw: "CLINICA SORRIA" }))).toBe(80);
  });
  it("valor fora de ±10% ou data fora da janela não é candidato", () => {
    expect(scorePlannedMatch(o, tx({ id: "a", amountCents: 111000, postedOn: "2026-10-10" }))).toBeNull();
    expect(scorePlannedMatch(o, tx({ id: "a", amountCents: 110000, postedOn: "2026-10-10" }))).not.toBeNull();
    expect(scorePlannedMatch(o, tx({ id: "a", amountCents: 100000, postedOn: "2026-10-21" }))).toBeNull();
    expect(scorePlannedMatch(o, tx({ id: "a", amountCents: 100000, postedOn: "2026-10-20" }))).not.toBeNull();
  });
  it("pagamento, estorno, encargo e totais ocultos ficam de fora", () => {
    for (const kind of ["pagamento", "estorno", "encargo"] as const) expect(scorePlannedMatch(o, tx({ id: "a", amountCents: 100000, postedOn: "2026-10-10", kind }))).toBeNull();
    expect(scorePlannedMatch(o, tx({ id: "a", amountCents: 100000, postedOn: "2026-10-10", hiddenAggregate: true }))).toBeNull();
  });
  it("cartão: vale a competência do mês planejado ou do seguinte", () => {
    const far = { amountCents: 100000, postedOn: "2026-09-02", descriptionRaw: "ODONTO DENTISTA" };
    expect(scorePlannedMatch(o, tx({ id: "a", ...far, card: false, statementMonth: "2026-10" }))).toBeNull();
    expect(scorePlannedMatch(o, tx({ id: "a", ...far, card: true, statementMonth: "2026-11" }))).toBe(78);
    expect(scorePlannedMatch(o, tx({ id: "a", ...far, card: true, statementMonth: "2026-12" }))).toBeNull();
  });
});

describe("sugestões de baixa", () => {
  it("positivo: IPVA planejado aparece no Pix uns dias antes", () => {
    const s = run([plan({ firstDate: "2026-10-12" })], [tx({ id: "t1", postedOn: "2026-10-10" }), tx({ id: "t2", amountCents: 9000, descriptionRaw: "PADARIA" })]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ tx: { id: "t1" }, confidence: "alta", ambiguous: false, occurrence: { id: "p1", date: "2026-10-12" } });
  });

  it("positivo: série mensal casa cada mês com seu lançamento, sem repetir o lançamento", () => {
    const p = plan({ id: "esc", description: "Escola", amountCents: 120000, firstDate: "2026-08-05", repeat: "monthly" });
    const s = run([p], [
      tx({ id: "ago", amountCents: 120000, postedOn: "2026-08-05", descriptionRaw: "COLEGIO ABC ESCOLA" }),
      tx({ id: "set", amountCents: 121000, postedOn: "2026-09-06", descriptionRaw: "COLEGIO ABC ESCOLA" }),
      tx({ id: "out", amountCents: 120000, postedOn: "2026-10-04", descriptionRaw: "COLEGIO ABC ESCOLA" }),
    ]);
    // agosto ficou fora da janela de 60 dias para trás
    expect(s.map((x) => [x.occurrence.date, x.tx.id])).toEqual([["2026-09-05", "set"], ["2026-10-05", "out"]]);
  });

  it("negativo: valor muito diferente, data longe ou planejado futuro distante não geram sugestão", () => {
    expect(run([plan({ firstDate: "2026-10-12" })], [tx({ id: "t", amountCents: 200000 })])).toEqual([]);
    expect(run([plan({ firstDate: "2026-10-12" })], [tx({ id: "t", postedOn: "2026-09-20" })])).toEqual([]);
    expect(run([plan({ firstDate: "2027-01-20" })], [tx({ id: "t", postedOn: "2026-10-10" })])).toEqual([]);
  });

  it("ambíguo: dois lançamentos quase iguais → sugere o mais perto e avisa", () => {
    const s = run([plan({ description: "Presente", amountCents: 30000, firstDate: "2026-10-10" })], [
      tx({ id: "a", amountCents: 30000, postedOn: "2026-10-09", descriptionRaw: "LOJA X" }),
      tx({ id: "b", amountCents: 30000, postedOn: "2026-10-11", descriptionRaw: "LOJA Y" }),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]!.ambiguous).toBe(true);
    expect(s[0]!.confidence).toBe("media");
    expect(s[0]!.tx.id).toBe("a"); // empate de pontos e de distância: ordem estável pelo id
  });

  it("ambíguo: descrição desempata quando os valores e datas empatam", () => {
    const s = run([plan({ description: "Academia", amountCents: 15000, firstDate: "2026-10-10" })], [
      tx({ id: "a", amountCents: 15000, postedOn: "2026-10-10", descriptionRaw: "MERCADO BOM" }),
      tx({ id: "b", amountCents: 15000, postedOn: "2026-10-10", descriptionRaw: "SMART FIT ACADEMIA" }),
    ]);
    expect(s[0]).toMatchObject({ tx: { id: "b" }, ambiguous: false, confidence: "alta" });
  });

  it("um lançamento serve a um planejado só (o de maior pontuação)", () => {
    const s = run([
      plan({ id: "x", description: "Seguro carro", amountCents: 180000, firstDate: "2026-10-10" }),
      plan({ id: "y", description: "Revisão", amountCents: 180000, firstDate: "2026-10-01" }),
    ], [tx({ id: "t", amountCents: 180000, postedOn: "2026-10-10", descriptionRaw: "PORTO SEGURO" })]);
    expect(s.map((x) => x.occurrence.id)).toEqual(["x"]);
  });

  it("ocorrência com baixa não volta; ✕ não é tira só aquele par; lançamento já usado sai", () => {
    const planned = [plan({ firstDate: "2026-10-12" })];
    const txs = [tx({ id: "t1", postedOn: "2026-10-10" }), tx({ id: "t2", postedOn: "2026-10-03", descriptionRaw: "OUTRA COISA" })];
    expect(run(planned, txs, [{ plannedId: "p1", occurrenceDate: "2026-10-12", transactionId: "t1", status: "feito" }])).toEqual([]);
    expect(run(planned, txs, [{ plannedId: "p1", occurrenceDate: "2026-10-12", transactionId: null, status: "feito" }])).toEqual([]);
    expect(run(planned, txs, [{ plannedId: "p1", occurrenceDate: "2026-10-12", transactionId: null, status: "ignorado" }])).toEqual([]);
    const afterNo = run(planned, txs, [{ plannedId: "p1", occurrenceDate: "2026-10-12", transactionId: "t1", status: "ignorado" }]);
    expect(afterNo.map((x) => x.tx.id)).toEqual(["t2"]);
    const used = run([plan({ id: "outro", firstDate: "2026-10-11" })], txs, [{ plannedId: "p9", occurrenceDate: "2026-09-01", transactionId: "t1", status: "feito" }]);
    expect(used.map((x) => x.tx.id)).toEqual(["t2"]);
  });
});

describe("ocorrências passadas para marcar à mão", () => {
  it("lista as passadas sem baixa, mais recentes primeiro", () => {
    const p = plan({ id: "m", firstDate: "2026-07-20", repeat: "monthly", occurrences: 6 });
    const marks: PlannedMark[] = [{ plannedId: "m", occurrenceDate: "2026-09-20", transactionId: null, status: "feito" }];
    expect(pastOpenOccurrences([p], marks, TODAY).map((o) => o.date)).toEqual(["2026-08-20"]);
    expect(pastOpenOccurrences([p], [], TODAY, 120).map((o) => o.date)).toEqual(["2026-09-20", "2026-08-20", "2026-07-20"]);
  });
});

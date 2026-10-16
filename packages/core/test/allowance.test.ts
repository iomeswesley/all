import { describe, expect, it } from "vitest";
import { allowanceAfter, allowanceLevel, allowanceState, daysLeftInMonth, partnerAllowanceLabel } from "../src/allowance.ts";

describe("mesada: nível", () => {
  it("ok abaixo de 80%, perto a partir de 80% (inteiros), estourou só acima do limite", () => {
    expect(allowanceLevel(0, 50000)).toBe("ok");
    expect(allowanceLevel(39999, 50000)).toBe("ok");
    expect(allowanceLevel(40000, 50000)).toBe("perto");
    expect(allowanceLevel(50000, 50000)).toBe("perto");
    expect(allowanceLevel(50001, 50000)).toBe("estourou");
  });
  it("limite zero: qualquer gasto estoura", () => {
    expect(allowanceLevel(0, 0)).toBe("ok");
    expect(allowanceLevel(1, 0)).toBe("estourou");
  });
});

describe("mesada: dias restantes", () => {
  it("conta hoje; mês passado = 0; mês futuro = mês inteiro", () => {
    expect(daysLeftInMonth("2026-10", "2026-10-16")).toBe(16);
    expect(daysLeftInMonth("2026-10", "2026-10-31")).toBe(1);
    expect(daysLeftInMonth("2026-02", "2026-02-01")).toBe(28);
    expect(daysLeftInMonth("2028-02", "2028-02-01")).toBe(29);
    expect(daysLeftInMonth("2026-09", "2026-10-16")).toBe(0);
    expect(daysLeftInMonth("2026-11", "2026-10-16")).toBe(30);
  });
});

describe("mesada: estado", () => {
  it("resta e por dia até o fim do mês (arredonda para baixo)", () => {
    const s = allowanceState({ limitCents: 50000, usedCents: 31000, month: "2026-10", today: "2026-10-16" });
    expect(s).toMatchObject({ percent: 62, remainingCents: 19000, overCents: 0, daysLeft: 16, perDayCents: 1187, level: "ok" });
  });
  it("estourou: resta negativo, por dia 0", () => {
    const s = allowanceState({ limitCents: 50000, usedCents: 56000, month: "2026-10", today: "2026-10-16" });
    expect(s).toMatchObject({ percent: 112, remainingCents: -6000, overCents: 6000, perDayCents: 0, level: "estourou" });
  });
  it("estorno maior que o gasto conta como 0; mês encerrado não tem por dia", () => {
    expect(allowanceState({ limitCents: 50000, usedCents: -2000, month: "2026-10", today: "2026-10-16" }).usedCents).toBe(0);
    expect(allowanceState({ limitCents: 50000, usedCents: 1000, month: "2026-09", today: "2026-10-16" }).perDayCents).toBe(0);
  });
  it("depois de um gasto novo", () => {
    const s = allowanceState({ limitCents: 50000, usedCents: 38000, month: "2026-10", today: "2026-10-16" });
    const a = allowanceAfter(s, 3000, "2026-10", "2026-10-16");
    expect(a).toMatchObject({ usedCents: 41000, remainingCents: 9000, level: "perto", perDayCents: 562 });
  });
  it("o par vê só a porcentagem", () => {
    expect(partnerAllowanceLabel(allowanceState({ limitCents: 50000, usedCents: 31000, month: "2026-10", today: "2026-10-16" }))).toBe("usou 62%");
    expect(partnerAllowanceLabel(allowanceState({ limitCents: 50000, usedCents: 60000, month: "2026-10", today: "2026-10-16" }))).toBe("passou do combinado · 120%");
  });
});

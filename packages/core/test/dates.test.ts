import { describe, expect, it } from "vitest";
import { addDays, addMonths, diffDays, formatBrDate, formatMonthLong, formatMonthShort, inferDate, parseBrDate, parseBrDateShort } from "../src/dates.ts";

describe("datas BR", () => {
  it("parse e format", () => {
    expect(parseBrDate("06/09/2026")).toBe("2026-09-06");
    expect(parseBrDateShort("29/06/26")).toBe("2026-06-29");
    expect(formatBrDate("2026-09-06")).toBe("06/09/2026");
    expect(() => parseBrDate("31/02/2026")).toThrow();
    expect(formatMonthLong("2026-09")).toBe("setembro de 2026");
    expect(formatMonthShort("2026-09")).toBe("set/26");
  });
  it("addMonths limita ao fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonths("2026-03-15", -3)).toBe("2025-12-15");
  });
  it("addDays/diffDays", () => {
    expect(addDays("2026-02-27", 3)).toBe("2026-03-02");
    expect(diffDays("2026-03-02", "2026-02-27")).toBe(3);
  });
});

describe("inferDate (ano de dd/mm)", () => {
  it("compra recente", () => expect(inferDate(4, 8, "2026-08-31")).toBe("2026-08-04"));
  it("virada de ano", () => expect(inferDate(28, 12, "2026-01-27")).toBe("2025-12-28"));
  it("compra no limite do fechamento", () => expect(inferDate(31, 8, "2026-08-31")).toBe("2026-08-31"));
  it("compra anterior ao início do período (lançada depois)", () => expect(inferDate(29, 7, "2026-08-31")).toBe("2026-07-29"));
  it("parcela de compra feita meses antes", () => expect(inferDate(9, 1, "2026-08-31", 7)).toBe("2026-01-09"));
  it("parcela longa (mais de 12 meses)", () => expect(inferDate(10, 3, "2026-08-31", 18)).toBe("2025-03-10"));
  it("29/02 só existe em ano bissexto", () => expect(inferDate(29, 2, "2026-03-10")).toBe("2024-02-29"));
});

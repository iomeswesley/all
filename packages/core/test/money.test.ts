import { describe, expect, it } from "vitest";
import { formatBRL, formatNumberBR, formatUSD, looksLikeBRL, parseBRL, percent, sumCents, tryParseBRL } from "../src/money.ts";

describe("parseBRL", () => {
  it.each([
    ["0,00", 0],
    ["0,04", 4],
    ["5,5", 550],
    ["12", 1200],
    ["1.234,56", 123456],
    ["6.729,72", 672972],
    ["-7.136,89", -713689],
    ["R$ 1.234,56", 123456],
    ["R$6.729,72", 672972],
    ["1234,56", 123456],
  ])("%s → %i", (input, cents) => expect(parseBRL(input)).toBe(cents));

  it("rejeita lixo", () => {
    expect(() => parseBRL("abc")).toThrow();
    expect(() => parseBRL("1,234,56")).toThrow();
    expect(() => parseBRL("1.23,45")).toThrow();
    expect(tryParseBRL("x")).toBeNull();
  });

  it("não sofre de erro de ponto flutuante", () => {
    expect(parseBRL("0,10") + parseBRL("0,20")).toBe(30);
    expect(parseBRL("1.005,01")).toBe(100501);
  });
});

describe("formatação", () => {
  it("BRL", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56");
    expect(formatBRL(5)).toBe("R$ 0,05");
    expect(formatBRL(0)).toBe("R$ 0,00");
    expect(formatBRL(-713689)).toBe("-R$ 7.136,89");
    expect(formatBRL(100000000)).toBe("R$ 1.000.000,00");
  });
  it("USD e número", () => {
    expect(formatUSD(2126)).toBe("US$ 21,26");
    expect(formatNumberBR(-4)).toBe("-0,04");
  });
  it("rejeita não inteiros", () => expect(() => formatBRL(10.5)).toThrow());
  it("ida e volta", () => {
    for (const c of [0, 1, 99, 100, 101, 123456, 99999999, -50]) expect(parseBRL(formatBRL(c))).toBe(c);
  });
});

describe("utilitários", () => {
  it("looksLikeBRL", () => {
    expect(looksLikeBRL("1.234,56")).toBe(true);
    expect(looksLikeBRL("-0,02")).toBe(true);
    expect(looksLikeBRL("07/12")).toBe(false);
    expect(looksLikeBRL("3")).toBe(false);
  });
  it("sumCents e percent", () => {
    expect(sumCents([1, 2, 3])).toBe(6);
    expect(percent(1, 3)).toBe(33);
    expect(percent(1, 0)).toBe(0);
  });
});

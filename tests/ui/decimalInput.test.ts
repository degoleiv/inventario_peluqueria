import { describe, it, expect } from "vitest";
import {
  filterDecimalTyping,
  filterIntegerTyping,
  parseDecimalLoose,
  parseIntLoose,
  formatDecimalForInput,
} from "../../src/lib/decimalInput";

describe("filterDecimalTyping (función pura)", () => {
  it("convierte coma a punto", () => {
    expect(filterDecimalTyping("12,34")).toBe("12.34");
  });

  it("filtra caracteres no numéricos", () => {
    expect(filterDecimalTyping("a1b2c.3d")).toBe("12.3");
  });

  it("permite un único punto decimal", () => {
    expect(filterDecimalTyping("1.2.3.4")).toBe("1.234");
  });

  it("acepta string vacío", () => {
    expect(filterDecimalTyping("")).toBe("");
  });

  it("permite punto sin parte entera", () => {
    expect(filterDecimalTyping(".5")).toBe(".5");
  });
});

describe("parseDecimalLoose", () => {
  it("acepta coma o punto", () => {
    expect(parseDecimalLoose("3,14")).toBe(3.14);
    expect(parseDecimalLoose("3.14")).toBe(3.14);
  });

  it("retorna 0 para vacío o solo punto", () => {
    expect(parseDecimalLoose("")).toBe(0);
    expect(parseDecimalLoose(".")).toBe(0);
  });

  it("retorna 0 para no numérico", () => {
    expect(parseDecimalLoose("abc")).toBe(0);
  });
});

describe("formatDecimalForInput", () => {
  it("convierte número a string", () => {
    expect(formatDecimalForInput(0)).toBe("0");
    expect(formatDecimalForInput(3.14)).toBe("3.14");
  });

  it("retorna string vacío para Infinity / NaN", () => {
    expect(formatDecimalForInput(Number.POSITIVE_INFINITY)).toBe("");
    expect(formatDecimalForInput(Number.NaN)).toBe("");
  });
});

describe("filterIntegerTyping y parseIntLoose", () => {
  it("filterIntegerTyping deja solo dígitos", () => {
    expect(filterIntegerTyping("12.34abc")).toBe("1234");
    expect(filterIntegerTyping("---")).toBe("");
  });

  it("parseIntLoose usa fallback con vacío o no numérico", () => {
    expect(parseIntLoose("", 7)).toBe(7);
    expect(parseIntLoose("42", 7)).toBe(42);
    /* parseInt("abc", 10) → NaN, debería dar fallback */
    expect(parseIntLoose("abc", 99)).toBe(99);
  });
});

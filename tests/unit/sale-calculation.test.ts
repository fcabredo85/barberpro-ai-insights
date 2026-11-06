import { describe, expect, it } from "vitest";

import {
  basisPointsToDecimalString,
  basisPointsToPercentInput,
  centavosToDecimalString,
  decimalToBasisPoints,
  decimalToCentavos,
  divideRoundHalfUp,
  formatPercent,
  formatPeso,
  parsePercentToBasisPoints,
  parsePesosToCentavos,
} from "@/lib/business/money";
import { calculateSale } from "@/lib/business/sale";

describe("calculateSale", () => {
  it("spec case: ₱250.00 × 2 at 40% gives ₱500.00 revenue and ₱200.00 commission", () => {
    const totals = calculateSale({ unitPriceCentavos: 25_000, quantity: 2, commissionRateBp: 4_000 });
    expect(totals.grossCentavos).toBe(50_000);
    expect(totals.commissionCentavos).toBe(20_000);
    expect(formatPeso(totals.grossCentavos)).toBe("₱500.00");
    expect(formatPeso(totals.commissionCentavos)).toBe("₱200.00");
  });

  it("rounds commission half up to the centavo (₱1.25 at 50% = ₱0.625 → ₱0.63)", () => {
    expect(calculateSale({ unitPriceCentavos: 125, quantity: 1, commissionRateBp: 5_000 }).commissionCentavos).toBe(63);
  });

  it("rounds down below the half (₱199.99 × 3 at 33.33% = ₱199.970001 → ₱199.97)", () => {
    const totals = calculateSale({ unitPriceCentavos: 19_999, quantity: 3, commissionRateBp: 3_333 });
    expect(totals.grossCentavos).toBe(59_997);
    expect(totals.commissionCentavos).toBe(19_997);
  });

  it("avoids floating-point drift that naive math would introduce", () => {
    // 0.1 + 0.2 style errors: ₱0.10 × 3 at 10% must be exactly ₱0.03.
    const totals = calculateSale({ unitPriceCentavos: 10, quantity: 3, commissionRateBp: 1_000 });
    expect(totals).toMatchObject({ grossCentavos: 30, commissionCentavos: 3 });
  });

  it("handles 0% and 100% commission", () => {
    expect(calculateSale({ unitPriceCentavos: 25_000, quantity: 1, commissionRateBp: 0 }).commissionCentavos).toBe(0);
    expect(calculateSale({ unitPriceCentavos: 25_000, quantity: 1, commissionRateBp: 10_000 }).commissionCentavos).toBe(25_000);
  });

  it("stays exact at the maximum price and quantity", () => {
    const totals = calculateSale({ unitPriceCentavos: 10_000_000, quantity: 20, commissionRateBp: 9_999 });
    expect(totals.grossCentavos).toBe(200_000_000);
    expect(totals.commissionCentavos).toBe(199_980_000);
  });

  it.each([
    ["quantity 0", { unitPriceCentavos: 100, quantity: 0, commissionRateBp: 0 }],
    ["quantity 21", { unitPriceCentavos: 100, quantity: 21, commissionRateBp: 0 }],
    ["fractional quantity", { unitPriceCentavos: 100, quantity: 1.5, commissionRateBp: 0 }],
    ["zero price", { unitPriceCentavos: 0, quantity: 1, commissionRateBp: 0 }],
    ["fractional centavos", { unitPriceCentavos: 10.5, quantity: 1, commissionRateBp: 0 }],
    ["rate above 100%", { unitPriceCentavos: 100, quantity: 1, commissionRateBp: 10_001 }],
    ["negative rate", { unitPriceCentavos: 100, quantity: 1, commissionRateBp: -1 }],
  ])("rejects %s", (_label, input) => {
    expect(() => calculateSale(input)).toThrow(RangeError);
  });
});

describe("divideRoundHalfUp", () => {
  it.each([
    [5, 10, 1],
    [4, 10, 0],
    [15, 10, 2],
    [14_999, 10_000, 1],
    [15_000, 10_000, 2],
    [0, 7, 0],
  ])("%i / %i = %i", (n, d, expected) => {
    expect(divideRoundHalfUp(n, d)).toBe(expected);
  });
});

describe("peso and rate parsing", () => {
  it.each([
    ["250", 25_000],
    ["250.5", 25_050],
    ["250.50", 25_050],
    ["1,250.00", 125_000],
    ["  0.01 ", 1],
  ])("parses %j as %i centavos", (input, expected) => {
    expect(parsePesosToCentavos(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "1.234", "1e3", "₱250", "250."])("rejects %j as a peso amount", (input) => {
    expect(parsePesosToCentavos(input)).toBeNull();
  });

  it.each([
    ["40", 4_000],
    ["12.5", 1_250],
    ["33.33", 3_333],
    ["0", 0],
    ["100", 10_000],
    ["40%", 4_000],
  ])("parses %j%% as %i basis points", (input, expected) => {
    expect(parsePercentToBasisPoints(input)).toBe(expected);
  });

  it.each(["100.01", "101", "-1", "12.345", "forty", ""])("rejects %j as a commission rate", (input) => {
    expect(parsePercentToBasisPoints(input)).toBeNull();
  });
});

describe("database boundary conversion", () => {
  it("converts numeric values read from the database exactly", () => {
    expect(decimalToCentavos(250)).toBe(25_000);
    expect(decimalToCentavos(199.99)).toBe(19_999);
    expect(decimalToCentavos("0.10")).toBe(10);
    expect(decimalToBasisPoints(0.4)).toBe(4_000);
    expect(decimalToBasisPoints(0.3333)).toBe(3_333);
    expect(decimalToBasisPoints(1)).toBe(10_000);
  });

  it("rejects invalid database values instead of guessing", () => {
    expect(() => decimalToCentavos(-1)).toThrow(RangeError);
    expect(() => decimalToCentavos(1.005)).toThrow(RangeError);
    expect(() => decimalToBasisPoints(1.5)).toThrow(RangeError);
  });

  it("writes exact decimal strings and round-trips", () => {
    expect(centavosToDecimalString(50_050)).toBe("500.50");
    expect(centavosToDecimalString(5)).toBe("0.05");
    expect(basisPointsToDecimalString(4_000)).toBe("0.4000");
    expect(basisPointsToDecimalString(10_000)).toBe("1.0000");
    for (const c of [1, 99, 19_999, 10_000_000, 200_000_000]) {
      expect(decimalToCentavos(Number(centavosToDecimalString(c)))).toBe(c);
    }
  });
});

describe("display formatting", () => {
  it("formats pesos with separators and two decimals", () => {
    expect(formatPeso(0)).toBe("₱0.00");
    expect(formatPeso(125_050)).toBe("₱1,250.50");
    expect(formatPeso(200_000_000)).toBe("₱2,000,000.00");
  });

  it("formats percentages without trailing zeros", () => {
    expect(formatPercent(4_000)).toBe("40%");
    expect(formatPercent(1_250)).toBe("12.5%");
    expect(formatPercent(3_333)).toBe("33.33%");
    expect(basisPointsToPercentInput(1_250)).toBe("12.5");
  });
});

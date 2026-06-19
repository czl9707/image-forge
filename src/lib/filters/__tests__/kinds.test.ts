// src/lib/filters/__tests__/kinds.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_STACK, KIND_ORDER, makeFilter } from "../kinds";

describe("kinds", () => {
  it("DEFAULT_STACK has all five kinds in canonical order, enabled at neutral", () => {
    expect(DEFAULT_STACK.map((f) => f.kind)).toEqual(KIND_ORDER);
    expect(DEFAULT_STACK.every((f) => f.enabled)).toBe(true);
    expect(DEFAULT_STACK.length).toBe(5);
  });

  it("makeFilter builds a neutral hue instance with colorize off", () => {
    const f = makeFilter("hue", "x");
    expect(f).toMatchObject({
      id: "x",
      kind: "hue",
      enabled: true,
      shift: 0,
      colorize: false,
      colorHue: 0,
      colorSat: 1,
    });
  });
});

// src/lib/filters/__tests__/stackOps.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_STACK } from "../kinds";
import {
  addFilter,
  amountOf,
  moveFilter,
  removeFilter,
  toggleFilter,
  updateFilter,
  withAmount,
} from "../stackOps";

describe("stackOps", () => {
  it("amountOf reads the primary value for each kind", () => {
    const blur = DEFAULT_STACK.find((f) => f.kind === "blur")!;
    const hue = DEFAULT_STACK.find((f) => f.kind === "hue")!;
    expect(amountOf({ ...blur, radius: 5 })).toBe(5);
    expect(amountOf({ ...hue, shift: 30 })).toBe(30);
  });

  it("withAmount sets the primary value for each kind", () => {
    const blur = DEFAULT_STACK.find((f) => f.kind === "blur")!;
    const hue = DEFAULT_STACK.find((f) => f.kind === "hue")!;
    expect(amountOf(withAmount(blur, 7))).toBe(7);
    expect(amountOf(withAmount(hue, 42))).toBe(42);
  });

  it("updateFilter merges a patch into the matched instance only", () => {
    const next = updateFilter(DEFAULT_STACK, "blur", { enabled: false });
    expect(next.find((f) => f.id === "blur")!.enabled).toBe(false);
    expect(DEFAULT_STACK.find((f) => f.id === "blur")!.enabled).toBe(true); // unchanged
  });

  it("removeFilter drops the matched instance", () => {
    expect(removeFilter(DEFAULT_STACK, "blur").length).toBe(4);
  });

  it("toggleFilter flips enabled", () => {
    const next = toggleFilter(DEFAULT_STACK, "contrast");
    expect(next.find((f) => f.id === "contrast")!.enabled).toBe(false);
  });

  it("addFilter always appends, allowing duplicate kinds", () => {
    const one = addFilter([], "blur", "b1");
    expect(one).toHaveLength(1);
    const two = addFilter(one, "blur", "b2");
    expect(two).toHaveLength(2);
    expect(two[1].id).toBe("b2");
  });

  it("moveFilter reorders and clamps", () => {
    const ids = (s: typeof DEFAULT_STACK) => s.map((f) => f.id);
    expect(ids(moveFilter(DEFAULT_STACK, 0, 2))).toEqual([
      "brightness",
      "contrast",
      "blur",
      "saturation",
      "hue",
    ]);
    expect(moveFilter(DEFAULT_STACK, 0, 0)).toBe(DEFAULT_STACK); // no-op returns same ref
    expect(moveFilter(DEFAULT_STACK, -1, 0)).toBe(DEFAULT_STACK); // out of range -> same ref
  });
});

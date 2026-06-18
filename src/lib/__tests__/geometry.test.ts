// src/lib/__tests__/geometry.test.ts
import { describe, expect, it } from "vitest";
import { clampRect, toPixels, type Rect } from "../geometry";

describe("clampRect", () => {
  it("passes through an in-bounds rect", () => {
    expect(clampRect({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 0.05)).toEqual({
      x: 0.2,
      y: 0.2,
      w: 0.5,
      h: 0.5,
    });
  });

  it("enforces a minimum size", () => {
    const r = clampRect({ x: 0.5, y: 0.5, w: 0.01, h: 0.01 }, 0.1);
    expect(r.w).toBe(0.1);
    expect(r.h).toBe(0.1);
  });

  it("clamps width/height to 1", () => {
    const r = clampRect({ x: 0, y: 0, w: 2, h: 3 }, 0.05);
    expect(r.w).toBe(1);
    expect(r.h).toBe(1);
  });

  it("keeps the rect inside [0,1] after resizing", () => {
    // w=0.8, x=0.5 would overflow; x clamps to 1-0.8=0.2
    // (use closeTo — 1 - 0.8 is 0.19999...96 in IEEE-754)
    const r = clampRect({ x: 0.5, y: 0, w: 0.8, h: 0.2 }, 0.05);
    expect(r.x).toBeCloseTo(0.2, 10);
    expect(r.x + r.w).toBeLessThanOrEqual(1.0000001);
  });
});

describe("toPixels", () => {
  it("scales a normalized rect to pixels", () => {
    const r: Rect = { x: 0.5, y: 0.25, w: 0.5, h: 0.5 };
    expect(toPixels(r, 1000, 800)).toEqual({
      x: 500,
      y: 200,
      w: 500,
      h: 400,
    });
  });
});

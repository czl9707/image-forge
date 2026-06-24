import { describe, expect, it } from "vitest";
import { tileLayout } from "../dimensions";

describe("tileLayout", () => {
  it("lr splits horizontally", () => {
    const t = tileLayout("lr", { cw: 1000, ch: 600 });
    expect(t.tileW).toBe(500);
    expect(t.tileH).toBe(600);
    expect(t.A).toEqual({ x: 0, y: 0 });
    expect(t.B).toEqual({ x: 500, y: 0 });
  });
  it("tb splits vertically", () => {
    const t = tileLayout("tb", { cw: 1000, ch: 600 });
    expect(t.tileW).toBe(1000);
    expect(t.tileH).toBe(300);
    expect(t.A).toEqual({ x: 0, y: 0 });
    expect(t.B).toEqual({ x: 0, y: 300 });
  });
});

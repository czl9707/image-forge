import { describe, expect, it } from "vitest";
import { canvasDims, tileLayout, containFit } from "../dimensions";

describe("canvasDims", () => {
  it("16:9 left/right = wide", () => {
    expect(canvasDims("16:9", "lr", 1080)).toEqual({ cw: 1080, ch: 608 });
  });
  it("16:9 top/bottom rotates to 9:16 = tall", () => {
    expect(canvasDims("16:9", "tb", 1080)).toEqual({ cw: 608, ch: 1080 });
  });
  it("4:3 left/right = wide", () => {
    expect(canvasDims("4:3", "lr", 1080)).toEqual({ cw: 1080, ch: 810 });
  });
  it("4:3 top/bottom rotates to 3:4 = tall", () => {
    expect(canvasDims("4:3", "tb", 1080)).toEqual({ cw: 810, ch: 1080 });
  });
  it("1:1 is symmetric under both orientations", () => {
    expect(canvasDims("1:1", "lr", 1080)).toEqual({ cw: 1080, ch: 1080 });
    expect(canvasDims("1:1", "tb", 1080)).toEqual({ cw: 1080, ch: 1080 });
  });
});

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

describe("containFit", () => {
  it("scales down to fit (width-limited)", () => {
    expect(containFit(1000, 1000, 500, 800)).toEqual({
      dispW: 500,
      dispH: 500,
      scale: 0.5,
    });
  });
  it("scales down to fit (height-limited)", () => {
    expect(containFit(1000, 1000, 800, 250)).toEqual({
      dispW: 250,
      dispH: 250,
      scale: 0.25,
    });
  });
});

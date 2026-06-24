import { describe, expect, it } from "vitest";
import {
  canvasDims,
  placeholderTextStrip,
} from "../dimensions";

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

describe("placeholderTextStrip", () => {
  it("anchors to the top of the tile and is 15% of tile height", () => {
    expect(placeholderTextStrip(400)).toEqual({ y: 0, height: 60 });
  });
  it("scales with tile height", () => {
    expect(placeholderTextStrip(800)).toEqual({ y: 0, height: 120 });
  });
  it("stays within the tile bounds", () => {
    const { y, height } = placeholderTextStrip(200);
    expect(y).toBe(0);
    expect(y + height).toBeLessThanOrEqual(200);
  });
});

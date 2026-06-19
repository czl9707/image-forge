// src/lib/filters/__tests__/colorize.test.ts
import { describe, expect, it } from "vitest";
import { colorize, hslToRgb, luminance } from "../colorize";

function gray(v: number): [number, number, number] {
  return [v, v, v];
}

describe("colorize helpers", () => {
  it("luminance matches the Rec.601 weighted sum, normalized to [0,1]", () => {
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(luminance(0, 0, 0)).toBeCloseTo(0, 5);
    expect(luminance(255, 0, 0)).toBeCloseTo(0.299, 3);
  });

  it("hslToRgb at L=0 and L=1 is black and white regardless of hue/sat", () => {
    expect(hslToRgb(0, 1, 0)).toEqual([0, 0, 0]);
    expect(hslToRgb(180, 1, 1)).toEqual([255, 255, 255]);
  });

  it("hslToRgb red/green/blue at L=0.5, full sat", () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual([255, 0, 0]);
    expect(hslToRgb(120, 1, 0.5)).toEqual([0, 255, 0]);
    expect(hslToRgb(240, 1, 0.5)).toEqual([0, 0, 255]);
  });
});

describe("colorize filter", () => {
  it("repaints each pixel to hslToRgb(colorHue, colorSat, luminance(px))", () => {
    const data = new Uint8ClampedArray([
      ...gray(128), 255, // mid gray
      ...gray(255), 255, // white
      ...gray(0), 255, // black
      ...gray(100), 128, // alpha 128
    ]);
    const imageData = { data, width: 4, height: 1 } as ImageData;

    const ctx = { colorHue: 0, colorSat: 1 };
    colorize.call(ctx, imageData);

    const [r0, g0, b0] = hslToRgb(0, 1, luminance(128, 128, 128));
    expect([data[0], data[1], data[2]]).toEqual([r0, g0, b0]);
    // white stays white, black stays black
    expect([data[4], data[5], data[6]]).toEqual([255, 255, 255]);
    expect([data[8], data[9], data[10]]).toEqual([0, 0, 0]);
    expect(data[15]).toBe(128); // alpha untouched
  });
});

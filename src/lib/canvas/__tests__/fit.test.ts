import { describe, expect, it } from "vitest";
import { coverFit } from "../fit";

describe("coverFit", () => {
  it("scales to cover the box (picks the larger scale)", () => {
    // image 200x100, box 100x100 → need scale 1 (width-limited? max(0.5,1)=1)
    const f = coverFit(200, 100, 100, 100);
    expect(f.scale).toBe(1);
    expect(f.x).toBe(-50); // drawW=200 centered in 100 → (100-200)/2
    expect(f.y).toBe(0);
  });

  it("scales a landscape image into a portrait box", () => {
    // image 400x200, box 100x200 → max(100/400, 200/200)=1 → drawW=400,drawH=200
    const f = coverFit(400, 200, 100, 200);
    expect(f.scale).toBe(1);
    expect(f.x).toBe(-150); // (100-400)/2
    expect(f.y).toBe(0);
  });

  it("upscales a small image to cover", () => {
    // image 50x50, box 100x100 → scale 2
    const f = coverFit(50, 50, 100, 100);
    expect(f.scale).toBe(2);
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
  });
});

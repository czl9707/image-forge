import { describe, expect, it } from "vitest";
import { clampCoverPos, containFit, coverFit } from "../fit";

describe("coverFit", () => {
  it("scales to cover the box (picks the larger scale)", () => {
    // image 200x100, box 100x100 → max(100/200, 100/100) = 1
    expect(coverFit(200, 100, 100, 100).scale).toBe(1);
  });

  it("scales a landscape image into a portrait box", () => {
    // image 400x200, box 100x200 → max(100/400, 200/200) = 1
    expect(coverFit(400, 200, 100, 200).scale).toBe(1);
  });

  it("upscales a small image to cover", () => {
    // image 50x50, box 100x100 → scale 2
    expect(coverFit(50, 50, 100, 100).scale).toBe(2);
  });

  it("returns only the scale (no centered position)", () => {
    expect(coverFit(200, 100, 100, 100)).toEqual({ scale: 1 });
  });
});

describe("clampCoverPos", () => {
  // Invariant the helper exists to enforce: after clamping, a (width × height)
  // image placed at the returned (x, y) must fully cover the (tileW × tileH)
  // tile — left/top edge at or past 0, right/bottom edge at or past the tile.
  const TILE = 100;

  function covers(
    x: number,
    y: number,
    w: number,
    h: number,
  ): { left: boolean; top: boolean; right: boolean; bottom: boolean } {
    return {
      left: x <= 0,
      top: y <= 0,
      right: x + w >= TILE,
      bottom: y + h >= TILE,
    };
  }

  it("leaves a centered cover-fit position unchanged", () => {
    // 200×200 image in 100×100 tile, centered → x=y=-50, fully covers.
    const r = clampCoverPos(-50, -50, 200, 200, TILE, TILE);
    expect(r).toEqual({ x: -50, y: -50 });
    expect(covers(r.x, r.y, 200, 200)).toEqual({
      left: true,
      top: true,
      right: true,
      bottom: true,
    });
  });

  it("clamps a drag that would reveal the right edge back to full coverage", () => {
    // Image 200 wide, tile 100 → x must stay in [-100, 0]. Push past 0.
    const r = clampCoverPos(40, -50, 200, 200, TILE, TILE);
    expect(r.x).toBe(0);
    expect(covers(r.x, r.y, 200, 200).right).toBe(true);
  });

  it("clamps a drag that would reveal the left edge", () => {
    // x must stay >= tileW - width = -100. Push further left to -200.
    const r = clampCoverPos(-200, -50, 200, 200, TILE, TILE);
    expect(r.x).toBe(-100);
    expect(covers(r.x, r.y, 200, 200).left).toBe(true);
  });

  it("clamps independently per axis (over-pan both directions)", () => {
    const r = clampCoverPos(60, -300, 200, 400, TILE, TILE);
    // width 200 → x in [-100, 0]; height 400 → y in [-300, 0]
    expect(r).toEqual({ x: 0, y: -300 });
  });

  it("pins a zoom-1 cover image (exactly tile-sized) to center — no panning slack", () => {
    // width == tileW, height == tileH → the only covering position is 0,0.
    const r = clampCoverPos(-20, 30, TILE, TILE, TILE, TILE);
    expect(r).toEqual({ x: 0, y: 0 });
  });

  it("never produces a gap across a sweep of pan values (property-style)", () => {
    const w = 250;
    const h = 180;
    for (let p = -5; p <= 5; p += 0.25) {
      const r = clampCoverPos(p * 50, p * 50, w, h, TILE, TILE);
      const c = covers(r.x, r.y, w, h);
      expect(c).toEqual({ left: true, top: true, right: true, bottom: true });
    }
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

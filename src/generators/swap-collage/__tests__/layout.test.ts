import { describe, expect, it } from "vitest";
import { solveSwapLayout, solveTransform } from "../layout";
import { tileLayout } from "../dimensions";
import type { Rect } from "@/lib/geometry";
import type { Slot, Transform } from "../swapReducer";

// A 400×200 canvas split left/right → two 200×200 tiles.
const TILES = tileLayout("lr", { cw: 400, ch: 200 });
const TILE_W = TILES.tileW;
const TILE_H = TILES.tileH;

const ID: Transform = { panX: 0, panY: 0, zoom: 1 };

function layout(
  images: Record<Slot, { w: number; h: number } | null>,
  xforms: Record<Slot, Transform> = { A: ID, B: ID },
  mask: Rect = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
) {
  return solveSwapLayout({ tiles: TILES, mask, images, xforms });
}

/** A placement fully covers its tile — no empty edge, on either axis. */
function covers(p: { x: number; y: number; width: number; height: number }) {
  return {
    left: p.x <= 0,
    top: p.y <= 0,
    right: p.x + p.width >= TILE_W,
    bottom: p.y + p.height >= TILE_H,
  };
}

describe("solveSwapLayout — the swap", () => {
  it("each tile's overlay IS the other tile's base (the swap cross-reference)", () => {
    // A's overlay shows B's image framed by B's transform; B's base is the same
    // image framed by the same transform. So they must be identical — and
    // vice versa. This is "the swap" reduced to two equalities.
    const l = layout(
      { A: { w: 400, h: 200 }, B: { w: 200, h: 400 } },
      {
        A: { panX: 0.1, panY: -0.2, zoom: 1.5 },
        B: { panX: -0.1, panY: 0.3, zoom: 2 },
      },
    );
    expect(l.tiles.A.overlay).toEqual(l.tiles.B.base);
    expect(l.tiles.B.overlay).toEqual(l.tiles.A.base);
  });

  it("A.base reflects A's own image + transform, not B's", () => {
    const l = layout(
      { A: { w: 400, h: 200 }, B: { w: 200, h: 400 } },
      {
        A: { panX: 0, panY: 0, zoom: 1 },
        B: { panX: 0, panY: 0, zoom: 3 },
      },
    );
    // A is 400×200 in a 200×200 tile at zoom 1 → width 400. B's zoom must not
    // leak into A.base (zoom 3 would make width 1200).
    expect(l.tiles.A.base!.width).toBe(400);
    expect(l.tiles.A.base!.height).toBe(200);
  });
});

describe("solveSwapLayout — coverage", () => {
  it("every base placement fully covers its tile (no empty edge)", () => {
    const l = layout(
      { A: { w: 400, h: 200 }, B: { w: 200, h: 400 } },
      {
        A: { panX: 0.2, panY: 0, zoom: 1.4 },
        B: { panX: -0.2, panY: 0.1, zoom: 1.8 },
      },
    );
    expect(covers(l.tiles.A.base!)).toEqual({
      left: true,
      top: true,
      right: true,
      bottom: true,
    });
    expect(covers(l.tiles.B.base!)).toEqual({
      left: true,
      top: true,
      right: true,
      bottom: true,
    });
  });
});

describe("solveSwapLayout — missing images", () => {
  it("a missing slot has no base, and the other tile has no overlay of it", () => {
    const l = layout({ A: { w: 400, h: 200 }, B: null });
    expect(l.tiles.A.base).not.toBeNull();
    expect(l.tiles.A.overlay).toBeNull(); // B is missing → A has no overlay
    expect(l.tiles.B.base).toBeNull();
    expect(l.tiles.B.overlay).not.toBeNull(); // A present → B overlays A
  });

  it("both missing → all null", () => {
    const l = layout({ A: null, B: null });
    expect(l.tiles.A).toEqual({ base: null, overlay: null });
    expect(l.tiles.B).toEqual({ base: null, overlay: null });
  });
});

describe("solveSwapLayout — mask", () => {
  it("maps the normalized mask to tile pixels", () => {
    const l = layout(
      { A: { w: 400, h: 200 }, B: { w: 200, h: 400 } },
      { A: ID, B: ID },
      { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    );
    expect(l.maskPx).toEqual({ x: 50, y: 50, w: 100, h: 100 });
  });
});

describe("solveTransform — inverse of placement", () => {
  // 400×200 landscape in a 200×200 tile: cover scale 1, so at zoom 1 the image
  // is 400×200 — x can pan in [-200, 0], y is pinned to 0.
  const W = 400;
  const H = 200;

  it("round-trips a transform with zoom and pan (within the cover window)", () => {
    const xform: Transform = { panX: 0.2, panY: 0, zoom: 1.5 };
    // Forward via the layout, then invert.
    const l = layout({ A: { w: W, h: H }, B: null }, { A: xform, B: ID });
    const p = l.tiles.A.base!;
    const back = solveTransform(p.x, p.y, p.width, p.height, W, H, TILE_W, TILE_H);
    expect(back).toEqual(xform);
  });

  it("clamps an out-of-window drag before storing the transform", () => {
    // width 600 at zoom 1.5 → x must stay in [200-600, 0] = [-400, 0]. Drag to
    // x = 500 (far past the right edge). The stored transform must be the one
    // that lands at the clamped x = 0, not at 500.
    const zoom = 1.5;
    const scale = Math.max(TILE_W / W, TILE_H / H); // 1
    const width = W * scale * zoom; // 600
    const height = H * scale * zoom; // 300
    const back = solveTransform(500, 0, width, height, W, H, TILE_W, TILE_H);
    // panX that corresponds to the clamped x = 0:
    const expectedPanX = (0 - (TILE_W - width) / 2) / TILE_W;
    expect(back.panX).toBe(expectedPanX);
    // And re-running the forward layout with that transform stays in-window:
    const l = layout({ A: { w: W, h: H }, B: null }, { A: back, B: ID });
    expect(covers(l.tiles.A.base!)).toEqual({
      left: true,
      top: true,
      right: true,
      bottom: true,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  BORDER_COLOR,
  BORDER_OPACITY,
  BORDER_WIDTH,
  MIN_STRIP_MULT,
  MAX_STRIP_MULT,
  IDENTITY_XFORM,
  cellRects,
  hitTest,
  placement,
  rollStrips,
  splitLines,
  uniformStrips,
} from "../../generators/grid-reveal/layout";

describe("uniformStrips", () => {
  it("partitions 1 into n equal strips", () => {
    expect(uniformStrips(4)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(uniformStrips(4).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("returns [] for n <= 0", () => {
    expect(uniformStrips(0)).toEqual([]);
  });
});

describe("rollStrips", () => {
  it("returns n positive strips summing to 1", () => {
    const strips = rollStrips(5);
    expect(strips).toHaveLength(5);
    strips.forEach((s) => expect(s).toBeGreaterThan(0));
    expect(strips.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("produces a deterministic clamped partition for a seeded rng", () => {
    // rng sequence 0,1,0,1 → raw = [lo, hi, lo, hi]; for n=4 unit=0.25,
    // lo=0.125, hi=0.375, sum=1.0 so normalized == raw.
    const seq = [0, 1, 0, 1];
    let i = 0;
    const rng = () => seq[i++] ?? 0;
    expect(rollStrips(4, rng)).toEqual([0.125, 0.375, 0.125, 0.375]);
  });

  it("keeps every raw draw within [MIN,MAX]·unit before normalization", () => {
    // With rng returning the min endpoint each call, every raw draw == lo.
    const unit = 1 / 4;
    const lo = MIN_STRIP_MULT * unit;
    const hi = MAX_STRIP_MULT * unit;
    expect(lo).toBeLessThan(hi);
    const strips = rollStrips(4, () => 0);
    // all equal (constant rng) → uniform
    expect(strips).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
});

describe("cellRects", () => {
  it("tiles the canvas into rows×cols rects with no gaps", () => {
    const grid = cellRects(uniformStrips(2), uniformStrips(2), 100, 100);
    expect(grid).toEqual([
      [
        { x: 0, y: 0, w: 50, h: 50 },
        { x: 50, y: 0, w: 50, h: 50 },
      ],
      [
        { x: 0, y: 50, w: 50, h: 50 },
        { x: 50, y: 50, w: 50, h: 50 },
      ],
    ]);
  });

  it("total cell area equals the canvas area", () => {
    const grid = cellRects(uniformStrips(3), uniformStrips(2), 90, 60);
    const area = grid.flat().reduce((a, c) => a + c.w * c.h, 0);
    expect(area).toBeCloseTo(90 * 60, 6);
  });
});

describe("hitTest", () => {
  const cols = uniformStrips(2);
  const rows = uniformStrips(2);
  it("maps a point to its cell", () => {
    expect(hitTest(10, 10, cols, rows, 100, 100)).toEqual({ row: 0, col: 0 });
    expect(hitTest(60, 10, cols, rows, 100, 100)).toEqual({ row: 0, col: 1 });
    expect(hitTest(10, 60, cols, rows, 100, 100)).toEqual({ row: 1, col: 0 });
  });
  it("returns null off-canvas", () => {
    expect(hitTest(-1, 10, cols, rows, 100, 100)).toBeNull();
    expect(hitTest(10, -1, cols, rows, 100, 100)).toBeNull();
    expect(hitTest(101, 10, cols, rows, 100, 100)).toBeNull();
  });
  it("clamps the far boundary into the last cell", () => {
    expect(hitTest(100, 100, cols, rows, 100, 100)).toEqual({ row: 1, col: 1 });
  });
});

describe("placement", () => {
  it("cover-fits and centers at panX/panY = 0.5", () => {
    // image 200×100 into 100×100 → scale 1, zoom 1 → imgW 200, imgH 100
    const p = placement(200, 100, 100, 100, IDENTITY_XFORM);
    expect(p).toEqual({ x: -50, y: 0, width: 200, height: 100 });
  });
  it("always covers the viewport at pan extremes", () => {
    const lo = placement(200, 100, 100, 100, { panX: 0, panY: 0, zoom: 1 });
    expect(lo.x).toBe(0); // left edge visible, right covered
    const hi = placement(200, 100, 100, 100, { panX: 1, panY: 1, zoom: 1 });
    expect(hi.x).toBe(-100); // right edge visible, left covered
  });
  it("scales the image by zoom and widens the pan range", () => {
    // zoom 2 → imgW 400, imgH 200; centered → x = -(400-100)*0.5 = -150
    const p = placement(200, 100, 100, 100, { panX: 0.5, panY: 0.5, zoom: 2 });
    expect(p).toEqual({ x: -150, y: -50, width: 400, height: 200 });
    // pan extremes still cover at zoom 2
    expect(placement(200, 100, 100, 100, { panX: 0, panY: 0, zoom: 2 }).x).toBe(0);
    expect(placement(200, 100, 100, 100, { panX: 1, panY: 1, zoom: 2 }).x).toBe(-300);
  });
});

describe("splitLines", () => {
  it("returns interior boundary positions", () => {
    expect(splitLines(uniformStrips(3), 90)).toEqual([30, 60]);
  });
  it("returns none for a single strip", () => {
    expect(splitLines(uniformStrips(1), 100)).toEqual([]);
  });
});

describe("constants", () => {
  it("exposes the agreed border constants", () => {
    expect(BORDER_COLOR).toBe("#888888");
    expect(BORDER_OPACITY).toBe(0.75);
    expect(BORDER_WIDTH).toBe(1);
  });
});

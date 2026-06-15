# Collage Studio — P1 Render Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure, fully unit-tested rendering layer that turns two images + a shared normalized mask into a swapped collage canvas — no React, no DOM coupling beyond an injectable canvas factory.

**Architecture:** Three pure modules: `geometry` (rect clamp + normalize→pixels), `fit` (cover/contain/stretch source/dest rects), and `renderSwap` (composes tiles and swaps the mask region via `getImageData`/`putImageData`). `renderSwap` takes an injectable `createCanvas` factory so tests run under `@napi-rs/canvas` in Node while the browser passes a DOM factory. All functions are deterministic and side-effect-free except canvas mutation.

**Tech Stack:** TypeScript, vitest, `@napi-rs/canvas` (dev only — Node canvas for tests).

**Reference spec:** `docs/superpowers/specs/2026-06-15-collage-studio-design.md` (sections 5, 9)

---

## File Structure (this phase)

- `src/lib/geometry.ts` — `Rect` type, `clampRect`, `toPixels`. Pure.
- `src/lib/canvas/fit.ts` — `FitMode`, `FitResult`, `computeFit`. Pure.
- `src/lib/canvas/renderSwap.ts` — `SwapInput`, `CanvasLike`, `renderSwap`. Pure (DOM only via injected factory).
- `src/lib/__tests__/geometry.test.ts`
- `src/lib/canvas/__tests__/fit.test.ts`
- `src/lib/canvas/__tests__/renderSwap.test.ts`
- `src/lib/canvas/__tests__/canvasFactory.ts` — Node `@napi-rs/canvas` factory + fixture-image builder for tests.

No React files are created in this phase.

---

### Task 1: Test canvas factory + fixtures helper

**Files:**
- Create: `src/lib/canvas/__tests__/canvasFactory.ts`
- Modify: `package.json` (devDep)

- [ ] **Step 1: Install the Node canvas shim**

```bash
npm install -D @napi-rs/canvas
```

- [ ] **Step 2: Create the test factory + fixture builder**

```ts
// src/lib/canvas/__tests__/canvasFactory.ts
import { createCanvas } from "@napi-rs/canvas";

// Loose canvas type so this test helper does NOT depend on renderSwap.ts (created in Task 4).
// `any` context makes it structurally assignable to renderSwap's CanvasLike, so it can be
// passed as renderSwap's createCanvas argument without a cast.
type AnyCanvas = {
  width: number;
  height: number;
  getContext(id: "2d"): any;
};

export function nodeCreateCanvas(w: number, h: number): AnyCanvas {
  return createCanvas(w, h) as unknown as AnyCanvas;
}

export function solidImage(w: number, h: number, rgba: [number, number, number, number]): AnyCanvas {
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]})`;
  ctx.fillRect(0, 0, w, h);
  return c as unknown as AnyCanvas;
}

export function pixelAt(c: AnyCanvas, x: number, y: number): [number, number, number, number] {
  const d = c.getContext("2d").getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/canvas/__tests__/canvasFactory.ts package.json package-lock.json
git commit -m "test(p1): add @napi-rs/canvas factory and fixture helpers"
```

---

### Task 2: `geometry` module (TDD)

**Files:**
- Test: `src/lib/__tests__/geometry.test.ts`
- Create: `src/lib/geometry.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/geometry.test.ts
import { describe, expect, it } from "vitest";
import { clampRect, toPixels } from "../geometry";

describe("clampRect", () => {
  it("enforces a minimum size", () => {
    expect(clampRect({ x: 0.5, y: 0.5, w: 0, h: 0 })).toEqual({ x: 0.5, y: 0.5, w: 0.01, h: 0.01 });
  });

  it("keeps an in-bounds rect unchanged", () => {
    const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    expect(clampRect(r)).toEqual(r);
  });

  it("shifts a rect that overflows the right edge leftward", () => {
    const r = clampRect({ x: 0.8, y: 0.0, w: 0.5, h: 0.1 });
    expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.w).toBe(0.5);
    expect(r.x).toBeCloseTo(0.5, 6);
  });

  it("clamps negative origin to 0", () => {
    const r = clampRect({ x: -0.2, y: -0.3, w: 0.2, h: 0.2 });
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });
});

describe("toPixels", () => {
  it("scales normalized rect to pixel space and rounds", () => {
    expect(toPixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 100, 100)).toEqual({
      x: 25, y: 50, w: 50, h: 25,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/geometry.test.ts`
Expected: FAIL — "Cannot find module '../geometry'".

- [ ] **Step 3: Implement `geometry.ts`**

```ts
// src/lib/geometry.ts
export type Rect = { x: number; y: number; w: number; h: number };
export type PixelRect = { x: number; y: number; w: number; h: number };

const MIN_SIZE = 0.01;

export function clampRect(r: Rect): Rect {
  let { x, y, w, h } = r;
  w = Math.max(w, MIN_SIZE);
  h = Math.max(h, MIN_SIZE);

  // if the minimum size alone exceeds the canvas, fill it
  if (w >= 1) { w = 1; x = 0; }
  if (h >= 1) { h = 1; y = 0; }

  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + w > 1) x = 1 - w;
  if (y + h > 1) y = 1 - h;

  return { x, y, w, h };
}

export function toPixels(r: Rect, w: number, h: number): PixelRect {
  return {
    x: Math.round(r.x * w),
    y: Math.round(r.y * h),
    w: Math.round(r.w * w),
    h: Math.round(r.h * h),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/geometry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry.ts src/lib/__tests__/geometry.test.ts
git commit -m "feat(p1): add geometry (clampRect, toPixels) with tests"
```

---

### Task 3: `fit` module (TDD)

**Files:**
- Test: `src/lib/canvas/__tests__/fit.test.ts`
- Create: `src/lib/canvas/fit.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/canvas/__tests__/fit.test.ts
import { describe, expect, it } from "vitest";
import { computeFit } from "../fit";

describe("computeFit", () => {
  it("stretch maps full source to full box", () => {
    const f = computeFit(200, 100, 80, 80, "stretch");
    expect(f).toEqual({ sx: 0, sy: 0, sw: 200, sh: 100, dx: 0, dy: 0, dw: 80, dh: 80 });
  });

  it("cover scales to fill the box and centers (overflow clipped)", () => {
    // 200x100 into 80x80: scale = max(80/200, 80/100) = 0.8 -> dest 160x80, centered dx=-40
    const f = computeFit(200, 100, 80, 80, "cover");
    expect(f.sw).toBe(200);
    expect(f.sh).toBe(100);
    expect(f.dw).toBe(160);
    expect(f.dh).toBe(80);
    expect(f.dx).toBe(-40);
    expect(f.dy).toBe(0);
  });

  it("contain scales to fit inside the box (letterbox)", () => {
    // 200x100 into 80x80: scale = min(0.4, 0.8) = 0.4 -> dest 80x40, centered dy=20
    const f = computeFit(200, 100, 80, 80, "contain");
    expect(f.dw).toBe(80);
    expect(f.dh).toBe(40);
    expect(f.dx).toBe(0);
    expect(f.dy).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas/__tests__/fit.test.ts`
Expected: FAIL — "Cannot find module '../fit'".

- [ ] **Step 3: Implement `fit.ts`**

```ts
// src/lib/canvas/fit.ts
export type FitMode = "cover" | "contain" | "stretch";

export type FitResult = {
  sx: number; sy: number; sw: number; sh: number; // source crop
  dx: number; dy: number; dw: number; dh: number; // dest box
};

export function computeFit(iw: number, ih: number, bw: number, bh: number, mode: FitMode): FitResult {
  if (mode === "stretch") {
    return { sx: 0, sy: 0, sw: iw, sh: ih, dx: 0, dy: 0, dw: bw, dh: bh };
  }
  const scale = mode === "cover" ? Math.max(bw / iw, bh / ih) : Math.min(bw / iw, bh / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  return { sx: 0, sy: 0, sw: iw, sh: ih, dx: (bw - dw) / 2, dy: (bh - dh) / 2, dw, dh };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas/__tests__/fit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/fit.ts src/lib/canvas/__tests__/fit.test.ts
git commit -m "feat(p1): add fit (cover/contain/stretch) with tests"
```

---

### Task 4: `renderSwap` module (TDD)

**Files:**
- Test: `src/lib/canvas/__tests__/renderSwap.test.ts`
- Create: `src/lib/canvas/renderSwap.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/canvas/__tests__/renderSwap.test.ts
import { describe, expect, it } from "vitest";
import { renderSwap } from "../renderSwap";
import { nodeCreateCanvas, pixelAt, solidImage } from "./canvasFactory";

describe("renderSwap", () => {
  it("returns a canvas sized for two stacked tiles (tb)", () => {
    const a = solidImage(100, 100, [255, 0, 0, 255]);
    const b = solidImage(100, 100, [0, 0, 255, 255]);
    const out = renderSwap(
      { imgA: a as never, imgB: b as never, orientation: "tb", tile: { w: 100, h: 100 }, gap: 0, mask: { x: 0, y: 0, w: 1, h: 1 }, fit: "cover" },
      nodeCreateCanvas,
    );
    expect(out.width).toBe(100);
    expect(out.height).toBe(200);
  });

  it("returns a canvas sized for two side-by-side tiles (lr)", () => {
    const a = solidImage(100, 100, [255, 0, 0, 255]);
    const b = solidImage(100, 100, [0, 0, 255, 255]);
    const out = renderSwap(
      { imgA: a as never, imgB: b as never, orientation: "lr", tile: { w: 100, h: 100 }, gap: 0, mask: { x: 0, y: 0, w: 1, h: 1 }, fit: "cover" },
      nodeCreateCanvas,
    );
    expect(out.width).toBe(200);
    expect(out.height).toBe(100);
  });

  it("swaps the mask region: A's mask becomes B's color and vice versa", () => {
    const a = solidImage(100, 100, [255, 0, 0, 255]); // red
    const b = solidImage(100, 100, [0, 0, 255, 255]); // blue
    const mask = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }; // center 50x50

    const out = renderSwap(
      { imgA: a as never, imgB: b as never, orientation: "tb", tile: { w: 100, h: 100 }, gap: 0, mask, fit: "cover" },
      nodeCreateCanvas,
    );

    // top tile (A) center now holds B's blue
    expect(pixelAt(out, 50, 50)).toEqual([0, 0, 255, 255]);
    // bottom tile (B) center now holds A's red (tile B starts at y=100)
    expect(pixelAt(out, 50, 150)).toEqual([255, 0, 0, 255]);
    // outside the mask, A stays red (top-left corner)
    expect(pixelAt(out, 5, 5)).toEqual([255, 0, 0, 255]);
  });

  it("leaves content outside the mask untouched", () => {
    const a = solidImage(100, 100, [255, 0, 0, 255]);
    const b = solidImage(100, 100, [0, 0, 255, 255]);
    const mask = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const out = renderSwap(
      { imgA: a as never, imgB: b as never, orientation: "tb", tile: { w: 100, h: 100 }, gap: 0, mask, fit: "cover" },
      nodeCreateCanvas,
    );
    // bottom tile (B) corner stays blue
    expect(pixelAt(out, 5, 105)).toEqual([0, 0, 255, 255]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas/__tests__/renderSwap.test.ts`
Expected: FAIL — "Cannot find module '../renderSwap'".

- [ ] **Step 3: Implement `renderSwap.ts`**

```ts
// src/lib/canvas/renderSwap.ts
import type { Rect } from "../geometry";
import { toPixels } from "../geometry";
import { computeFit, type FitMode } from "./fit";

export type CanvasLike = {
  width: number;
  height: number;
  getContext(id: "2d"): CanvasRenderingContext2D;
};

/** Anything drawImage accepts (ImageBitmap, HTMLCanvasElement, etc.). */
export type CanvasImageSourceLike = unknown;

export type SwapInput = {
  imgA: CanvasImageSourceLike;
  imgB: CanvasImageSourceLike;
  orientation: "tb" | "lr";
  tile: { w: number; h: number };
  gap: number;
  mask: Rect; // normalized 0..1, shared by both tiles
  fit: FitMode;
};

type CreateCanvas = (w: number, h: number) => CanvasLike;

const defaultCreateCanvas: CreateCanvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c as unknown as CanvasLike;
};

function sourceSize(img: CanvasImageSourceLike): { w: number; h: number } {
  const any = img as { width?: number; height?: number };
  return { w: any.width ?? 0, h: any.height ?? 0 };
}

function drawToTile(img: CanvasImageSourceLike, tile: { w: number; h: number }, fit: FitMode, createCanvas: CreateCanvas): CanvasLike {
  const { w: iw, h: ih } = sourceSize(img);
  const f = computeFit(iw, ih, tile.w, tile.h, fit);
  const c = createCanvas(tile.w, tile.h);
  const ctx = c.getContext("2d");
  ctx.drawImage(img as Parameters<typeof ctx.drawImage>[0], f.sx, f.sy, f.sw, f.sh, f.dx, f.dy, f.dw, f.dh);
  return c;
}

export function renderSwap(input: SwapInput, createCanvas: CreateCanvas = defaultCreateCanvas): CanvasLike {
  const { imgA, imgB, orientation, tile, gap, mask, fit } = input;

  const tileA = drawToTile(imgA, tile, fit, createCanvas);
  const tileB = drawToTile(imgB, tile, fit, createCanvas);

  // swap the shared mask region (capture both before mutating)
  const m = toPixels(mask, tile.w, tile.h);
  const ctxA = tileA.getContext("2d");
  const ctxB = tileB.getContext("2d");
  const regionA = ctxA.getImageData(m.x, m.y, m.w, m.h);
  const regionB = ctxB.getImageData(m.x, m.y, m.w, m.h);
  ctxA.putImageData(regionB, m.x, m.y);
  ctxB.putImageData(regionA, m.x, m.y);

  // compose
  const outW = orientation === "tb" ? tile.w : tile.w * 2 + gap;
  const outH = orientation === "tb" ? tile.h * 2 + gap : tile.h;
  const out = createCanvas(outW, outH);
  const octx = out.getContext("2d");
  const offsetY = orientation === "tb" ? tile.h + gap : 0;
  const offsetX = orientation === "lr" ? tile.w + gap : 0;
  octx.drawImage(tileA as Parameters<typeof octx.drawImage>[0], 0, 0);
  octx.drawImage(tileB as Parameters<typeof octx.drawImage>[0], offsetX, offsetY);

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas/__tests__/renderSwap.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/renderSwap.ts src/lib/canvas/__tests__/renderSwap.test.ts
git commit -m "feat(p1): add renderSwap (pure, injectable canvas) with tests"
```

---

### Task 5: Full suite + typecheck

**Files:** none new.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all P0 + P1 tests PASS (geometry 5, fit 3, renderSwap 4, plus P0 registry/App).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

> Note: `CanvasLike.getContext` returns the DOM `CanvasRenderingContext2D` type; `@napi-rs/canvas`'s context is structurally compatible at runtime. If `tsc` flags `getImageData`/`putImageData`/`drawImage` mismatches under strict DOM types, cast via `as unknown as CanvasRenderingContext2D` inside the test factory only — keep `renderSwap.ts` clean.

- [ ] **Step 3: Commit (if any casts were added)**

```bash
git add -A
git commit -m "test(p1): align canvas factory types with DOM CanvasRenderingContext2D"
```

(Skip this commit if Step 2 passed with no changes.)

---

## P1 Acceptance

- `computeFit` (cover/contain/stretch), `clampRect`/`toPixels`, and `renderSwap` are pure and unit-tested in Node via `@napi-rs/canvas`.
- `renderSwap` correctly swaps the shared mask region between two tiles (pixel assertions) and composes tb/lr layouts.
- No React/DOM code in this layer (only the injectable `defaultCreateCanvas`, which is not exercised by tests).
- `npm test` green; `tsc --noEmit` clean.

## Handoff to P2

P2 builds the swap-collage generator UI: `SwapCollageProvider` (state), `SwapCollagePreview` (live canvas + `RectOverlay`), `SwapCollageControls` (dropzones, layout, mask, fit, export), shared `ImageDropzone` + `RectOverlay`, and an `export.ts` (toBlob + download). It calls `renderSwap` with the DOM factory.

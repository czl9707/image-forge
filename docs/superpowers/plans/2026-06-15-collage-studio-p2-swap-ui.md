# Collage Studio — P2 Swap Generator UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working "swap collage" generator wired into the shell: upload two images, pick layout (top/bottom or left/right), drag/resize a shared rectangle mask, see the swapped result live, and export png/jpg.

**Architecture:** The generator exports `SwapCollageProvider` (shared state via context), `SwapCollagePreview` (two `<canvas>` tiles rendered from `renderSwappedTiles`, with an interactive `RectOverlay` on tile A and a static mirror on tile B), and `SwapCollageControls` (dropzones, layout/fit/mask controls, export). Pointer-to-mask math lives in a pure `rectMath` module. Export reuses `renderSwap` at full export size.

**Tech Stack:** React + TypeScript, shadcn/ui (`button`, `slider`, `tabs`, `select`, `separator`, `label`, `sonner`), Canvas 2D, vitest + `@napi-rs/canvas`.

**Reference spec:** `docs/superpowers/specs/2026-06-15-collage-studio-design.md` (sections 4, 6, 7)

**Alias:** assumes `@` → `src` path alias is configured (shadcn sets this). Verify with `npx tsc --noEmit`.

**shadcn components needed this phase:**
```bash
npx shadcn@latest add button slider tabs select separator label sonner
```

---

## File Structure (this phase)

- `src/lib/canvas/renderSwap.ts` — **modify**: extract `renderSwappedTiles` (+ shared `drawToTile`); `renderSwap` delegates to it.
- `src/lib/canvas/__tests__/renderSwapTiles.test.ts` — new tests for the tiles variant.
- `src/lib/canvas/export.ts` — `downloadCanvas`.
- `src/components/shared/rectMath.ts` — `moveRect`, `resizeRect` (pure).
- `src/components/shared/__tests__/rectMath.test.ts`
- `src/components/shared/RectOverlay.tsx` — interactive rectangle.
- `src/components/shared/ImageDropzone.tsx` — upload slot.
- `src/lib/hooks/useImageBitmap.ts` — `File → ImageBitmap`.
- `src/generators/swap-collage/types.ts` — `SwapState`.
- `src/generators/swap-collage/SwapCollageProvider.tsx` — context + state.
- `src/generators/swap-collage/SwapCollagePreview.tsx` — live preview.
- `src/generators/swap-collage/SwapCollageControls.tsx` — controls + export.
- `src/generators/swap-collage/index.ts` — registry entry.
- `src/app/registry.ts` — **modify**: register swap-collage (replace placeholder).

---

### Task 1: Extract `renderSwappedTiles` (refactor + TDD)

**Files:**
- Test: `src/lib/canvas/__tests__/renderSwapTiles.test.ts`
- Modify: `src/lib/canvas/renderSwap.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/canvas/__tests__/renderSwapTiles.test.ts
import { describe, expect, it } from "vitest";
import { renderSwappedTiles } from "../renderSwap";
import { nodeCreateCanvas, pixelAt, solidImage } from "./canvasFactory";

describe("renderSwappedTiles", () => {
  it("returns two equal-sized tiles", () => {
    const a = solidImage(80, 80, [255, 0, 0, 255]);
    const b = solidImage(80, 80, [0, 255, 0, 255]);
    const { tileA, tileB } = renderSwappedTiles(
      { imgA: a as never, imgB: b as never, orientation: "tb", tile: { w: 80, h: 80 }, gap: 0, mask: { x: 0, y: 0, w: 1, h: 1 }, fit: "cover" },
      nodeCreateCanvas,
    );
    expect(tileA.width).toBe(80);
    expect(tileB.height).toBe(80);
  });

  it("swaps the mask region between the two tiles", () => {
    const a = solidImage(80, 80, [255, 0, 0, 255]);
    const b = solidImage(80, 80, [0, 255, 0, 255]);
    const mask = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    const { tileA, tileB } = renderSwappedTiles(
      { imgA: a as never, imgB: b as never, orientation: "tb", tile: { w: 80, h: 80 }, gap: 0, mask, fit: "cover" },
      nodeCreateCanvas,
    );
    expect(pixelAt(tileA, 40, 40)).toEqual([0, 255, 0, 255]); // A center = B color
    expect(pixelAt(tileB, 40, 40)).toEqual([255, 0, 0, 255]); // B center = A color
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas/__tests__/renderSwapTiles.test.ts`
Expected: FAIL — `renderSwappedTiles` is not exported.

- [ ] **Step 3: Refactor `renderSwap.ts`** — add `renderSwappedTiles` + shared `drawToTile`, make `renderSwap` delegate. Replace the bodies of `drawToTile`/`renderSwap` and add the new export. Final file:

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

export type CanvasImageSourceLike = unknown;

export type SwapInput = {
  imgA: CanvasImageSourceLike;
  imgB: CanvasImageSourceLike;
  orientation: "tb" | "lr";
  tile: { w: number; h: number };
  gap: number;
  mask: Rect;
  fit: FitMode;
};

type CreateCanvas = (w: number, h: number) => CanvasLike;

export const defaultCreateCanvas: CreateCanvas = (w, h) => {
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

export function renderSwappedTiles(input: SwapInput, createCanvas: CreateCanvas = defaultCreateCanvas): { tileA: CanvasLike; tileB: CanvasLike } {
  const { imgA, imgB, tile, fit, mask } = input;
  const tileA = drawToTile(imgA, tile, fit, createCanvas);
  const tileB = drawToTile(imgB, tile, fit, createCanvas);

  const m = toPixels(mask, tile.w, tile.h);
  const ctxA = tileA.getContext("2d");
  const ctxB = tileB.getContext("2d");
  const regionA = ctxA.getImageData(m.x, m.y, m.w, m.h);
  const regionB = ctxB.getImageData(m.x, m.y, m.w, m.h);
  ctxA.putImageData(regionB, m.x, m.y);
  ctxB.putImageData(regionA, m.x, m.y);

  return { tileA, tileB };
}

export function renderSwap(input: SwapInput, createCanvas: CreateCanvas = defaultCreateCanvas): CanvasLike {
  const { orientation, tile, gap } = input;
  const { tileA, tileB } = renderSwappedTiles(input, createCanvas);

  const outW = orientation === "tb" ? tile.w : tile.w * 2 + gap;
  const outH = orientation === "tb" ? tile.h * 2 + gap : tile.h;
  const out = createCanvas(outW, outH);
  const octx = out.getContext("2d");
  const offsetX = orientation === "lr" ? tile.w + gap : 0;
  const offsetY = orientation === "tb" ? tile.h + gap : 0;
  octx.drawImage(tileA as Parameters<typeof octx.drawImage>[0], 0, 0);
  octx.drawImage(tileB as Parameters<typeof octx.drawImage>[0], offsetX, offsetY);
  return out;
}
```

- [ ] **Step 4: Run both renderSwap test files (new + P1 regression)**

Run: `npx vitest run src/lib/canvas/__tests__/renderSwap.test.ts src/lib/canvas/__tests__/renderSwapTiles.test.ts`
Expected: PASS (P1's 4 + new 2).

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/renderSwap.ts src/lib/canvas/__tests__/renderSwapTiles.test.ts
git commit -m "feat(p2): extract renderSwappedTiles; renderSwap delegates"
```

---

### Task 2: `export.ts`

**Files:**
- Create: `src/lib/canvas/export.ts`

- [ ] **Step 1: Implement download**

```ts
// src/lib/canvas/export.ts
export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string,
  type: "image/png" | "image/jpeg" = "image/png",
  quality?: number,
): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/canvas/export.ts
git commit -m "feat(p2): add canvas export + download helper"
```

---

### Task 3: `rectMath` pure helpers (TDD)

**Files:**
- Test: `src/components/shared/__tests__/rectMath.test.ts`
- Create: `src/components/shared/rectMath.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/shared/__tests__/rectMath.test.ts
import { describe, expect, it } from "vitest";
import { moveRect, resizeRect } from "../rectMath";

describe("moveRect", () => {
  it("translates by normalized delta", () => {
    expect(moveRect({ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }, 0.1, 0.1)).toEqual({ x: 0.3, y: 0.3, w: 0.2, h: 0.2 });
  });
  it("clamps overflow on move", () => {
    const r = moveRect({ x: 0.8, y: 0.8, w: 0.2, h: 0.2 }, 0.5, 0.5);
    expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe("resizeRect", () => {
  it("SE handle grows width and height", () => {
    const r = resizeRect({ x: 0.2, y: 0.2, w: 0.2, h: 0.2 }, "se", 0.1, 0.1);
    expect(r.w).toBeCloseTo(0.3, 6);
    expect(r.h).toBeCloseTo(0.3, 6);
    expect(r.x).toBeCloseTo(0.2, 6);
  });
  it("NW handle moves origin and shrinks", () => {
    const r = resizeRect({ x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, "nw", 0.1, 0.1);
    expect(r.x).toBeCloseTo(0.3, 6);
    expect(r.y).toBeCloseTo(0.3, 6);
    expect(r.w).toBeCloseTo(0.3, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/shared/__tests__/rectMath.test.ts`
Expected: FAIL — "Cannot find module '../rectMath'".

- [ ] **Step 3: Implement `rectMath.ts`**

```ts
// src/components/shared/rectMath.ts
import { clampRect, type Rect } from "@/lib/geometry";

export type Handle = "nw" | "ne" | "sw" | "se";

export function moveRect(rect: Rect, dxN: number, dyN: number): Rect {
  return clampRect({ x: rect.x + dxN, y: rect.y + dyN, w: rect.w, h: rect.h });
}

export function resizeRect(rect: Rect, handle: Handle, dxN: number, dyN: number): Rect {
  let { x, y, w, h } = rect;
  if (handle === "ne") { y += dyN; h -= dyN; w += dxN; }
  else if (handle === "se") { w += dxN; h += dyN; }
  else if (handle === "sw") { x += dxN; w -= dxN; h += dyN; }
  else { x += dxN; y += dyN; w -= dxN; h -= dyN; } // nw
  return clampRect({ x, y, w, h });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/shared/__tests__/rectMath.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/rectMath.ts src/components/shared/__tests__/rectMath.test.ts
git commit -m "feat(p2): add rectMath (moveRect, resizeRect) with tests"
```

---

### Task 4: `useImageBitmap` hook

**Files:**
- Create: `src/lib/hooks/useImageBitmap.ts`

- [ ] **Step 1: Implement the hook**

```ts
// src/lib/hooks/useImageBitmap.ts
import { useCallback, useState } from "react";

export type LoadedImage = { bitmap: ImageBitmap } | { error: string };

export function useImageBitmap() {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setBitmap(null);
      setError("Not an image file");
      return;
    }
    try {
      const bmp = await createImageBitmap(file);
      setBitmap(bmp);
    } catch {
      setBitmap(null);
      setError("Could not read image");
    }
  }, []);

  const clear = useCallback(() => {
    setBitmap(null);
    setError(null);
  }, []);

  return { bitmap, error, load, clear };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useImageBitmap.ts
git commit -m "feat(p2): add useImageBitmap hook"
```

---

### Task 5: `ImageDropzone` component

**Files:**
- Create: `src/components/shared/ImageDropzone.tsx`

- [ ] **Step 1: Implement the dropzone**

```tsx
// src/components/shared/ImageDropzone.tsx
import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui/..."; // shadcn cn util (see note)

type Props = {
  label: string;
  preview?: ReactNode;
  onFile: (file: File | undefined) => void;
};

export function ImageDropzone({ label, preview, onFile }: Props) {
  const [over, setOver] = useState(false);

  function handle(files: FileList | null) {
    onFile(files?.[0]);
  }

  return (
    <label
      className={cn(
        "flex h-24 w-full cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed text-sm text-muted-foreground",
        over && "border-primary bg-accent/50",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      {preview ?? <span>{label}</span>}
    </label>
  );
}
```

> Note: `cn` is the shadcn util at `src/lib/utils.ts`. Replace the placeholder import line with:
> `import { cn } from "@/lib/utils";`

- [ ] **Step 2: Fix the `cn` import (remove placeholder)**

Edit the top of the file: replace the `cn` import line with `import { cn } from "@/lib/utils";`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/ImageDropzone.tsx
git commit -m "feat(p2): add ImageDropzone component"
```

---

### Task 6: `RectOverlay` component

**Files:**
- Create: `src/components/shared/RectOverlay.tsx`

- [ ] **Step 1: Implement the interactive rectangle**

```tsx
// src/components/shared/RectOverlay.tsx
import { useRef, type CSSProperties } from "react";
import type { Rect } from "@/lib/geometry";
import { moveRect, resizeRect, type Handle } from "./rectMath";

type DragState = { mode: "move" | Handle; startX: number; startY: number; start: Rect };

const HANDLES: Handle[] = ["nw", "ne", "sw", "se"];
const HANDLE_POS: Record<Handle, CSSProperties> = {
  nw: { left: 0, top: 0, transform: "translate(-50%, -50%)" },
  ne: { right: 0, top: 0, transform: "translate(50%, -50%)" },
  sw: { left: 0, bottom: 0, transform: "translate(-50%, 50%)" },
  se: { right: 0, bottom: 0, transform: "translate(50%, 50%)" },
};

type Props = {
  rect: Rect;
  onChange: (rect: Rect) => void;
  width: number;
  height: number;
};

export function RectOverlay({ rect, onChange, width, height }: Props) {
  const drag = useRef<DragState | null>(null);

  function onDown(mode: DragState["mode"]) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { mode, startX: e.clientX, startY: e.clientY, start: rect };
    };
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || width === 0 || height === 0) return;
    const dxN = (e.clientX - d.startX) / width;
    const dyN = (e.clientY - d.startY) / height;
    const next = d.mode === "move" ? moveRect(d.start, dxN, dyN) : resizeRect(d.start, d.mode, dxN, dyN);
    onChange(next);
  }

  function onUp() {
    drag.current = null;
  }

  const boxStyle: CSSProperties = {
    position: "absolute",
    left: rect.x * width,
    top: rect.y * height,
    width: rect.w * width,
    height: rect.h * height,
    border: "1.5px solid hsl(var(--primary))",
    boxSizing: "border-box",
    cursor: "move",
  };

  return (
    <div className="absolute inset-0" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <div style={boxStyle} onPointerDown={onDown("move")}>
        {HANDLES.map((h) => (
          <span
            key={h}
            onPointerDown={onDown(h)}
            style={{
              position: "absolute",
              width: 12,
              height: 12,
              background: "white",
              border: "1px solid black",
              borderRadius: 2,
              ...HANDLE_POS[h],
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function MirrorRect({ rect, width, height }: { rect: Rect; width: number; height: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x * width,
        top: rect.y * height,
        width: rect.w * width,
        height: rect.h * height,
        border: "1.5px dashed hsl(var(--primary))",
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/RectOverlay.tsx
git commit -m "feat(p2): add RectOverlay + MirrorRect"
```

---

### Task 7: Swap state types + Provider

**Files:**
- Create: `src/generators/swap-collage/types.ts`
- Create: `src/generators/swap-collage/SwapCollageProvider.tsx`

- [ ] **Step 1: Define state types**

```ts
// src/generators/swap-collage/types.ts
import type { Rect } from "@/lib/geometry";
import type { FitMode } from "@/lib/canvas/fit";

export type Orientation = "tb" | "lr";
export type ExportFormat = "image/png" | "image/jpeg";

export type SwapState = {
  imgA: ImageBitmap | null;
  imgB: ImageBitmap | null;
  orientation: Orientation;
  mask: Rect;
  fit: FitMode;
  exportSize: number;
};
```

- [ ] **Step 2: Implement the Provider + hook**

```tsx
// src/generators/swap-collage/SwapCollageProvider.tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { SwapState } from "./types";

type SwapContextValue = {
  state: SwapState;
  set: <K extends keyof SwapState>(key: K, value: SwapState[K]) => void;
};

const SwapContext = createContext<SwapContextValue | null>(null);

const INITIAL: SwapState = {
  imgA: null,
  imgB: null,
  orientation: "tb",
  mask: { x: 0.3, y: 0.3, w: 0.4, h: 0.4 },
  fit: "cover",
  exportSize: 1080,
};

export function SwapCollageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SwapState>(INITIAL);
  const set = useCallback(<K extends keyof SwapState>(key: K, value: SwapState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);
  const value = useMemo(() => ({ state, set }), [state, set]);
  return <SwapContext.Provider value={value}>{children}</SwapContext.Provider>;
}

export function useSwap() {
  const ctx = useContext(SwapContext);
  if (!ctx) throw new Error("useSwap must be used inside SwapCollageProvider");
  return ctx;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/generators/swap-collage/types.ts src/generators/swap-collage/SwapCollageProvider.tsx
git commit -m "feat(p2): add swap state types + provider"
```

---

### Task 8: `SwapCollagePreview`

**Files:**
- Create: `src/generators/swap-collage/SwapCollagePreview.tsx`

- [ ] **Step 1: Implement the live preview**

```tsx
// src/generators/swap-collage/SwapCollagePreview.tsx
import { useEffect, useRef, useState } from "react";
import { renderSwappedTiles, type CanvasLike } from "@/lib/canvas/renderSwap";
import { RectOverlay, MirrorRect } from "@/components/shared/RectOverlay";
import { useSwap } from "./SwapCollageProvider";

const GAP = 8;

function drawToCanvas(canvas: HTMLCanvasElement | null, source: CanvasLike, size: number) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(source as Parameters<typeof ctx.drawImage>[0], 0, 0);
}

export function SwapCollagePreview() {
  const { state, set } = useSwap();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  const canvasA = useRef<HTMLCanvasElement>(null);
  const canvasB = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const tb = state.orientation === "tb";
      const s = tb
        ? Math.min(r.width, (r.height - GAP) / 2)
        : Math.min((r.width - GAP) / 2, r.height);
      setSize(Math.max(0, Math.floor(s)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [state.orientation]);

  useEffect(() => {
    if (!size || !state.imgA || !state.imgB) return;
    const raf = requestAnimationFrame(() => {
      const { tileA, tileB } = renderSwappedTiles({
        imgA: state.imgA,
        imgB: state.imgB,
        orientation: state.orientation,
        tile: { w: size, h: size },
        gap: 0,
        mask: state.mask,
        fit: state.fit,
      });
      drawToCanvas(canvasA.current, tileA, size);
      drawToCanvas(canvasB.current, tileB, size);
    });
    return () => cancelAnimationFrame(raf);
  }, [state, size]);

  const ready = Boolean(state.imgA && state.imgB);
  const flexDir = state.orientation === "tb" ? "flex-col" : "flex-row";

  return (
    <div ref={wrapRef} className="flex h-full w-full items-center justify-center p-6">
      {!ready && (
        <p className="text-sm text-muted-foreground">Upload two images to begin.</p>
      )}
      {ready && (
        <div className={`flex ${flexDir} items-center justify-center`} style={{ gap: GAP, visibility: size ? "visible" : "hidden" }}>
          <div className="relative" style={{ width: size, height: size }}>
            <canvas ref={canvasA} width={size} height={size} className="block" />
            <RectOverlay rect={state.mask} onChange={(m) => set("mask", m)} width={size} height={size} />
          </div>
          <div className="relative" style={{ width: size, height: size }}>
            <canvas ref={canvasB} width={size} height={size} className="block" />
            <MirrorRect rect={state.mask} width={size} height={size} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/generators/swap-collage/SwapCollagePreview.tsx
git commit -m "feat(p2): add live SwapCollagePreview with interactive mask"
```

---

### Task 9: `SwapCollageControls`

**Files:**
- Create: `src/generators/swap-collage/SwapCollageControls.tsx`

- [ ] **Step 1: Implement controls + export**

```tsx
// src/generators/swap-collage/SwapCollageControls.tsx
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageDropzone } from "@/components/shared/ImageDropzone";
import { useImageBitmap } from "@/lib/hooks/useImageBitmap";
import { renderSwap } from "@/lib/canvas/renderSwap";
import { downloadCanvas } from "@/lib/canvas/export";
import { useSwap } from "./SwapCollageProvider";
import type { ExportFormat, Orientation } from "./types";

function Slot({ slotKey, label }: { slotKey: "imgA" | "imgB"; label: string }) {
  const { state, set } = useSwap();
  const { load, error } = useImageBitmap();
  const bmp = state[slotKey];
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <ImageDropzone
        label="Click or drop image"
        preview={bmp ? <img src={(bmp as unknown as { toDataURL?: () => string }).toDataURL?.() ?? ""} alt="" className="h-full w-full object-cover" /> : undefined}
        onFile={(file) => {
          void load(file).then(() => {});
          // hook sets its own bitmap; sync into shared state after load:
          setTimeout(() => {
            // re-read via createImageBitmap to populate shared state
            if (file) {
              createImageBitmap(file)
                .then((b) => set(slotKey, b))
                .catch(() => toast.error("Could not load image"));
            }
          }, 0);
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function SwapCollageControls() {
  const { state, set } = useSwap();
  const ready = Boolean(state.imgA && state.imgB);

  async function onExport(format: ExportFormat) {
    if (!state.imgA || !state.imgB) return;
    const out = renderSwap({
      imgA: state.imgA,
      imgB: state.imgB,
      orientation: state.orientation,
      tile: { w: state.exportSize, h: state.exportSize },
      gap: 0,
      mask: state.mask,
      fit: state.fit,
    });
    await downloadCanvas(
      out as unknown as HTMLCanvasElement,
      `collage.${format === "image/png" ? "png" : "jpg"}`,
      format,
      format === "image/jpeg" ? 0.92 : undefined,
    );
    toast.success("Exported");
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <Slot slotKey="imgA" label="Image A" />
      <Slot slotKey="imgB" label="Image B" />
      <Separator />

      <div className="flex flex-col gap-1.5">
        <Label>Layout</Label>
        <Tabs value={state.orientation} onValueChange={(v) => set("orientation", v as Orientation)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="tb">Top / Bottom</TabsTrigger>
            <TabsTrigger value="lr">Left / Right</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Fit</Label>
        <Select value={state.fit} onValueChange={(v) => set("fit", v as typeof state.fit)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Cover</SelectItem>
            <SelectItem value="contain">Contain</SelectItem>
            <SelectItem value="stretch">Stretch</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />
      <Label>Mask (drag on image A, or fine-tune)</Label>
      {(["x", "y", "w", "h"] as const).map((k) => (
        <div key={k} className="flex flex-col gap-1">
          <Label className="text-xs uppercase">{k}</Label>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[state.mask[k]]}
            onValueChange={([v]) => set("mask", { ...state.mask, [k]: v })}
          />
        </div>
      ))}

      <Separator />
      <Button disabled={!ready} onClick={() => void onExport("image/png")}>Export PNG</Button>
      <Button variant="secondary" disabled={!ready} onClick={() => void onExport("image/jpeg")}>Export JPG</Button>
    </div>
  );
}
```

> Note on the `Slot` preview: `ImageBitmap` has no `toDataURL`. The preview `img` won't render a bitmap directly. Replace the `Slot` preview with an `<canvas>`-based preview, or drop the preview thumbnail. Simplest fix in Step 2.

- [ ] **Step 2: Fix the `Slot` thumbnail — render the bitmap to a tiny canvas instead of `toDataURL`**

Replace the `Slot` component with this corrected version (uses a small canvas ref to draw the bitmap):

```tsx
function Slot({ slotKey, label }: { slotKey: "imgA" | "imgB"; label: string }) {
  const { state, set } = useSwap();
  const { load, error } = useImageBitmap();
  const bmp = state[slotKey];
  const thumbRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = thumbRef.current;
    if (!c || !bmp) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp as never, 0, 0, c.width, c.height);
  }, [bmp]);

  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <ImageDropzone
        label="Click or drop image"
        preview={bmp ? <canvas ref={thumbRef} width={96} height={96} className="h-24 w-full object-cover" /> : undefined}
        onFile={(file) => {
          void load(file);
          if (file) {
            createImageBitmap(file)
              .then((b) => set(slotKey, b))
              .catch(() => toast.error("Could not load image"));
          }
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

Add the missing imports to the top of the file: `import { useEffect, useRef } from "react";`

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/generators/swap-collage/SwapCollageControls.tsx
git commit -m "feat(p2): add SwapCollageControls with mask sliders + export"
```

---

### Task 10: Register the swap-collage generator

**Files:**
- Create: `src/generators/swap-collage/index.ts`
- Modify: `src/app/registry.ts`

- [ ] **Step 1: Create the registry entry**

```ts
// src/generators/swap-collage/index.ts
import type { Generator } from "@/app/registry";
import { SwapCollageProvider } from "./SwapCollageProvider";
import { SwapCollagePreview } from "./SwapCollagePreview";
import { SwapCollageControls } from "./SwapCollageControls";

export const swapCollageGenerator: Generator = {
  id: "swap-collage",
  name: "Swap Collage",
  Preview: SwapCollagePreview,
  Controls: SwapCollageControls,
  Provider: SwapCollageProvider,
};
```

- [ ] **Step 2: Update `src/app/registry.ts` to register it (replace placeholder)**

```ts
// src/app/registry.ts
import type { FC, ReactNode } from "react";
import { swapCollageGenerator } from "@/generators/swap-collage";

export type Generator = {
  id: string;
  name: string;
  Preview: FC;
  Controls: FC;
  Provider?: FC<{ children: ReactNode }>;
};

export const registry: Generator[] = [swapCollageGenerator];
```

- [ ] **Step 3: Run P0 registry + App tests (regression)**

Run: `npx vitest run src/app/__tests__/`
Expected: PASS (the placeholder text assertions in `App.test.tsx` referenced "Preview area"/"Operations" and "Placeholder" — these will now FAIL because the registry changed).

- [ ] **Step 4: Update `src/app/__tests__/App.test.tsx` to match the new generator**

Replace the assertions that depended on the placeholder:

```tsx
// src/app/__tests__/App.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../App";
import { registry } from "../registry";

describe("App shell", () => {
  it("renders nav from registry", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: registry[0].name })).toBeInTheDocument();
  });

  it("renders the active generator's controls (export buttons)", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /export png/i })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/app/__tests__/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/index.ts src/app/registry.ts src/app/__tests__/App.test.tsx
git commit -m "feat(p2): register swap-collage generator in hub"
```

---

### Task 11: Full suite + build + manual smoke

**Files:** none.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests PASS (geometry, fit, renderSwap, renderSwapTiles, rectMath, registry, App).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors; build succeeds.

- [ ] **Step 3: Manual smoke**

Run: `npm run dev` → open http://localhost:5173.
- Left nav shows "Swap Collage"; center shows "Upload two images to begin."; right sidebar shows two dropzones + controls.
- Upload two images → swapped collage appears live; dragging the rectangle on tile A moves it and the dashed mirror on tile B follows; corner handles resize.
- Toggle Top/Bottom ↔ Left/Right; toggle Fit; adjust mask sliders.
- Click "Export PNG" → downloads a `collage.png` containing both tiles with the mask swapped at full export size.

- [ ] **Step 4: Commit (if any smoke-fixes)**

```bash
git add -A
git commit -m "chore(p2): smoke fixes"
```
(Skip if no changes.)

---

## P2 Acceptance

- Two images can be uploaded; layout toggles tb/lr; mask is a draggable/resizable rectangle shown on both tiles; live preview reflects the swap; export downloads png/jpg at full export size.
- The swap reproduces the reference collage mechanic (tile A's mask region shows tile B's content, and vice versa).
- Pure pieces (`renderSwappedTiles`, `rectMath`) are unit-tested; `npm test` green; `npm run build` succeeds.
- Placeholder generator replaced; nav reflects the real generator.

## Post-v1 (later sessions)

Per-image filters (HSL/curves) · multiple masks · arbitrary shapes · border/styling · preset save · additional generators — each gets its own spec/plan session.

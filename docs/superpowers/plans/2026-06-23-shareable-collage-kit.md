# Shareable Collage Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote/extract reusable canvas helpers and UI pieces out of `swap-collage` into shared `src/lib/canvas/` and `src/components/canvas/`, so a second collage tool can compose them — pure extraction, swap-collage behavior unchanged.

**Architecture:** Two existing layers are extended (no new namespace). Generic canvas math (`containFit`, `canvasDims`, `placeholderTextStrip`) moves to `lib/canvas/`; the `Orientation`/`AspectId` types move with `canvasDims` and `swapReducer` re-exports them (zero churn for existing importers). Presentational + behavior pieces (drop-zone hook, empty-slot placeholder, drop highlight, per-image controls, export controls, field label) move to a new `components/canvas/` kit, parallel to `components/filters/`.

**Tech Stack:** React, TypeScript, react-konva (Konva canvas), Tailwind/shadcn tokens, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-23-shareable-collage-kit.md`

**On testing:** This is a behavior-preserving move — no new pure logic is introduced. Verification per task is `npm run build` (type-check) + `npm test` (existing suites, with import paths updated) + a manual smoke check for the two tasks that touch drag/drop. Do not fabricate new unit tests for DOM/Konva code (precedent: the dragover-highlight plan). The existing `dimensions.test.ts` and `fit.test.ts` suites ARE edited — they follow the functions they test to their new homes.

**Branch:** `feat/shareable-collage-kit` (already created and holds the spec commit).

---

### Task 1: Promote canvas helpers to `lib/canvas`

**Files:**
- Create: `src/lib/canvas/dimensions.ts`
- Modify: `src/lib/canvas/fit.ts`
- Modify: `src/generators/swap-collage/dimensions.ts`
- Modify: `src/generators/swap-collage/swapReducer.ts`
- Create: `src/lib/canvas/__tests__/dimensions.test.ts`
- Modify: `src/lib/canvas/__tests__/fit.test.ts`
- Modify: `src/generators/swap-collage/__tests__/dimensions.test.ts`
- Modify: `src/generators/swap-collage/SwapCollagePreview.tsx`
- Modify: `src/generators/swap-collage/SwapCollageControls.tsx`

This moves `canvasDims` + `placeholderTextStrip` to a new `lib/canvas/dimensions.ts`, moves `containFit` into the existing `lib/canvas/fit.ts`, and moves the `Orientation`/`AspectId` type *definitions* with `canvasDims` (swapReducer re-exports them so no other importer changes). `tileLayout` and `pointToSlot` stay put.

- [ ] **Step 1: Create `src/lib/canvas/dimensions.ts`**

```ts
// src/lib/canvas/dimensions.ts

/** Landscape/portrait split orientation for a 2-axis collage canvas. */
export type Orientation = "lr" | "tb";

/** Aspect-ratio shapes a collage canvas can take (expressed landscape). */
export type AspectId = "16:9" | "4:3" | "1:1";

export interface Dims {
  cw: number;
  ch: number;
}

/** Logical canvas size from aspect (a shape) + orientation + long-edge export
 *  size. Aspect is a ratio shape expressed landscape; Top/Bottom orientation
 *  rotates the canvas to its portrait form (w/h swapped). Square is symmetric. */
export function canvasDims(
  aspect: AspectId,
  orientation: Orientation,
  longEdge: number,
): Dims {
  const base =
    aspect === "1:1"
      ? { cw: longEdge, ch: longEdge }
      : aspect === "4:3"
        ? { cw: longEdge, ch: Math.round((longEdge * 3) / 4) }
        : { cw: longEdge, ch: Math.round((longEdge * 9) / 16) }; // "16:9"
  return orientation === "tb"
    ? { cw: base.ch, ch: base.cw }
    : { cw: base.cw, ch: base.ch };
}

export interface PlaceholderStrip {
  y: number;
  height: number;
}

/** Vertical strip at the top of a tile reserved for the "Drop or click to
 *  upload" hint, so the centered swap box never covers it. The hint text is
 *  vertically centered within this strip. Pure: takes a tile height in any
 *  consistent unit (logical or display px). */
export function placeholderTextStrip(tileH: number): PlaceholderStrip {
  return { y: 0, height: tileH * 0.15 };
}
```

- [ ] **Step 2: Add `containFit` to `src/lib/canvas/fit.ts`**

Append to the end of `src/lib/canvas/fit.ts` (the existing `coverFit` and `clampCoverPos` stay):

```ts
export interface Display {
  dispW: number;
  dispH: number;
  scale: number;
}

/** Largest uniform scale fitting the logical canvas into the available box. */
export function containFit(
  cw: number,
  ch: number,
  availW: number,
  availH: number,
): Display {
  const scale = Math.min(availW / cw, availH / ch);
  return { dispW: cw * scale, dispH: ch * scale, scale };
}
```

- [ ] **Step 3: Slim down `src/generators/swap-collage/dimensions.ts`**

Replace the **entire file** with the tool-specific remnants (`tileLayout`, `pointToSlot`) plus re-exports of the moved helpers so any internal swap-collage importer that still reaches for them resolves. The moved functions now live in `lib/canvas`:

```ts
// src/generators/swap-collage/dimensions.ts
import type { Slot } from "./swapReducer";
import type { Orientation } from "@/lib/canvas/dimensions";

// Generic canvas math now lives in @/lib/canvas. Re-exported here so existing
// swap-collage import sites can keep importing from "./dimensions" if desired;
// new code should import from @/lib/canvas directly.
export {
  canvasDims,
  placeholderTextStrip,
  type AspectId,
  type Dims,
  type Orientation,
  type PlaceholderStrip,
} from "@/lib/canvas/dimensions";
export { containFit, type Display } from "@/lib/canvas/fit";

export interface TileLayout {
  tileW: number;
  tileH: number;
  A: { x: number; y: number };
  B: { x: number; y: number };
}

/** Equal-half tile positions in logical px. */
export function tileLayout(
  orientation: Orientation,
  { cw, ch }: Dims,
): TileLayout {
  if (orientation === "lr") {
    return {
      tileW: cw / 2,
      tileH: ch,
      A: { x: 0, y: 0 },
      B: { x: cw / 2, y: 0 },
    };
  }
  return {
    tileW: cw,
    tileH: ch / 2,
    A: { x: 0, y: 0 },
    B: { x: 0, y: ch / 2 },
  };
}

/** Which half of the canvas a point falls in — A is always the first (left or
 *  top) tile, mirroring the A/B assignment in `tileLayout`. Coordinates and
 *  dimensions may be in any consistent units (logical px, display px, …) since
 *  the split is on the midline. */
export function pointToSlot(
  orientation: Orientation,
  x: number,
  y: number,
  cw: number,
  ch: number,
): Slot {
  if (orientation === "lr") return x < cw / 2 ? "A" : "B";
  return y < ch / 2 ? "A" : "B";
}
```

`Dims` is now imported transitively via the re-export, so `tileLayout`'s `{ cw, ch }: Dims` param still resolves.

- [ ] **Step 4: Make `swapReducer.ts` re-export the moved types**

In `src/generators/swap-collage/swapReducer.ts`, replace these two lines (lines 5–6):

```ts
export type Orientation = "lr" | "tb";
export type AspectId = "16:9" | "4:3" | "1:1";
```

with a re-export from the new home (keeps every existing `import { Orientation, AspectId } from "./swapReducer"` working):

```ts
export type { AspectId, Orientation } from "@/lib/canvas/dimensions";
```

- [ ] **Step 5: Move the `canvasDims` + `placeholderTextStrip` tests to `lib/canvas`**

Create `src/lib/canvas/__tests__/dimensions.test.ts`:

```ts
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
```

- [ ] **Step 6: Add `containFit` tests to `lib/canvas/__tests__/fit.test.ts`**

In `src/lib/canvas/__tests__/fit.test.ts`, update the import (line 2) to include `containFit`:

```ts
import { clampCoverPos, containFit, coverFit } from "../fit";
```

Append a new `describe` block at the end of the file:

```ts
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
```

- [ ] **Step 7: Leave only `tileLayout` in the swap-collage dimensions test**

Replace the **entire** `src/generators/swap-collage/__tests__/dimensions.test.ts` with just the `tileLayout` suite (the moved functions are now tested in `lib/canvas`):

```ts
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
```

- [ ] **Step 8: Update `SwapCollagePreview.tsx` imports**

In `src/generators/swap-collage/SwapCollagePreview.tsx`, replace this import (lines 13–19):

```ts
import {
  canvasDims,
  containFit,
  placeholderTextStrip,
  pointToSlot,
  tileLayout,
} from "./dimensions";
```

with two imports — the moved helpers from `lib/canvas`, the tool-specific ones from `./dimensions`:

```ts
import { canvasDims, placeholderTextStrip } from "@/lib/canvas/dimensions";
import { containFit } from "@/lib/canvas/fit";
import { pointToSlot, tileLayout } from "./dimensions";
```

- [ ] **Step 9: Update `SwapCollageControls.tsx` import**

In `src/generators/swap-collage/SwapCollageControls.tsx`, replace (line 37):

```ts
import { canvasDims, tileLayout } from "./dimensions";
```

with:

```ts
import { canvasDims } from "@/lib/canvas/dimensions";
import { tileLayout } from "./dimensions";
```

- [ ] **Step 10: Type-check and run tests**

Run: `npm run build`
Expected: build succeeds (no TS errors).

Run: `npm test`
Expected: all tests pass. The moved-function tests now live in `lib/canvas/__tests__/`; `swap-collage/__tests__/dimensions.test.ts` has only `tileLayout`.

- [ ] **Step 11: Commit**

```bash
git add src/lib/canvas/dimensions.ts src/lib/canvas/fit.ts \
        src/lib/canvas/__tests__/dimensions.test.ts src/lib/canvas/__tests__/fit.test.ts \
        src/generators/swap-collage/dimensions.ts src/generators/swap-collage/swapReducer.ts \
        src/generators/swap-collage/__tests__/dimensions.test.ts \
        src/generators/swap-collage/SwapCollagePreview.tsx src/generators/swap-collage/SwapCollageControls.tsx
git commit -m "refactor(collage-kit): promote canvasDims/containFit/placeholderTextStrip to lib/canvas"
```

---

### Task 2: Extract `FieldLabel` to `components/canvas`

**Files:**
- Create: `src/components/canvas/FieldLabel.tsx`
- Modify: `src/generators/swap-collage/SwapCollageControls.tsx`

A tiny shared control label, currently defined inline in `SwapCollageControls` and reused by several of its controls.

- [ ] **Step 1: Create `src/components/canvas/FieldLabel.tsx`**

```tsx
// src/components/canvas/FieldLabel.tsx
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/** A control label: smaller and lighter than an accordion section title, to
 *  keep a clear visual hierarchy (section > control > value). */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Label className="text-xs font-normal text-muted-foreground">
      {children}
    </Label>
  );
}
```

- [ ] **Step 2: Replace the local `FieldLabel` in `SwapCollageControls.tsx`**

In `src/generators/swap-collage/SwapCollageControls.tsx`, add the import near the other component imports (after the existing `@/components/...` imports, e.g. after the `FilterStackControls` import):

```ts
import { FieldLabel } from "@/components/canvas/FieldLabel";
```

Then delete the local definition (the `function FieldLabel(...)` block, lines ~42–48):

```tsx
/** A control label: smaller and lighter than an accordion section title, to
 *  keep a clear visual hierarchy (section > control > value). */
function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Label className="text-xs font-normal text-muted-foreground">
      {children}
    </Label>
  );
}
```

If `ReactNode` is no longer referenced anywhere else in the file after this removal, also drop `type ReactNode` from the React import on line 2 (`import { useRef, useState, type ChangeEvent, type ReactNode } from "react";` → `import { useRef, useState, type ChangeEvent } from "react";`). Grep to confirm before removing: `grep -n "ReactNode" src/generators/swap-collage/SwapCollageControls.tsx`.

- [ ] **Step 3: Type-check and run tests**

Run: `npm run build`
Expected: build succeeds.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/FieldLabel.tsx src/generators/swap-collage/SwapCollageControls.tsx
git commit -m "refactor(collage-kit): extract shared FieldLabel to components/canvas"
```

---

### Task 3: Move `EmptySlotPlaceholder` + `DropHighlight` to `components/canvas`

**Files:**
- Create: `src/components/canvas/EmptySlotPlaceholder.tsx`
- Create: `src/components/canvas/DropHighlight.tsx`
- Modify: `src/generators/swap-collage/SwapCollagePreview.tsx`

These two Konva components are extracted verbatim (the `Placeholder` is renamed to `EmptySlotPlaceholder`). `SwapBoxPlaceholder` and `MaskOverlay` stay in swap-collage — they are tool-specific.

- [ ] **Step 1: Create `src/components/canvas/EmptySlotPlaceholder.tsx`**

Move the current `Placeholder` body out of `SwapCollagePreview.tsx`, renamed:

```tsx
// src/components/canvas/EmptySlotPlaceholder.tsx
import { Group, Rect, Text } from "react-konva";
import { useThemeColors } from "@/hooks/useThemeColors";
import { placeholderTextStrip } from "@/lib/canvas/dimensions";

/**
 * Empty-slot placeholder, drawn with Konva shapes so it lives natively on the
 * same Stage as real images (no separate HTML path, no async image decode).
 * A small centered hint over a 1px outline. Clicking it opens the file dialog;
 * it is never draggable or selectable for transform — only real images are.
 *
 * Reads its own theme colors via useThemeColors — no color props from upstream.
 */
export function EmptySlotPlaceholder({
  tileW,
  tileH,
  fontSize,
  strokeWidth,
  highlighted,
  onActivate,
}: {
  tileW: number;
  tileH: number;
  fontSize: number;
  strokeWidth: number;
  highlighted: boolean;
  onActivate: () => void;
}) {
  const { mutedForeground, primary } = useThemeColors();
  const strip = placeholderTextStrip(tileH);
  // When this tile is the drop target, the placeholder text turns primary.
  const textColor = highlighted && primary ? primary : mutedForeground;
  // The outline is inset by half its (screen-consistent) stroke width so the
  // full stroke lands inside the tile clip. Otherwise the clip eats the outer
  // half at the right/bottom edges and the shared A/B seam, leaving a sub-pixel
  // sliver that aliases away at many stage scales (the "border sometimes
  // hidden" bug). strokeWidth is in logical units, so divide by scale for a
  // true ~1 CSS px border. Adjacent empty tiles share a ~2px divider, which
  // reads as a normal box seam.
  return (
    <Group onMouseDown={onActivate} onTap={onActivate}>
      <Rect
        x={strokeWidth / 2}
        y={strokeWidth / 2}
        width={tileW - strokeWidth}
        height={tileH - strokeWidth}
        stroke={mutedForeground}
        strokeWidth={strokeWidth}
      />
      <Text
        text="Drop or click to upload"
        width={tileW}
        y={strip.y}
        height={strip.height}
        align="center"
        verticalAlign="middle"
        fontSize={fontSize}
        fill={textColor}
        listening={false}
      />
    </Group>
  );
}
```

- [ ] **Step 2: Create `src/components/canvas/DropHighlight.tsx`**

```tsx
// src/components/canvas/DropHighlight.tsx
import { Rect } from "react-konva";
import { useThemeColors } from "@/hooks/useThemeColors";

/** The accent border drawn over the tile a file is being dragged onto. Lives on
 *  the unclipped top Layer so the stroke isn't half-clipped at the tile edge;
 *  strokeWidth is divided by `scale` for a consistent ~2 CSS px regardless of
 *  stage zoom. Reads its own theme color via useThemeColors. */
export function DropHighlight({
  x,
  y,
  width,
  height,
  scale,
  visible,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  visible: boolean;
}) {
  const { primary } = useThemeColors();
  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      stroke={primary}
      strokeWidth={2 / scale}
      visible={visible}
      listening={false}
    />
  );
}
```

- [ ] **Step 3: Remove both definitions from `SwapCollagePreview.tsx`**

In `src/generators/swap-collage/SwapCollagePreview.tsx`, delete the `Placeholder` function (the `function Placeholder(...) {...}` block) and the `DropHighlight` function (the `function DropHighlight(...) {...}` block). Add imports for the moved components near the top (after the `useThemeColors` import):

```ts
import { DropHighlight } from "@/components/canvas/DropHighlight";
import { EmptySlotPlaceholder } from "@/components/canvas/EmptySlotPlaceholder";
```

- [ ] **Step 4: Update the `Placeholder` call site in `renderTile`**

In `SwapCollagePreview.tsx`, inside `renderTile`'s else-branch, rename the component and its import (props are identical). Replace:

```tsx
          <Placeholder
            tileW={tiles.tileW}
            tileH={tiles.tileH}
            fontSize={PLACEHOLDER_FONT_PX / scale}
            strokeWidth={1 / scale}
            highlighted={hoveredSlot === slot}
            onActivate={() => openPicker(slot)}
          />
```

with:

```tsx
          <EmptySlotPlaceholder
            tileW={tiles.tileW}
            tileH={tiles.tileH}
            fontSize={PLACEHOLDER_FONT_PX / scale}
            strokeWidth={1 / scale}
            highlighted={hoveredSlot === slot}
            onActivate={() => openPicker(slot)}
          />
```

(`DropHighlight`'s usage in the top Layer is unchanged — same name, same props.)

- [ ] **Step 5: Type-check and run tests**

Run: `npm run build`
Expected: build succeeds. (`useThemeColors` may become unused in `SwapCollagePreview.tsx` only if no other code there reads it — `SwapBoxPlaceholder` still does, so the import stays. Verify with `grep -n "useThemeColors" src/generators/swap-collage/SwapCollagePreview.tsx`; it should still appear inside `SwapBoxPlaceholder`.)

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/EmptySlotPlaceholder.tsx src/components/canvas/DropHighlight.tsx \
        src/generators/swap-collage/SwapCollagePreview.tsx
git commit -m "refactor(collage-kit): move EmptySlotPlaceholder + DropHighlight to components/canvas"
```

---

### Task 4: Extract the `useFileDrop` hook; `SwapCollagePreview` consumes it

**Files:**
- Create: `src/components/canvas/useFileDrop.ts`
- Modify: `src/generators/swap-collage/SwapCollagePreview.tsx`

This is the only piece with real logic. The generic drag mechanics (stage-rect lookup, file-type gate, `preventDefault`, re-render throttle) move into a typed hook `useFileDrop<T>`; the tool supplies `resolve` (drop point → target) and `onDrop`. `SwapCollagePreview` replaces its `clientToSlot`/`onDragOverFile`/`onDropFile`/`hoveredSlot` with the hook.

- [ ] **Step 1: Create `src/components/canvas/useFileDrop.ts`**

```ts
// src/components/canvas/useFileDrop.ts
import { useState, type DragEvent, type RefObject } from "react";
import type Konva from "konva";

export interface FileDropHandlers {
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDragLeave: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
}

/**
 * Image-file drag-and-drop over a Konva stage. The generic mechanics — stage
 * bounding-rect lookup, image-type gating, `preventDefault`, and re-render
 * throttling on drag-over — live here. The tool supplies two tool-specific
 * callbacks:
 *   - `resolve`: map a cursor position (in canvas-local px, plus the canvas's
 *     w/h) to a target of type T, or null when over no valid target.
 *   - `onDrop`: receive the dropped file + the resolved target.
 *
 * Returns `dropProps` to spread on the container element, `hoveredTarget` for
 * the canvas to draw its own highlight, and `reset` to clear it.
 */
export function useFileDrop<T>(opts: {
  stageRef: RefObject<Konva.Stage | null>;
  resolve: (x: number, y: number, w: number, h: number) => T | null;
  onDrop: (file: File, target: T) => void;
}): {
  dropProps: FileDropHandlers;
  hoveredTarget: T | null;
  reset: () => void;
} {
  const [hoveredTarget, setHoveredTarget] = useState<T | null>(null);

  // Map a screen cursor to a target. The stage canvas is centered in its
  // container, so we map against the canvas's own bounding rect; `resolve`
  // owns the tool-specific "which region is this" logic.
  const clientToTarget = (clientX: number, clientY: number): T | null => {
    const rect = opts.stageRef.current?.container().getBoundingClientRect();
    if (!rect) return null;
    return opts.resolve(
      clientX - rect.left,
      clientY - rect.top,
      rect.width,
      rect.height,
    );
  };

  // preventDefault so the browser allows the drop; only update state when the
  // target actually changes to avoid re-render churn on every mousemove.
  const onDragOver = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const next = clientToTarget(e.clientX, e.clientY);
    setHoveredTarget((prev) => (prev === next ? prev : next));
  };

  const onDragLeave = () => setHoveredTarget(null);

  // Reject non-images before preventDefault (so the browser keeps its default
  // for, e.g., text drops). NOTE: onDragLeave clears unconditionally, which can
  // flicker when crossing internal element boundaries — a drag-counter is the
  // documented fallback if it proves noticeable.
  const onDrop = (e: DragEvent<HTMLElement>) => {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.preventDefault();
    const target = clientToTarget(e.clientX, e.clientY);
    if (target !== null) opts.onDrop(file, target);
    setHoveredTarget(null);
  };

  return {
    dropProps: { onDragOver, onDragLeave, onDrop },
    hoveredTarget,
    reset: () => setHoveredTarget(null),
  };
}
```

- [ ] **Step 2: Consume the hook in `SwapCollagePreview.tsx`**

In `src/generators/swap-collage/SwapCollagePreview.tsx`:

(a) Add the import near the other `@/components/canvas` imports:

```ts
import { useFileDrop } from "@/components/canvas/useFileDrop";
```

(b) Delete the `hoveredSlot` state declaration:

```ts
  // The tile under the cursor during a file drag, or null. Purely view state —
  // not in swapReducer — driving the drop-target highlight.
  const [hoveredSlot, setHoveredSlot] = useState<Slot | null>(null);
```

(c) Delete the three handler definitions: `clientToSlot`, `onDragOverFile`, and `onDropFile` (the full blocks including their comments).

(d) Add the hook call in their place. It must read `stageRef`, `state.orientation` (via `pointToSlot`), and `loadImage`:

```ts
  // Image-file drag-and-drop over the stage. The hook owns the generic drag
  // mechanics + the drop-target highlight state; we supply the A/B slot mapping
  // (`pointToSlot`) and the load action.
  const { dropProps, hoveredTarget } = useFileDrop<Slot>({
    stageRef,
    resolve: (x, y, w, h) => pointToSlot(state.orientation, x, y, w, h),
    onDrop: (file, slot) => loadImage(slot, file),
  });
```

(e) Rename the two `hoveredSlot` reads to `hoveredTarget`. In the top Layer's `DropHighlight` usage:

```tsx
                visible={hoveredTarget === slot}
```

and in the `EmptySlotPlaceholder` usage inside `renderTile`:

```tsx
            highlighted={hoveredTarget === slot}
```

(f) Spread `dropProps` onto the container `<div>` (replacing the inline `onDragOver`/`onDragLeave`/`onDrop`). Replace:

```tsx
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center"
      onDragOver={onDragOverFile}
      onDragLeave={() => setHoveredSlot(null)}
      onDrop={onDropFile}
    >
```

with:

```tsx
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center"
      {...dropProps}
    >
```

- [ ] **Step 3: Type-check and run tests**

Run: `npm run build`
Expected: build succeeds. After removing the inline handlers, confirm no now-unused imports remain: `grep -nE "DragEvent|useState" src/generators/swap-collage/SwapCollagePreview.tsx`. `useState` is still used by `avail`; `DragEvent` should be removed from the React import if unused — change line 2–8 from:

```ts
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
```

to:

```ts
import { useEffect, useRef, useState, type ChangeEvent } from "react";
```

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Manual smoke check (drag/drop)**

Run: `npm run dev`, open the URL.
- Drag an image file over an empty tile → accent border appears on that tile; its placeholder text turns primary. Move to the other tile → highlight follows.
- Release over a tile → image loads into it.
- Drag a non-image file → no drop / no highlight stuck.
- Toggle orientation (Left/Right ↔ Top/Bottom) and theme (light/dark); highlight + drop still behave.
Stop the dev server (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/useFileDrop.ts src/generators/swap-collage/SwapCollagePreview.tsx
git commit -m "refactor(collage-kit): extract useFileDrop hook; SwapCollagePreview consumes it"
```

---

### Task 5: Extract `ImageSlotControls` to `components/canvas`

**Files:**
- Create: `src/components/canvas/ImageSlotControls.tsx`
- Modify: `src/generators/swap-collage/SwapCollageControls.tsx`

One per-image control block: source bar (owning its hidden file input) + zoom + filters. `SourceControl` and `ZoomControls` move out of `SwapCollageControls` into this file.

- [ ] **Step 1: Create `src/components/canvas/ImageSlotControls.tsx`**

```tsx
// src/components/canvas/ImageSlotControls.tsx
import { useRef, type ChangeEvent } from "react";
import {
  AlertTriangle,
  Image as ImageIcon,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import type { ImgStatus } from "@/hooks/useImageBitmap";
import type { FilterStack } from "@/lib/filters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { FilterStackControls } from "@/components/filters/FilterStackControls";
import { FieldLabel } from "@/components/canvas/FieldLabel";

/** A single source affordance per image: empty → "Choose source", ready → the
 *  filename, error → the message. The whole bar opens the file picker (replace);
 *  the ✕ at the right edge clears. The filename/error IS the status — there is
 *  no separate status line. */
function SourceControl({
  name,
  status,
  error,
  onReplace,
  onClear,
}: {
  name: string | null;
  status: ImgStatus;
  error: string | null;
  onReplace: () => void;
  onClear: () => void;
}) {
  const busy = status === "loading";
  const ready = status === "ready";
  const isError = status === "error";
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>Source</FieldLabel>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 w-full justify-start gap-2 font-normal text-muted-foreground",
            ready && "pr-9 text-foreground",
          )}
          disabled={busy}
          onClick={onReplace}
        >
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : ready ? (
            <ImageIcon />
          ) : isError ? (
            <AlertTriangle className="text-destructive" />
          ) : (
            <Upload />
          )}
          <span className={cn("truncate", isError && "text-destructive")}>
            {ready
              ? name
              : isError
                ? error ?? "error"
                : busy
                  ? "Loading…"
                  : "Choose source"}
          </span>
        </Button>
        {ready && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
            onClick={onClear}
            aria-label="Clear source"
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}

function ZoomControls({
  zoom,
  onChange,
  disabled,
}: {
  zoom: number;
  onChange: (zoom: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <FieldLabel>Zoom</FieldLabel>
        <span className="text-xs text-muted-foreground">{zoom.toFixed(2)}x</span>
      </div>
      <Slider
        value={[zoom]}
        min={1}
        max={4}
        step={0.01}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

/** One image slot's controls: source (with its own hidden file input), zoom,
 *  and filters. The tool supplies the data and callbacks; no refs are threaded
 *  in — `onPick` receives the chosen File directly. */
export function ImageSlotControls({
  name,
  status,
  error,
  zoom,
  onZoom,
  filters,
  onFilters,
  disabled,
  onPick,
  onClear,
}: {
  name: string | null;
  status: ImgStatus;
  error: string | null;
  zoom: number;
  onZoom: (zoom: number) => void;
  filters: FilterStack;
  onFilters: (filters: FilterStack) => void;
  disabled: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  // The component owns its file input so the tool never threads a ref.
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onPick(f);
    e.target.value = "";
  };

  return (
    <>
      <SourceControl
        name={name}
        status={status}
        error={error}
        onReplace={() => fileRef.current?.click()}
        onClear={onClear}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={onPickFile}
      />
      <ZoomControls zoom={zoom} onChange={onZoom} disabled={disabled} />
      <div className="flex flex-col gap-2">
        <FieldLabel>Filters</FieldLabel>
        <FilterStackControls
          stack={filters}
          onChange={onFilters}
          disabled={disabled}
        />
      </div>
    </>
  );
}
```

- [ ] **Step 2: Add the import and delete the moved helpers from `SwapCollageControls.tsx`**

In `src/generators/swap-collage/SwapCollageControls.tsx`:

(a) Add the import near the other `@/components/canvas` import:

```ts
import { ImageSlotControls } from "@/components/canvas/ImageSlotControls";
```

(b) Delete the local `SourceControl` function and the local `ZoomControls` function (their full blocks, ~lines 50–145).

(c) The lucide icons `AlertTriangle`, `Image as ImageIcon`, `Loader2`, `Upload`, `X` are now only used by the moved `SourceControl`. Remove them from the lucide-react import if unused after the deletion. Grep: `grep -nE "AlertTriangle|ImageIcon|Loader2|Upload|\\bX\\b" src/generators/swap-collage/SwapCollageControls.tsx`. Keep only the icons still referenced (`Columns2`, `Download`, `Rows2`); the import becomes:

```ts
import {
  Columns2,
  Download,
  Rows2,
} from "lucide-react";
```

(d) `Button` and `Slider` and `cn` may now be unused in `SwapCollageControls` — verify with grep and remove any import that no longer appears in the file body. (At minimum `Slider` and `cn` become unused since they were only in `ZoomControls`/`SourceControl`.) For each, run `grep -nE "\\bSlider\\b|\\bcn\\b|\\bButton\\b" src/generators/swap-collage/SwapCollageControls.tsx` and remove unused imports. `Input` and `Label` remain (used by `DimensionSlider`/mask controls).

- [ ] **Step 3: Replace the per-slot control blocks with `<ImageSlotControls>`**

In `SwapCollageControls.tsx`, inside the Image A `AccordionContent` (the block after the `<AccordionTrigger>Image A</AccordionTrigger>`), replace:

```tsx
            <SourceControl
              name={imgA.name}
              status={imgA.status}
              error={imgA.error}
              onReplace={() => fileA.current?.click()}
              onClear={() => clearImage("A")}
            />
            <input ref={fileA} type="file" accept="image/*" hidden onChange={onPick("A")} />
            {/* Sizing lives here, not on the canvas: a zoom slider per loaded
                image (zoom is a scalar), and width/height for the shared swap
                box. The canvas is position-only — see SwapCollagePreview. */}
            <ZoomControls
              zoom={state.xformA.zoom}
              disabled={imgA.status !== "ready"}
              onChange={(z) =>
                dispatch({
                  type: "SET_XFORM",
                  slot: "A",
                  xform: { ...state.xformA, zoom: z },
                })
              }
            />
            <div className="flex flex-col gap-2">
              <FieldLabel>Filters</FieldLabel>
              <FilterStackControls
                stack={state.filtersA}
                onChange={(f) => dispatch({ type: "SET_FILTERS", slot: "A", filters: f })}
                disabled={imgA.status !== "ready"}
              />
            </div>
```

with:

```tsx
            {/* Sizing lives here, not on the canvas: a zoom slider per loaded
                image (zoom is a scalar), and width/height for the shared swap
                box. The canvas is position-only — see SwapCollagePreview. */}
            <ImageSlotControls
              name={imgA.name}
              status={imgA.status}
              error={imgA.error}
              zoom={state.xformA.zoom}
              onZoom={(z) =>
                dispatch({
                  type: "SET_XFORM",
                  slot: "A",
                  xform: { ...state.xformA, zoom: z },
                })
              }
              filters={state.filtersA}
              onFilters={(f) => dispatch({ type: "SET_FILTERS", slot: "A", filters: f })}
              disabled={imgA.status !== "ready"}
              onPick={(file) => loadImage("A", file)}
              onClear={() => clearImage("A")}
            />
```

Repeat the same substitution for the Image B `AccordionContent`, using slot `"B"`, `imgB`, `state.xformB`, `state.filtersB`, `fileB`. Replace:

```tsx
            <SourceControl
              name={imgB.name}
              status={imgB.status}
              error={imgB.error}
              onReplace={() => fileB.current?.click()}
              onClear={() => clearImage("B")}
            />
            <input ref={fileB} type="file" accept="image/*" hidden onChange={onPick("B")} />
            <ZoomControls
              zoom={state.xformB.zoom}
              disabled={imgB.status !== "ready"}
              onChange={(z) =>
                dispatch({
                  type: "SET_XFORM",
                  slot: "B",
                  xform: { ...state.xformB, zoom: z },
                })
              }
            />
            <div className="flex flex-col gap-2">
              <FieldLabel>Filters</FieldLabel>
              <FilterStackControls
                stack={state.filtersB}
                onChange={(f) => dispatch({ type: "SET_FILTERS", slot: "B", filters: f })}
                disabled={imgB.status !== "ready"}
              />
            </div>
```

with:

```tsx
            <ImageSlotControls
              name={imgB.name}
              status={imgB.status}
              error={imgB.error}
              zoom={state.xformB.zoom}
              onZoom={(z) =>
                dispatch({
                  type: "SET_XFORM",
                  slot: "B",
                  xform: { ...state.xformB, zoom: z },
                })
              }
              filters={state.filtersB}
              onFilters={(f) => dispatch({ type: "SET_FILTERS", slot: "B", filters: f })}
              disabled={imgB.status !== "ready"}
              onPick={(file) => loadImage("B", file)}
              onClear={() => clearImage("B")}
            />
```

- [ ] **Step 4: Drop the now-unused `fileA`/`fileB` refs and `onPick` helper**

In `SwapCollageControls.tsx`:

(a) Delete the `onPick` helper:

```ts
  const onPick = (slot: "A" | "B") => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadImage(slot, f);
    e.target.value = "";
  };
```

(b) Delete the `fileA`/`fileB` ref declarations:

```ts
  const fileA = useRef<HTMLInputElement>(null);
  const fileB = useRef<HTMLInputElement>(null);
```

(c) `useRef` and `ChangeEvent` may now be unused. Grep: `grep -nE "\\buseRef\\b|\\bChangeEvent\\b" src/generators/swap-collage/SwapCollageControls.tsx`. If unused, change the React import from `import { useRef, useState, type ChangeEvent } from "react";` to `import { useState } from "react";`.

- [ ] **Step 5: Type-check and run tests**

Run: `npm run build`
Expected: build succeeds (no unused-import/`noUnusedLocals` errors — all steps 2/4 cleanups applied).

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Manual smoke check (controls)**

Run: `npm run dev`.
- Image A: click "Choose source" → file dialog opens; pick an image → filename shown, ✕ clear button appears, zoom slider + filters enable. Clear (✕) → resets.
- Repeat for Image B.
- Change zoom / filters → canvas updates.
Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/components/canvas/ImageSlotControls.tsx src/generators/swap-collage/SwapCollageControls.tsx
git commit -m "refactor(collage-kit): extract ImageSlotControls (owns file input) to components/canvas"
```

---

### Task 6: Extract `ExportControls` to `components/canvas`

**Files:**
- Create: `src/components/canvas/ExportControls.tsx`
- Modify: `src/generators/swap-collage/SwapCollageControls.tsx`

The export accordion *content*: export-size select + format tabs (controlled — the tool still holds `size`/`format` state and wires `onSize`/`onFormat`). **Deviation from spec, flagged for review:** the primary Export button stays as the footer below the accordion (preserving the current layout — "behavior unchanged"). `ExportControls` therefore owns only size + format.

- [ ] **Step 1: Create `src/components/canvas/ExportControls.tsx`**

```tsx
// src/components/canvas/ExportControls.tsx
import type { ExportFormat } from "@/export";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FieldLabel } from "@/components/canvas/FieldLabel";

/** Export-configuration controls: output size + format. Controlled — the tool
 *  owns `size`/`format` and supplies the change callbacks. The primary Export
 *  action button is kept by the tool (it is cross-cutting, not export-config). */
export function ExportControls({
  size,
  onSize,
  format,
  onFormat,
}: {
  size: number;
  onSize: (size: number) => void;
  format: ExportFormat;
  onFormat: (format: ExportFormat) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <FieldLabel>Export size</FieldLabel>
        <Select
          value={String(size)}
          onValueChange={(v) => onSize(Number(v))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1080">1080px</SelectItem>
            <SelectItem value="2160">2160px</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <FieldLabel>Format</FieldLabel>
        <Tabs value={format} onValueChange={(v) => onFormat(v as ExportFormat)}>
          <TabsList className="w-full">
            <TabsTrigger value="png">PNG</TabsTrigger>
            <TabsTrigger value="jpg">JPG</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Replace the export accordion content in `SwapCollageControls.tsx`**

In `src/generators/swap-collage/SwapCollageControls.tsx`:

(a) Add the import near the other `@/components/canvas` imports:

```ts
import { ExportControls } from "@/components/canvas/ExportControls";
```

(b) Inside the export `AccordionContent` (the `<AccordionItem value="export">` block), replace its two control divs:

```tsx
            <div className="flex flex-col gap-2">
              <FieldLabel>Export size</FieldLabel>
              <Select
                value={String(state.exportSize)}
                onValueChange={(v) =>
                  dispatch({ type: "SET_EXPORT_SIZE", size: Number(v) })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1080">1080px</SelectItem>
                  <SelectItem value="2160">2160px</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <FieldLabel>Format</FieldLabel>
              <Tabs value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                <TabsList className="w-full">
                  <TabsTrigger value="png">PNG</TabsTrigger>
                  <TabsTrigger value="jpg">JPG</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
```

with:

```tsx
            <ExportControls
              size={state.exportSize}
              onSize={(n) => dispatch({ type: "SET_EXPORT_SIZE", size: n })}
              format={format}
              onFormat={(f) => setFormat(f)}
            />
```

(c) `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue` and `Tabs`/`TabsList`/`TabsTrigger` may now be unused in `SwapCollageControls` (the Layout section still uses `Tabs` for Orientation/Aspect — check). Grep each: `grep -nE "\\bSelect|\\bTabs" src/generators/swap-collage/SwapCollageControls.tsx`. Remove only the truly unused imports. (Expected: the `Select*` imports become unused and are removed; `Tabs`/`TabsList`/`TabsTrigger` stay because Layout still uses them.)

- [ ] **Step 3: Type-check and run tests**

Run: `npm run build`
Expected: build succeeds (no unused-import errors after step 2c cleanup).

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Manual smoke check (export)**

Run: `npm run dev`.
- Load two images, change Export size (1080 ↔ 2160) and Format (PNG ↔ JPG), click Export → a file downloads at the chosen size/format.
Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/ExportControls.tsx src/generators/swap-collage/SwapCollageControls.tsx
git commit -m "refactor(collage-kit): extract ExportControls (size + format) to components/canvas"
```

---

## Self-review notes

- **Spec coverage:** `containFit`/`canvasDims`/`placeholderTextStrip` promotion → Task 1. `Orientation`/`AspectId` decoupling → Task 1 (re-export). `FieldLabel` → Task 2. `EmptySlotPlaceholder` + `DropHighlight` → Task 3. `useFileDrop` → Task 4. `ImageSlotControls` (owns file input) → Task 5. `ExportControls` → Task 6. What stays swap-specific (`SwapBoxPlaceholder`, `MaskSizeControls`/`DimensionSlider`, `tileLayout`/`pointToSlot`, reducer, layout solver, footer Export button) → explicitly noted. Non-goals (no N-slot framework, no chrome-hiding-extract) respected.
- **Spec deviation (flagged):** Task 6 keeps the Export button as the footer per "behavior unchanged," so `ExportControls` = size + format only. The approved spec listed the button inside `ExportControls`; this plan deviates to avoid a visible layout change. Surfaced for review before execution.
- **Type consistency:** `useFileDrop<T>`'s `resolve(x,y,w,h)` and `onDrop(file, target)` match the Task 4 consumer (`pointToSlot(orientation, x, y, w, h)` and `loadImage(slot, file)`). `ImageSlotControls` props (`name/status/error/zoom/onZoom/filters/onFilters/disabled/onPick/onClear`) match both the Task 5 definition and the Task 5 step-3 usages for slots A and B. `ExportControls` props (`size/onSize/format/onFormat`) match the Task 6 definition and usage. `EmptySlotPlaceholder` props are unchanged from the current `Placeholder`.
- **No placeholders:** every code step shows full before/after; the grep-based import-cleanup steps give the exact command and the expected resulting import line.
- **Build safety:** each task ends with `npm run build` + `npm test` before commit, so the tree is green after every task; no intermediate broken state.

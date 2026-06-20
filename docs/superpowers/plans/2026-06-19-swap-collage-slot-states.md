# Swap Collage Slot States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each collage tile's swap box a persistent element (opaque gray block when the other image is missing, the other image when present) and move the upload hint to a top strip so it is never covered.

**Architecture:** Render-only change inside `SwapCollagePreview.tsx`. One pure geometry helper (`placeholderTextStrip`) is extracted into `dimensions.ts` to follow the house pattern of pure, unit-tested modules. No reducer, layout, or controls changes.

**Tech Stack:** React, TypeScript, react-konva, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-swap-collage-slot-states-design.md`

---

## File Structure

- **Modify** `src/generators/swap-collage/dimensions.ts` — add `placeholderTextStrip(tileH)` pure helper.
- **Modify** `src/generators/swap-collage/__tests__/dimensions.test.ts` — test the helper.
- **Modify** `src/generators/swap-collage/SwapCollagePreview.tsx`:
  - `Placeholder` (lines ~35–63) — pin upload text to the top strip.
  - `MaskOverlay` (lines ~72–113) — remove the translucent guide, keep the invisible handle.
  - `renderTile` overlay branch (lines ~287–296) — render the opaque gray block when the other image is missing.

---

### Task 1: Add `placeholderTextStrip` pure helper

**Files:**
- Modify: `src/generators/swap-collage/dimensions.ts` (append after `containFit`, ~line 86)
- Test: `src/generators/swap-collage/__tests__/dimensions.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/generators/swap-collage/__tests__/dimensions.test.ts`, and add `placeholderTextStrip` to the import on line 2.

Updated import (line 2):
```ts
import { canvasDims, tileLayout, containFit, placeholderTextStrip } from "../dimensions";
```

New describe block appended at end of file:
```ts
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

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- dimensions`
Expected: FAIL — `placeholderTextStrip is not exported` (or undefined).

- [ ] **Step 3: Implement the helper**

Append to `src/generators/swap-collage/dimensions.ts` (after `containFit`):
```ts
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- dimensions`
Expected: PASS (all `placeholderTextStrip` cases + existing dimensions tests).

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/dimensions.ts src/generators/swap-collage/__tests__/dimensions.test.ts
git commit -m "feat(swap-collage): add placeholderTextStrip geometry helper"
```

---

### Task 2: Pin the upload hint to the top strip in `Placeholder`

**Files:**
- Modify: `src/generators/swap-collage/SwapCollagePreview.tsx` — `Placeholder` (~lines 35–63) and the import from `./dimensions` (~line 14)

- [ ] **Step 1: Import the helper**

In `src/generators/swap-collage/SwapCollagePreview.tsx`, update the import from `./dimensions` (line 14):

Before:
```ts
import { canvasDims, containFit, pointToSlot, tileLayout } from "./dimensions";
```
After:
```ts
import {
  canvasDims,
  containFit,
  placeholderTextStrip,
  pointToSlot,
  tileLayout,
} from "./dimensions";
```

- [ ] **Step 2: Replace the centered `<Text>` with a top-strip `<Text>`**

In `Placeholder`, the `<Text>` currently fills the whole tile with `verticalAlign="middle"`. Change it to occupy only the top strip computed from `tileH`.

Before (the `<Text>` element, ~lines 51–60):
```tsx
      <Text
        text="Drop or click to upload"
        width={tileW}
        height={tileH}
        align="center"
        verticalAlign="middle"
        fontSize={fontSize}
        fill={mutedFg}
        listening={false}
      />
```
After:
```tsx
      {(() => {
        const strip = placeholderTextStrip(tileH);
        return (
          <Text
            text="Drop or click to upload"
            width={tileW}
            y={strip.y}
            height={strip.height}
            align="center"
            verticalAlign="middle"
            fontSize={fontSize}
            fill={mutedFg}
            listening={false}
          />
        );
      })()}
```

(Using an IIFE keeps `Placeholder` a single returned `<Group>` without extracting a sub-component; the strip is computed locally. `verticalAlign="middle"` now centers within the top strip rather than the whole tile.)

- [ ] **Step 3: Verify type-check and build**

Run: `npm run build`
Expected: completes with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/generators/swap-collage/SwapCollagePreview.tsx
git commit -m "feat(swap-collage): pin upload hint to top strip so the swap box can't cover it"
```

---

### Task 3: Make the swap box persistent (opaque block when no image) and drop the translucent guide

**Files:**
- Modify: `src/generators/swap-collage/SwapCollagePreview.tsx` — `renderTile` overlay branch (~lines 287–296) and `MaskOverlay` (~lines 72–113)

- [ ] **Step 1: Simplify `MaskOverlay` to the invisible handle only**

Remove the translucent guide `<Rect>` (the `{show && ...}` block) and the now-unused `show` and `mutedFg` props. Keep the invisible draggable handle `<Rect>`.

Before (`MaskOverlay`, ~lines 72–113):
```tsx
function MaskOverlay({
  origin,
  show,
  maskPx,
  mutedFg,
  onHandleDrag,
}: {
  origin: { x: number; y: number };
  show: boolean;
  maskPx: RectGeom;
  mutedFg: string;
  onHandleDrag: (node: Konva.Rect) => void;
}) {
  const x = origin.x + maskPx.x;
  const y = origin.y + maskPx.y;
  return (
    <Fragment>
      {show && (
        <Rect
          name="overlay"
          x={x}
          y={y}
          width={maskPx.w}
          height={maskPx.h}
          fill={mutedFg}
          opacity={0.2}
          listening={false}
        />
      )}
      <Rect
        name="overlay"
        x={x}
        y={y}
        width={maskPx.w}
        height={maskPx.h}
        fill="rgba(0,0,0,0)"
        draggable
        onDragMove={(e) => onHandleDrag(e.target as Konva.Rect)}
      />
    </Fragment>
  );
}
```
After:
```tsx
function MaskOverlay({
  origin,
  maskPx,
  onHandleDrag,
}: {
  origin: { x: number; y: number };
  maskPx: RectGeom;
  onHandleDrag: (node: Konva.Rect) => void;
}) {
  const x = origin.x + maskPx.x;
  const y = origin.y + maskPx.y;
  return (
    <Rect
      name="overlay"
      x={x}
      y={y}
      width={maskPx.w}
      height={maskPx.h}
      fill="rgba(0,0,0,0)"
      draggable
      onDragMove={(e) => onHandleDrag(e.target as Konva.Rect)}
    />
  );
}
```

If `Fragment` is now unused (it was only used here), remove it from the React import on line 4:
Before:
```ts
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
```
After:
```ts
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
```
(Check first: if `Fragment` is referenced elsewhere in the file, leave the import. It is only used in `MaskOverlay`, so removing it is correct.)

- [ ] **Step 2: Remove the now-unused props from the `MaskOverlay` call site**

In the mask layer (bottom of `SwapCollagePreview`, ~lines 321–332), drop `show` and `mutedFg`.

Before:
```tsx
          {SLOTS.map((slot) => (
            <MaskOverlay
              key={slot}
              origin={tiles[slot]}
              show={slotImages[slot].status !== "ready"}
              maskPx={maskPx}
              mutedFg={mutedFg}
              onHandleDrag={(node) => onMaskTransform(slot, node)}
            />
          ))}
```
After:
```tsx
          {SLOTS.map((slot) => (
            <MaskOverlay
              key={slot}
              origin={tiles[slot]}
              maskPx={maskPx}
              onHandleDrag={(node) => onMaskTransform(slot, node)}
            />
          ))}
```

- [ ] **Step 3: Render the opaque swap-box block when the other image is missing**

In `renderTile`, the overlay branch currently draws the other image only when both `overlay` and `otherBmp` exist. Change it to an if/else: other image when present, opaque gray block otherwise.

Before (~lines 287–296):
```tsx
        {overlay && otherBmp && (
          <Group clip={{ x: maskPx.x, y: maskPx.y, width: maskPx.w, height: maskPx.h }}>
            <FilteredImage
              stack={slot === "A" ? state.filtersB : state.filtersA}
              image={otherBmp}
              {...overlay}
              listening={false}
            />
          </Group>
        )}
```
After:
```tsx
        {overlay && otherBmp ? (
          <Group clip={{ x: maskPx.x, y: maskPx.y, width: maskPx.w, height: maskPx.h }}>
            <FilteredImage
              stack={slot === "A" ? state.filtersB : state.filtersA}
              image={otherBmp}
              {...overlay}
              listening={false}
            />
          </Group>
        ) : (
          <Rect
            x={maskPx.x}
            y={maskPx.y}
            width={maskPx.w}
            height={maskPx.h}
            fill={mutedFg}
            listening={false}
          />
        )}
```

Notes for the implementer:
- `Rect` is already imported from `react-konva` (line 10) — no new import.
- `maskPx` is tile-local (0..tileW), the same coordinate space the image branch uses, so the gray block lines up exactly with where the image will appear.
- `listening={false}` so clicks on the gray block fall through to the `Placeholder` underneath (which opens this slot's picker). The invisible `MaskOverlay` handle on the top layer still lets the user drag/resize the mask.
- The gray block is fully opaque (no `opacity` prop) per the approved design.

- [ ] **Step 4: Verify type-check and build**

Run: `npm run build`
Expected: completes with no type errors (confirms `show`/`mutedFg` removal didn't leave dangling references, and `Fragment` removal was safe).

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: all tests pass (dimensions tests; layout/reducer/hooks unaffected).

- [ ] **Step 6: Commit**

```bash
git add src/generators/swap-collage/SwapCollagePreview.tsx
git commit -m "feat(swap-collage): persistent swap box (opaque placeholder when no image); drop translucent guide"
```

---

### Task 4: Manual verification of all four states

**Files:** none (visual check)

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`
Open the printed local URL and navigate to the swap collage generator.

- [ ] **Step 2: Verify state 1 (neither image)**

Both tiles empty. Each tile shows: full-tile outline, "Drop or click to upload" text in the **top strip** (not center), and a fully-opaque gray block at the centered swap region. Text is NOT covered by the gray block.

- [ ] **Step 3: Verify state 2 (own image only)**

Upload an image to slot A only. Tile A: image fills the tile, with an opaque gray block on top at the swap region. Tile B: outline + top-strip text + gray block.

- [ ] **Step 4: Verify state 3 (other image only)**

Clear slot A; ensure only slot B has an image. Tile A: outline + top-strip text, and the swap region shows slot B's image (not a gray block). Tile B: image fills tile, swap region shows slot A's missing image as a gray block. Text remains uncovered.

- [ ] **Step 5: Verify state 4 (both images)**

Both slots loaded. Each tile: image fills tile, swap region shows the other slot's image. No gray blocks remain.

- [ ] **Step 6: Verify the mask is still draggable/resizable in all states**

In each state, drag and resize the swap region (grab the block / image patch). It moves and resizes correctly, and the top-strip text never gets covered regardless of where the box is dragged.

- [ ] **Step 7: Verify theme toggle**

Toggle light/dark. The gray block and text color track `mutedFg` correctly (the sentinel already resolves this).

---

## Self-Review

**Spec coverage:**
- Persistent swap box (opaque gray when other image missing) → Task 3, Step 3. ✓
- Upload text moved to top strip → Task 2. ✓
- Drop the translucent guide, keep invisible handle → Task 3, Steps 1–2. ✓
- Gray block non-interactive (`listening={false}`) → Task 3, Step 3 note. ✓
- Single-file scope (dimensions helper extracted per house pattern) → Tasks 1–3. ✓
- No reducer/layout/controls changes → confirmed; `layout.ts` untouched. ✓

**Placeholder scan:** None. All code blocks are complete; no "TBD"/"add error handling"/etc.

**Type consistency:** `placeholderTextStrip` returns `{ y, height }`, consumed as `strip.y` / `strip.height` in Task 2. `MaskOverlay` props after Task 3 Step 1 match the call site in Step 2 (`origin`, `maskPx`, `onHandleDrag`). `Rect` already imported. `maskPx` is tile-local in both branches. Consistent.

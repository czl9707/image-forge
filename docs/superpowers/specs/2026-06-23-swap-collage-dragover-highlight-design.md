# Swap Collage — Drag-over highlight

**Date:** 2026-06-23
**Scope:** `src/generators/swap-collage/SwapCollagePreview.tsx`

## Problem

Dropping an image onto the swap-collage canvas already works — `SwapCollagePreview`
maps the drop point to a tile and loads the file into that slot. But there is **no
visual feedback during the drag**. `onDragOver` only calls `preventDefault()`, so the
user gets no indication of which tile will receive the image until they release.

## Goal

While a file is dragged over the canvas, the tile currently under the cursor shows an
accent-colored highlight (2–3px border) and, when that tile is empty, its placeholder
text and outline shift to the same accent color. When the cursor is not over a tile
(e.g. in the gutter, or has left the canvas), no tile is highlighted.

## Design

### State

Purely local view state in `SwapCollagePreview` — **not** added to `swapReducer`,
since this is transient UI feedback, not collage state:

- `hoveredSlot: Slot | null` — the tile under the cursor during an active drag, or `null`.

### Handlers (all on the container `<div>`)

- **`onDragOver`** — `preventDefault()` (as today) **and** compute the slot under the
  cursor, setting `hoveredSlot`. The drop-point → slot mapping is shared with
  `onDropFile`, so extract a single local helper, e.g.:

  ```ts
  const clientToSlot = (clientX: number, clientY: number): Slot | null => {
    const rect = stageRef.current?.container().getBoundingClientRect();
    if (!rect) return null;
    return pointToSlot(state.orientation, clientX - rect.left, clientY - rect.top,
      rect.width, rect.height);
  };
  ```

  `onDropFile` is rewritten to call `clientToSlot` + `loadImage`, then clear
  `hoveredSlot`. `onDragOver` calls `clientToSlot` and sets `hoveredSlot` (only when
  the result differs, to avoid re-render churn).

- **`onDragLeave`** — clear `hoveredSlot`.

**Known tradeoff (accepted):** clearing unconditionally on `onDragLeave` can cause a
brief flicker when the cursor crosses internal element boundaries inside the container
(e.g. Konva's `<canvas>` edges). If this proves noticeable, the documented fallback is
a drag-enter/leave counter held in a `useRef` (increment on `dragenter`, decrement on
`dragleave`, clear when it hits `0`). Not added now in the interest of the lean version.

### Accent color — reuse the existing sentinel

The component already reads a theme-aware `mutedFg` from an off-screen sentinel div
that wears `text-muted-foreground`, because reading the raw `oklch` token proved
unreliable for Konva/canvas fills. We **reuse that same sentinel** rather than adding
a second one: give the existing sentinel a child `<span className="text-primary" />`
and read `getComputedStyle(span).color` into a new `accentFg` state, re-read on
`resolvedTheme` change (mirroring the existing `mutedFg` effect). Both resolved
`rgb()` values come from one sentinel element.

### Rendering

- **Filled tile:** when `hoveredSlot === slot`, draw a 2–3px accent `<Rect>` stroke
  over the tile (canvas coords, on the existing `Layer` inside `renderTile`).
- **Empty tile (placeholder):** extend `Placeholder` with `accentFg` and `highlighted`
  props. When `highlighted`, the outline `Rect` stroke and the `Text` fill use
  `accentFg` instead of `mutedFg`.

Both rely on `hoveredSlot === slot` for the tile being rendered.

## Non-goals

- No highlight on the `Source` / "Choose source" buttons in the controls panel
  (could be added later).
- No change to drop semantics, reducer state, or the layout/dimensions modules.
- No persistence across renders beyond the drag — clearing on drop/leave is required.

## Testing

- `pointToSlot` (used by `clientToSlot`) is already unit-tested; the new helper adds
  only the stage-rect lookup, which is DOM-dependent and not worth unit-testing.
- The visual highlight is verified manually by dragging an image file over each tile,
  across the gutter, and out of the canvas in both orientations and both themes.

## Effort

Small. ~30 lines, all in `SwapCollagePreview.tsx`. No new dependencies, no
reducer/layout changes. The accepted `dragleave` flicker (see tradeoff above) is the
only visual rough edge, with the counter as a documented fallback.

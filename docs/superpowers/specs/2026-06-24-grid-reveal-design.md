# Grid Reveal — Design Spec

Date: 2026-06-24
Status: Approved (pre-implementation)

## Summary

A second image generator for **image-forge**, registered alongside Swap Collage. Two images — a **Top** overlay and a **Bottom** beneath — both cover the export viewport. A grey grid of `cols × rows` cells is laid over them. Each cell independently shows Top or Bottom: **click** a cell to flip which image it reveals; **drag** a cell to pan the image it is currently revealing. The grid has two modes — **equal** (uniform strips) and **random** (strips clamped to a min/max, re-rollable).

The same Konva `<Stage>` is both live preview and export source (preview === export), matching the app's existing invariant.

## Decisions

- **Pan model**: per-image, shared. Top has one transform, Bottom has another. Dragging a cell pans the image that cell reveals, everywhere that image is visible. (Matches Swap Collage's transform-by-source-image model.)
- **Per-image zoom + filters (revised 2026-06-24)**: each slot's `Transform` also carries `zoom` (1 = cover, set by a sidebar slider) and a **filter stack** (`filtersTop` / `filtersBottom`), identical to Swap Collage. The sidebar reuses the shared `ImageSlotControls` (source + zoom + filters). Pan remains a canvas drag only — there is no sidebar pan control or "Reset pan". (The original v1 scope was pan-only with no zoom/filters; this was expanded to match Swap Collage's per-image controls.)
- **Gesture**: single unified pointer gesture with a movement threshold. < ~3 CSS px → click → flip the cell; ≥ threshold → drag → pan the revealed image. No modes, no keyboard.
- **Grid mode**: `equal` (uniform strips) or `random` (both axes — column widths and row heights — random within min/max caps). Random mode has a **re-roll** button.
- **Default cell state**: all cells start on the **Top** image (default `false`). Clicks reveal the Bottom.
- **Borders**: always rendered (even with no images — empty-state skeleton). Fixed grey `#888888` at `0.5` opacity, fixed `2` logical px width, **baked into the export**, no toggle.
- **Rendering approach (Approach 2)**: every cell clips and draws its image at *viewport* coordinates inside the clip, so each image reads as one continuous picture across cells. Chosen over a single-background-image approach because it is no more work, is uniform to reason about, and leaves the future per-cell-offset mode additive rather than a rewrite.

## Language

Terms for `CONTEXT.md`, matching the existing vocabulary style:

- **Generator** — the grid-reveal module registered in `src/app/registry.ts`.
- **Slot** — one of the two images: **Top** (overlays) or **Bottom** (beneath). Avoid *layer*, *panel*.
- **Strip** — one column-width or row-height partition of the canvas. `cols` column strips × `rows` row strips form the grid.
- **Cell** — the intersection of one column strip × one row strip; a window showing Top or Bottom.
- **Cell state** — the per-cell boolean. `false` = Top shows (default), `true` = Bottom shows.
- **Grid mode** — `equal` (uniform strips) or `random` (strips clamped to min/max, re-rollable).
- **Transform** — per-image `{ panX, panY } ∈ [0,1]` (0.5 = centered). Top and Bottom each carry one.

## Module layout

A new generator at `src/generators/grid-reveal/`, mirroring the `swap-collage` structure:

```
src/generators/grid-reveal/
  index.ts                  // { id, name, icon, Preview, Controls, Provider }
  gridRevealReducer.ts      // state + actions
  layout.ts                 // pure geometry: strips, cell rects, placement, hit-test
  GridRevealProvider.tsx    // context: image loading, state, dispatch, stage ref, export
  GridRevealPreview.tsx     // the Konva <Stage>
  GridRevealControls.tsx    // sidebar
```

Registered in `src/app/registry.ts` (left nav, routes, and breadcrumb derive from the registry automatically). Icon: lucide `Grid3x3`. `id: "grid-reveal"`, `name: "Grid Reveal"`.

Reuses shared pieces: `lib/canvas/dimensions` (`canvasDims`), `lib/canvas/fit` (`coverFit`, `containFit`), `hooks/useImageBitmap`, `components/canvas/{ExportControls, ImageSlotControls, useFileDrop}`, and `export.ts`.

## Data model

```ts
type Slot = "top" | "bottom";
type GridMode = "equal" | "random";

interface Transform {
  panX: number; // [0,1], 0.5 = centered
  panY: number; // [0,1], 0.5 = centered
}

interface GridRevealState {
  aspect: AspectId;       // "16:9" | "4:3" | "1:1"
  orientation: Orientation; // "lr" | "tb"  (reuses canvasDims; gives portrait canvases)
  exportSize: number;     // long-edge px
  mode: GridMode;
  cols: number;           // m
  rows: number;           // n
  colStrips: number[];    // m widths, sum 1
  rowStrips: number[];    // n heights, sum 1
  cells: boolean[][];     // [rows][cols], default all false (Top shows)
  xformTop: Transform;
  xformBottom: Transform;
}
```

Actions:

- `SET_ASPECT` / `SET_ORIENTATION` — reset both transforms to centered (re-cover), like Swap Collage.
- `SET_EXPORT_SIZE`.
- `SET_MODE` — regenerate strips according to mode (`equal` → uniform, `random` → new roll); cells preserved (grid dimensions unchanged).
- `SET_COLS` / `SET_ROWS` — regenerate strips (per current mode) and **reset cells to all-Top** (resizing a grid and preserving the old pattern is out of scope).
- `REROLL` — new random strips (random mode only).
- `FLIP_CELL { row, col }` — toggle one cell.
- `SET_XFORM { slot, xform }` — clamps `panX`/`panY` to `[0,1]`.
- `RESET_XFORM { slot }`.

Defaults: aspect `4:3`, orientation `lr`, `exportSize` `1080`, mode `equal`, cols `4`, rows `3`, cells all `false`, both transforms centered (`{ panX: 0.5, panY: 0.5 }`).

## Geometry module (`layout.ts`, pure)

All functions pure and unit-tested.

- **`uniformStrips(n): number[]`** — `[1/n] × n`.
- **`rollStrips(n, minMult, maxMult, rng): number[]`** — random partition. Each strip is random within `[minMult·(1/n), maxMult·(1/n)]` (`MIN_STRIP_MULT = 0.5`, `MAX_STRIP_MULT = 1.5`), then renormalized to sum 1. `rng` injected (defaults to `Math.random`) for deterministic tests.
- **`placement(bmp, cw, ch, xform): { x, y, width, height }`** — cover-fit rect for the full viewport. `scale = coverFit(iw, ih, cw, ch)`; `x = -(imgW − cw)·panX`, `y = -(imgH − ch)·panY`. Identical rect for every cell of a given image, so the image is continuous across cells. Covers the viewport at pan extremes; centered at `0.5`.
- **`cellRects(colStrips, rowStrips, cw, ch): Rect[][]`** — `[rows][cols]` pixel rects via cumulative sums; tile the canvas exactly (no gaps, no overlap).
- **`hitTest(x, y, colStrips, rowStrips, cw, ch): { row, col } | null`** — which cell a logical-canvas point falls in.
- Border geometry derives from the strip cumulative boundaries (interior lines only).

Constants:

- `BORDER_COLOR = "#888888"`, `BORDER_OPACITY = 0.5` (applied via Konva `opacity` on the border rects).
- `BORDER_WIDTH = 2` logical px — **not** divided by stage `scale`, because borders are part of the export and preview must equal export.

## Preview rendering (`GridRevealPreview.tsx`)

Konva `<Stage>` scaled to fit via `containFit`. Three layers, bottom → top:

1. **Image layer** — for each cell, a `<Group clip={cellRect}>` drawing the chosen image at its *viewport* `placement` (same coordinates for every cell of that image → seamless across adjacent same-image cells). Image chosen by cell state: `false` → Top bitmap, `true` → Bottom bitmap. An empty slot draws nothing (blank). Plain Konva `<Image>` for v1; the filter-stack `FilteredImage` can replace it later with no structural change.
2. **Border layer** — grey `<Rect>` strokes at `0.5` opacity for every interior strip boundary, both axes. Always rendered, so with no images loaded the grid skeleton is still visible over the canvas background. Baked into the export (not tagged `.overlay`).
3. **Hit layer** — one transparent `<Rect>` covering the canvas, `listening`, tagged `name="overlay"` so the Provider's export path hides it for the snapshot (the same `.overlay` hide/restore pattern reused verbatim from `SwapCollageProvider`).

Up to `cols × rows` clipped image draws — acceptable for sane grid sizes (m, n capped at 12).

## Interaction (click vs drag)

Pointer handlers on the hit-layer `<Rect>` (a single node; scales to any grid). Drag state in a `useRef` (not React state) so pointer moves do not trigger re-renders.

- **Down** — record `{ startX, startY, startPan, slot }`. Compute the hit cell from logical coords via `hitTest`. `slot` = whichever image the cell currently reveals (`false` → Top, `true` → Bottom).
- **Move** — if displacement exceeds ~3 CSS px (converted to logical px by dividing by `scale`), enter **pan mode**: convert the delta to pan delta (`dPanX = −dx / (imgW − cw)`, `dPanY = −dy / (imgH − ch)`), clamp to `[0,1]`, dispatch `SET_XFORM { slot }`. Panning Bottom moves it everywhere it shows; same for Top — per-image, as decided.
- **Up** — if the threshold was never crossed → dispatch `FLIP_CELL { row, col }`. Otherwise the drag already committed the pan; nothing more.

When either slot has no image, the hit layer is non-listening (no flips or pans on an empty canvas); borders still render.

## Controls (`GridRevealControls.tsx`)

Sidebar, reusing extracted shared components:

- **Top image** / **Bottom image** slots — file input via `ImageSlotControls`; clicking a slot's button opens its picker. Canvas drag-drop via `useFileDrop`, routed by a small segmented **drop-target (Top / Bottom)** control that selects which slot a dropped file loads. Per-image **Reset pan** button.
- **Canvas** — Aspect select (16:9 / 4:3 / 1:1), Orientation toggle (lr / tb), Export size; **Export** via `ExportControls`.
- **Grid** — Mode segmented control (Equal / Random); Cols (m) and Rows (n) inputs (range 1–12); **Re-roll** button (enabled only in Random mode).

## Testing

Mirrors `geometry.test.ts` / `export.test.ts`:

- **`layout.ts` (pure)** — `uniformStrips` sums to 1; `rollStrips` respects min/max mult and sums to 1 (seeded rng for determinism); `placement` covers the viewport at pan extremes (no empty edge) and centers at `0.5`; `cellRects` tiles the canvas exactly; `hitTest` returns the correct cell including boundaries.
- **`gridRevealReducer.ts`** — `FLIP_CELL` toggles one cell; `SET_COLS/ROWS` regenerate strips and reset cells to all-Top; `SET_MODE` regenerates strips and preserves cells; `REROLL` changes strips only in random mode; `SET_XFORM` clamps to `[0,1]`; aspect/orientation change resets both transforms.

Interaction/preview stay untested at the unit level (Konva/pointer), consistent with how Swap Collage is tested today.

## Out of scope (deferred)

- **Per-cell offset** ("cool mode") — the per-cell clipped draw at viewport placement is exactly what makes this additive later: each cell would add its own offset to the placement. No rewrite, just a new data field and a drag-target change. Deliberately not built now (YAGNI), but enabled by construction.
- **Border width / color controls** (fixed values for v1).

> **Revision 2026-06-24:** Per-image **filters** and **zoom** were originally in this deferred list; both are now in scope (see Decisions). The per-cell offset mode remains deferred.

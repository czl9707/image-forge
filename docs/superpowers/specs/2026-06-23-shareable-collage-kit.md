# Shareable Collage Kit

**Date:** 2026-06-23
**Scope:** promotion/extraction of reusable pieces out of `src/generators/swap-collage/` into shared `src/lib/canvas/` and `src/components/canvas/`, in preparation for a second collage tool. Pure extraction — swap-collage's behavior is unchanged.

## Problem

swap-collage currently owns several pieces that are not swap-specific: image-file drag-and-drop, an empty-slot placeholder, per-image controls (source / zoom / filters), export controls, and a few canvas helpers (`containFit`, `canvasDims`, `placeholderTextStrip`) trapped in `swap-collage/dimensions.ts`. A second collage tool would duplicate all of them. We extract them now, while only one tool exists, so the seams are obvious and the surface is small.

## Goal

A small shared kit — one canvas-helper module and a handful of UI components/hook — that swap-collage consumes, so that tool #2 can compose the same pieces instead of copy-pasting.

## Non-goals

- **No generic N-slot collage framework.** `swapReducer`, the 2-tile `layout.ts` solver, `tileLayout`, `pointToSlot`, and `SwapBoxPlaceholder` stay swap-specific — generalizing the data model / layout math before tool #2 exists is YAGNI.
- No chrome-hiding export pattern extraction this pass (`hide(".overlay") → snapshot → restore` stays inline in `SwapCollageProvider.exportImage`; ~6 lines, not worth a component yet).
- No behavior change to swap-collage. This is a move + thin encapsulation refactor.

## Architecture

Two existing layers are extended; no new namespace is invented.

### `src/lib/canvas/` — helpers

Promote generic helpers out of `swap-collage/dimensions.ts`:

- **`containFit`** → `lib/canvas/fit.ts` (already holds `coverFit` and `clampCoverPos`; same file).
- **`canvasDims`** and **`placeholderTextStrip`** → new `lib/canvas/dimensions.ts`. `canvasDims(aspect, orientation, exportSize)` maps to canvas w/h; `placeholderTextStrip(tileH)` returns the centered text band `{ y, height }`. Both are generic to any collage/grid canvas.

`tileLayout` and `pointToSlot` **remain** in `swap-collage/dimensions.ts` and import the promoted helpers.

### `src/components/canvas/` — UI kit (new, parallel to `components/filters/`)

- **`FieldLabel`** — the tiny muted control label (currently duplicated inline in `SwapCollageControls`). One shared copy consumed by every control below and by swap-collage's remaining controls.
- **`ImageSlotControls`** — source bar + zoom + filters for one image slot. Owns its own hidden `<input type="file">` (the current `fileRefs` plumbing is dropped). Props:
  ```ts
  interface ImageSlotControlsProps {
    name: string | null; status: ImgStatus; error: string | null; // from useImageBitmap
    zoom: number; onZoom: (z: number) => void;
    filters: FilterStack; onFilters: (f: FilterStack) => void;
    disabled: boolean;                          // status !== "ready"
    onPick: (file: File) => void;               // owns the hidden input
    onClear: () => void;
  }
  ```
  Composes the existing `FilterStackControls` (from `components/filters`).
- **`ExportControls`** — export-size select + format tabs + Export button. Props:
  ```ts
  interface ExportControlsProps {
    size: number; onSize: (n: number) => void;
    format: ExportFormat; onFormat: (f: ExportFormat) => void;
    canExport: boolean;                          // tool decides (swap: bothReady)
    onExport: () => void;
  }
  ```
- **`EmptySlotPlaceholder`** (renamed from `Placeholder`) — the "Drop or click to upload" Konva placeholder. Props unchanged: `{ tileW, tileH, fontSize, strokeWidth, highlighted, onActivate }`. Still calls `useThemeColors()` itself.
- **`DropHighlight`** — the accent rect. Props unchanged: `{ x, y, width, height, scale, visible }`. Still calls `useThemeColors()`.
- **`useFileDrop`** — a generic hook for image-file drag-and-drop over a Konva stage. Generic layer (file-type check, `preventDefault`, re-render throttling) lives in the hook; the tool supplies the tool-specific bits via callbacks:
  ```ts
  function useFileDrop<T>(opts: {
    stageRef: RefObject<Konva.Stage | null>;
    resolve: (clientX: number, clientY: number) => T | null; // tool-specific drop-point → target
    onDrop: (file: File, target: T) => void;
  }): {
    dropProps: { onDragOver, onDragLeave, onDrop }; // spread onto the container <div>
    hoveredTarget: T | null;                        // feed to DropHighlight / EmptySlotPlaceholder
    reset: () => void;
  }
  ```
  Rationale: the highlight is drawn on a Konva `Layer`, not the DOM, so a DOM-wrapper `<DropZone>` would have to leak the hovered target back out. A hook returning `dropProps` + `hoveredTarget` lets the tool render its own highlight, keeping the rendering and the drop mechanics decoupled.

### swap-collage after the refactor

`SwapCollagePreview` consumes `EmptySlotPlaceholder`, `DropHighlight`, and `useFileDrop<Slot>` (its `resolve` calls `pointToSlot`, its `onDrop` calls `loadImage`). `SwapCollageControls` consumes `ImageSlotControls`, `ExportControls`, and `FieldLabel`. `SwapCollageProvider` is unchanged. What stays: `SwapBoxPlaceholder`, `MaskSizeControls`/`DimensionSlider` (MASK_MIN is swap-specific), `tileLayout`/`pointToSlot`, the reducer, the layout solver.

## Data flow

- **Helpers:** swap-collage → imports `containFit` from `lib/canvas/fit`, `canvasDims`/`placeholderTextStrip` from `lib/canvas/dimensions`. No logic change.
- **Drop:** container `<div>` gets `useFileDrop`'s `dropProps`; the hook calls the tool's `resolve` (→ `pointToSlot`) on drag-over/drop and reports `hoveredTarget`; `DropHighlight` + `EmptySlotPlaceholder` read it. `onDrop` → `loadImage`.
- **Controls:** `ImageSlotControls`'s internal input → `onPick(file)` → `loadImage`. Zoom/filter/onSize/onFormat/onExport flow through to the reducer/provider as today.

## Error handling

Unchanged. `useImageBitmap` already owns status/error; `ImageSlotControls` merely displays it. `useFileDrop` rejects non-image files (current behavior preserved) and does nothing if `resolve` returns null.

## Testing

Pure logic is unchanged, so no new unit logic to add. Verification:
- Existing tests (`dimensions`, `lib/canvas/fit`, `export`, `FilterStackControls`, `useImageBitmap`) pass with updated import paths.
- `npm run build` type-checks the new module boundaries.
- Manual: drag-over highlight, drop, source/zoom/filter/export controls behave exactly as before in both orientations and both themes.

## Effort

Small-to-medium, mechanical. New files: `lib/canvas/dimensions.ts`, and six under `components/canvas/` (`FieldLabel`, `ImageSlotControls`, `ExportControls`, `EmptySlotPlaceholder`, `DropHighlight`, `useFileDrop`). Modified: `lib/canvas/fit.ts`, `swap-collage/dimensions.ts`, `swap-collage/SwapCollageControls.tsx`, `swap-collage/SwapCollagePreview.tsx`. Risk is low: behavior-preserving moves.

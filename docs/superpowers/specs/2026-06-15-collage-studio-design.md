# Collage Studio — Design Spec

- **Date:** 2026-06-15
- **Status:** Design approved → implementation plans pending
- **Location:** `/home/zain_chen/kiyo-n-zane/nolli-collage` (standalone app, separate from `nolli`)

## 1. Purpose

A standalone SPA for generating composed/collaged images, built as an **extensible hub** of image generators. The first generator ("swap collage") automates a Photoshop workflow used for `nolli` marketing material: take 2 images, lay them as equal tiles, and swap a shared region between them.

Reference assets (read-only, the source of the layout): `./collage/{wright,mies,corb}/`. Each architect folder has a building photo, a Nolli-style map (dark/light), and 4 finished collages. The collage = photo (tile A) over map (tile B), with a rectangular inset swapped between them — exactly the v1 generator's mechanic.

## 2. Scope

### v1 — this build (3 sessions)

- **App shell:** 3-column layout (nav left / preview center / ops right), **no global header**. Generator registry + nav built from it.
- **Generator #1 "swap collage":** upload 2 images → layout toggle (top/bottom or left/right) → one shared rectangle mask (drag to move, corner handles to resize) → swap each image's mask content into the other → live preview → export png/jpg.

### Out of v1 — later sessions

- Per-image filters (HSL, curves).
- Multiple masks; arbitrary-shape masks.
- Border / styling knobs; save/reuse layout presets.
- Additional generators.

## 3. Architecture — generator hub

The app is a shell that hosts generators. Adding a generator = new folder + one registry entry. No plugin system, no dynamic loading.

```
┌──────────┬─────────────────────┬──────────┐
│ nav      │  center             │ ops      │
│ (gens)   │  preview canvas     │ controls │
│ ▸ swap   │  (clean, just art)  │ ▸ upload │
│   collage│                     │ ▸ layout │
│ ▸ (next) │                     │ ▸ mask   │
│          │                     │ ▸ fit    │
│          │                     │ ───────  │
│          │                     │ [export] │
└──────────┴─────────────────────┴──────────┘
   left sidebar     center (no header)   right sidebar = operations
```

**Extensibility contract:**

```ts
type Generator = {
  id: string;            // route segment + key, e.g. "swap-collage"
  name: string;          // nav label
  Preview: React.FC;     // rendered into the CENTER column
  Controls: React.FC;    // rendered into the RIGHT (ops) column
  Provider?: React.FC<{ children: ReactNode }>; // shared state for Preview + Controls
};
// Shell renders: [ left nav | <Provider><Preview/><Controls/></Provider> ]
// registry.ts → array of Generator; nav + routing derive from it.
// Add a generator: drop a folder under src/generators/, append one entry.
// Shell owns the 3-col geometry for consistent UX across generators.
// A future generator with no ops panel passes Controls = () => null (full-width preview).
```

- No global header. Title (if any) = small label in left nav, or omitted.
- **Shell owns all 3 columns** (consistency across generators): left nav, center = `Preview`, right = `Controls`.
- Right sidebar owns **all** operations: upload, layout, mask, fit, export.
- Center owns only the preview canvas.
- `Preview` and `Controls` share state via the generator's `Provider` (v1: the swap-collage provider holds `{ imgA, imgB, orientation, mask, fit }`).

## 4. Components

Shared (reused by future generators):

- `<ImageDropzone>` — upload slot; rejects non-images; toast on error.
- `<RectOverlay>` — rectangle the user drags (body = move, corner handles = resize), stored in **normalized** coords, clamped to `[0,1]`. Reused by any future region/mask tool.
- `useImageBitmap(file)` — `File → ImageBitmap` hook (decode errors surface to UI).

Generator-specific:

- Swap collage exports `SwapCollagePreview` (live canvas + `<RectOverlay>`) and `SwapCollageControls` (dropzones, layout toggle, mask + fit controls, export), sharing state via a `SwapCollageProvider` holding `{ imgA, imgB, orientation, mask, fit }`.

shadcn/ui primitives for controls: `button`, `slider`, `tabs`, `select`, `separator`, `label`, `sonner` (toasts), plus the `sidebar` block to seed left nav.

## 5. Rendering layer (pure, no React)

Logic is separated from UI and lives in pure, testable functions. This is the heart of the app.

### `lib/canvas/fit.ts` — pure
Given source `(imgW, imgH)` and target box `(boxW, boxH)` + mode, returns the draw rectangles:

```ts
type FitMode = "cover" | "contain" | "stretch";
type FitResult = { sx, sy, sw, sh, dx, dy, dw, dh }; // source crop + dest box
function computeFit(imgW, imgH, boxW, boxH, mode: FitMode): FitResult;
```

### `lib/geometry.ts` — pure
- `clampRect(r: Rect): Rect` — keep `{x,y,w,h}` within `[0,1]` (no overflow, min size).
- `toPixels(r: Rect, w: number, h: number): PixelRect` — normalized → pixel rect.

### `lib/canvas/renderSwap.ts` — pure
```ts
type SwapInput = {
  imgA: ImageBitmap; imgB: ImageBitmap;
  orientation: "tb" | "lr";
  tile: { w: number; h: number };   // per-tile pixel size
  gap: number;
  mask: Rect;                        // normalized, shared
  fit: FitMode;
};
function renderSwap(input: SwapInput): HTMLCanvasElement;
```

Render steps:

1. For each tile, draw its image cover-cropped to tile size → tile A and tile B are equal-size bitmaps.
2. `maskPx = toPixels(mask, tile.w, tile.h)` — **same pixels on both tiles** ⇒ "same area on both".
3. Swap:
   - Tile A: `ctx.drawImage(tileB, …maskPx…, …maskPx…)` — B's mask region drawn onto A at the mask region.
   - Tile B: `ctx.drawImage(tileA, …maskPx…, …maskPx…)` — A's mask region onto B.
4. Compose tiles by orientation (tb: stacked; lr: side by side, with `gap`) → final canvas.
5. Return canvas.

Because the mask is normalized and both tiles are equal size, the swap aligns exactly even when the two source images have different aspect ratios.

### `lib/canvas/export.ts`
`canvas → toBlob(type, quality) → triggerDownload(filename)`.

## 6. Data flow

```
upload → ImageBitmaps → SwapCollage state { orientation, mask, fit, tile }
       → renderSwap() → preview canvas (live, RAF-throttled on mask drag)
       → export → download
```

State lives inside the generator component. No global store (YAGNI for v1).

## 7. Mask interaction (`<RectOverlay>`)

- One rectangle, **normalized** `{x,y,w,h} ∈ [0,1]`.
- Pointer drag on body → move; drag on a corner handle → resize (aspect-free by default; shift to constrain optional/late).
- Clamp to `[0,1]` with a minimum size.
- Shown on **both** tiles so the user sees it is shared; editing on either updates the same normalized rect → both re-render.
- Live preview re-renders on every change; throttle with `requestAnimationFrame` during drag.

## 8. Error handling

- Non-image upload → reject + toast.
- Image decode failure → error state in the slot; export disabled.
- Mask collapsed (`w` or `h` → 0) → clamp to min size; warn if degenerate.
- Empty state (fewer than 2 images) → export disabled.

## 9. Testing strategy

- **Pure layer (primary):** unit-test `fit`, `geometry`, and `renderSwap`.
  - `renderSwap` correctness: sample the center pixel of the mask region in tile A and assert it equals tile B's source mask-center pixel (and vice versa).
  - Canvas is weak in jsdom → run `renderSwap` under `@napi-rs/canvas` (or `node-canvas`) in vitest, or test the math fns + one render smoke.
- **UI:** thin components; optional Playwright smoke for upload → mask drag → export (P2, nice-to-have).
- Keep the testable core pure so components stay thin.

## 10. Stack

- Vite + React + TypeScript.
- Tailwind + shadcn/ui (Radix primitives).
- Canvas 2D, zero image-processing deps.
- vitest (+ canvas shim) for tests.

## 11. Phased delivery (3 sessions)

Each phase is one session, independently shippable. Order chosen so plumbing lands first, the one tricky part (swap math) is proven in isolation before UI, and P2 is pure integration.

### P0 — Scaffold  *(session 1)*
**Goal:** bootable shell, no logic.
**Deliverables:**
- Vite + React + TS + Tailwind + shadcn project initialized.
- 3-column layout: left nav (from registry), center preview placeholder, right ops placeholder. No global header.
- `Generator` type + `registry.ts` with one placeholder entry.
- Minimal nav switching the center placeholder.
- shadcn components imported (user-assisted): `button`, `slider`, `tabs`, `select`, `separator`, `label`, `sonner`, `sidebar` block.
**Acceptance:** app boots; 3-col renders; nav switches placeholder; lint/typecheck/build pass; static build deployable.

### P1 — Pure render core  *(session 2)*
**Goal:** `renderSwap` correct + tested, no UI.
**Deliverables:**
- `lib/canvas/fit.ts` (`computeFit`, cover/contain/stretch).
- `lib/geometry.ts` (`clampRect`, `toPixels`).
- `lib/canvas/renderSwap.ts` (`renderSwap`).
- Unit tests (vitest + canvas shim): fit math, geometry clamp, swap correctness.
- Two fixture images for tests.
**Acceptance:** all unit tests green; `renderSwap` produces a correct swap on fixtures; no React/UI code in this layer.

### P2 — Swap generator UI  *(session 3)*
**Goal:** working v1 generator.
**Deliverables:**
- `<ImageDropzone>` ×2 (reject non-image, toast).
- Layout toggle (tb/lr) in ops panel.
- `<RectOverlay>`: move + corner-resize, normalized, clamp, shown on both tiles.
- Live preview via `renderSwap`, RAF-throttled on drag.
- Export button (ops panel bottom): toBlob png/jpg + download.
- Register "swap collage" in nav; center shows preview.
- Empty/error states; export disabled until 2 images loaded.
**Acceptance:** upload 2 images → see swapped collage live → move/resize mask updates both tiles → export downloads the correct file. Reproduces the reference collage layout.

## 12. File structure (proposed)

```
src/
  app/
    App.tsx                  # shell: 3-col layout, nav + active generator
    registry.ts              # Generator[] + routing
  generators/
    swap-collage/
      SwapCollageProvider.tsx  # shared state { imgA, imgB, orientation, mask, fit }
      SwapCollagePreview.tsx   # center: live canvas + RectOverlay
      SwapCollageControls.tsx  # right ops: dropzones, layout, mask, fit, export
      index.ts                 # registry entry: { id, name, Preview, Controls, Provider }
      types.ts
  components/
    ui/                      # shadcn
    shared/
      ImageDropzone.tsx
      RectOverlay.tsx
  lib/
    canvas/
      fit.ts                 # pure
      renderSwap.ts          # pure
      export.ts              # toBlob + download
    geometry.ts              # pure
    hooks/
      useImageBitmap.ts
```

## 13. Open items / decisions

- **Git:** `nolli-collage` is not a repo yet → init as the repo's first commit (this design doc), then feature branches per phase.
- **shadcn import:** user will import the template + components in P0.
- **Export default resolution:** decide in P2 (likely a per-tile target, e.g. 1080, configurable).
- **Mask aspect-constrain (shift-drag):** deferred to "later" unless trivial in P2.

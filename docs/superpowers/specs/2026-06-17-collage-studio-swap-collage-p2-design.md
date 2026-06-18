# Collage Studio — Swap Collage (P2) Design

- **Date:** 2026-06-17
- **Status:** Draft → pending implementation plan
- **Location:** `/home/zain_chen/kiyo-n-zane/nolli-collage`
- **Builds on:** P1 app shell & routing (`feat/collage-studio-p1-shell-routing`) — the `StudioShell`, `registry`, react-router routing, theme, and `react-konva` test mock are all reused unchanged.
- **Elaborates / partially supersedes:** the P2 section of `2026-06-16-collage-studio-design-v2.md` (§3.4, §4–§7, §10.2). Product goal unchanged; the rendering and interaction details below refine it. Deviations are listed in §12.

## What this is

The first real generator: **swap collage**. Drop two images onto two equal tiles, pan/zoom each independently, draw one shared rectangular mask over both, and the content inside the mask is swapped between the tiles. Export the result as PNG/JPG.

It is **generic** — any two images, no reference assets required. (The v1 spec's `collage/{wright,mies,corb}/` reference set is not in the repo and is not needed; the generator works on arbitrary pairs.)

---

## 1. Confirmed scope & decisions

| # | Decision |
|---|----------|
| 1 | **Generic** — any two images; no reference assets. |
| 2 | **Canvas shape:** preset aspect (`square` / `landscape` 16:9 / `portrait` 9:16) + configurable long-edge export size (1080 / 2160). Aspect pairs naturally with orientation (`landscape`↔lr, `portrait`↔tb, `square`↔either) as a default, but both stay independently adjustable. |
| 3 | **Tiles are fixed equal halves** (split `lr` or `tb`). Only the *images* and the *mask* transform — never the tile split. |
| 4 | **Each image** is independently pannable + uniformly zoomable within its tile. **No rotation.** |
| 5 | **Fit = cover only**, applied automatically on load (and on Replace). No fit selector. |
| 6 | **Swap mask:** one shared rectangle, movable + resizable (free aspect), normalized per-tile, clamped to a min size. **No rotation.** |
| 7 | **Selection model:** click image A / image B / the mask → that object is selected and gets Transformer handles. One selected at a time. Drag body = move; drag corner anchor = resize (images lock aspect; mask is free). |
| 8 | **Upload lives on the tiles**, not in the panel: an empty tile is a dropzone (drag-drop or click-to-browse); dropping on a filled tile replaces it. |
| 9 | **Preview↔export = single responsive Stage + pixelRatio export** (true single source of truth: the Stage you see is what is exported). |
| 10 | **Playwright smoke** deferred (nice-to-have, not in P2). |

---

## 2. File / module layout

```
src/
  lib/
    geometry.ts                      # Rect, clampRect, toPixels  (pure)
    canvas/fit.ts                    # coverFit                   (pure)
  hooks/
    useImageBitmap.ts                # File → ImageBitmap + status
  components/shared/
    ImageDropzone.tsx                # drag-drop / click-to-browse slot (reusable)
  generators/swap-collage/
    SwapCollageProvider.tsx          # useReducer state
    SwapCollagePreview.tsx           # Konva <Stage>: tiles + swap overlay + mask + Transformer
    SwapCollageControls.tsx          # right panel
    index.ts                         # registry entry { id: "swap-collage", ... }
  export.ts                          # stage.toCanvas({pixelRatio}) → toBlob → download
  app/registry.ts                    # append swap-collage entry  (modify)
  test/setup.ts                      # add Transformer to react-konva mock  (modify)
```

**No new packages.** `konva@10`, `react-konva@19`, `react-router@8` are already installed (P1). The open `react-konva ↔ React 19` version item (v2 §12) is resolved — v19.2.5 is compatible.

---

## 3. State — `SwapCollageProvider` (useReducer)

The generator's `Provider` wraps the whole shell (P1 already supports this), so `Preview` (center) and `Controls` (right) share one store. No global store (YAGNI).

```ts
type ImgStatus = "idle" | "loading" | "ready" | "error";
interface ImageState {
  bitmap: ImageBitmap | null;
  status: ImgStatus;
}
interface Transform {        // resolution-stable (see §5)
  panX: number;              // fraction of tile width, 0 = cover-centered
  panY: number;              // fraction of tile height
  zoom: number;              // multiplier of cover scale, 1 = cover
}
interface Mask { x: number; y: number; w: number; h: number }  // normalized [0,1] PER-TILE
type Orientation = "lr" | "tb";
type AspectId = "square" | "landscape" | "portrait";
type Selection = "imgA" | "imgB" | "mask" | null;

interface SwapState {
  imgA: ImageState;
  imgB: ImageState;
  xformA: Transform;
  xformB: Transform;
  orientation: Orientation;
  aspect: AspectId;
  exportSize: number;        // long-edge px (1080 | 2160)
  mask: Mask;                // default {0.3,0.3,0.4,0.4}
  selection: Selection;
}
```

Reducer actions: `LOAD_START/SUCCESS/ERROR` (per slot), `CLEAR` (per slot), `SET_XFORM` (per slot, from Transformer/drag writeback), `SET_MASK`, `SET_ORIENTATION`, `SET_ASPECT` (re-fits both images to cover), `SET_EXPORT_SIZE`, `SET_SELECTION`, `RESET_MASK`.

**Deviation from v2:** the spec's `{ imgA, imgB, orientation, mask, fit, tile }` is replaced. `tile` is dropped (tiles are fixed halves). `fit` is no longer state (cover is automatic). Each image now carries its own `Transform`.

---

## 4. Coordinate model

### 4.1 Canvas logical size (the export resolution)

Derived from `aspect` + `exportSize` (`exportSize` = long edge):

| aspect | CW × CH |
|--------|---------|
| square | `S × S` |
| landscape (16:9) | `S × S·9/16` |
| portrait (9:16) | `S·9/16 × S` |

### 4.2 Tiles

- `lr`: `tileW = CW/2`, `tileH = CH`. Tile A at `(0,0)`; Tile B at `(CW/2, 0)`.
- `tb`: `tileW = CW`, `tileH = CH/2`. Tile A at `(0,0)`; Tile B at `(0, CH/2)`.

Both tiles are equal pixel size — this is what lets the swap align exactly across two source images of different aspect ratios (v2 §5's promise).

### 4.3 Mask — normalized per-tile

The mask is `{x,y,w,h} ∈ [0,1]` **relative to one tile** (not the whole canvas), so the same normalized rect maps to the identical pixel rectangle in both tiles. In tile-local px: `mx=x·tileW, my=y·tileH, mw=w·tileW, mh=h·tileH`. For the on-top mask UI (canvas coords): tile A mask = `(tileAx+mx, tileAy+my, mw, mh)`; tile B mask = `(tileBx+mx, tileBy+my, mw, mh)`.

### 4.4 Display vs logical (the single-source-of-truth model)

A `ResizeObserver` on the preview area computes a **contain-fit** of the logical canvas into the available space: `scale = min(availW/CW, availH/CH)`. The `<Stage>` backing is `dispW=CW·scale, dispH=CH·scale`, and `stage.scaleX = stage.scaleY = scale`. All drawing happens in logical coordinates; Konva scales it down for display.

- **Interaction stays correct** because the scale lives *inside* Konva (not a CSS transform) — `getRelativePointerPosition()` accounts for it, so Transformer drag/resize map to logical coords naturally.
- **Export:** `stage.toCanvas({ pixelRatio: 1/scale })` produces a canvas of exactly `CW × CH` (logical) — `dispW · (1/scale) = CW`. The content is rendered at `scale` in the `dispW` backing, multiplied by `1/scale` → full logical resolution. Crisp, predictable, WYSIWYG.

---

## 5. Per-image transform model

Each tile is a **fixed window**; its image sits behind it and you pan/zoom the image; the window clips the overflow (a crop-frame mental model, like Photoshop).

**Stored resolution-stable:** `panX/panY` are fractions of the tile, `zoom` is a multiplier of the cover scale. This is deliberately decoupled from absolute pixels so that:
- **window (browser) resize** → no change (only display `scale` changes);
- **export-resolution change** → no change (logical size changes but the transform is fractional);
- **aspect change** → re-fit (reset `pan=0, zoom=1`), since the window shape actually changed.

**Derived placement** (logical px, inside the tile group, for drawing):

```
coverScale = max(tileW/iw, tileH/ih)            // iw,ih = image intrinsic dims
drawW = iw · coverScale · zoom
drawH = ih · coverScale · zoom
baseX  = (tileW - drawW)/2
baseY  = (tileH - drawH)/2
drawX  = baseX + panX · tileW
drawY  = baseY + panY · tileH
→ <Image image={img} x={drawX} y={drawY} width={drawW} height={drawH} />
```

On load: `pan=0, zoom=1` (cover, centered). The Transformer drives the node; on drag/resize end the node's geometry is solved back to `{panX, panY, zoom}` and written to state. (Round-trip math is an implementation detail for the plan; the transform is the source of truth.)

---

## 6. Pure helpers (unit-tested in Node)

- **`lib/geometry.ts`**
  - `interface Rect { x: number; y: number; w: number; h: number }`
  - `clampRect(r: Rect, min: number): Rect` — keeps a normalized rect in `[0,1]` with `w,h ≥ min`; resolves overflow by clamping position/size.
  - `toPixels(r: Rect, w: number, h: number): Rect` — normalized → px rect.
- **`lib/canvas/fit.ts`**
  - `coverFit(iw: number, ih: number, boxW: number, boxH: number): { scale: number; x: number; y: number }` — cover scale + centered position (the `zoom=1` base placement).

**Deviation from v2 §5:** `computeFit` does not return the source-crop shape `{sx,sy,sw,sh,dx,dy,dw,dh}`. We place-and-clip (full image scaled, clipped to the tile), not source-crop. The fit output is placement `{scale, x, y}`. `"contain"` and `"stretch"` modes are dropped (cover-only; stretch would distort, contradicting uniform-scale).

---

## 7. Image loading — `useImageBitmap` + `ImageDropzone`

- **`useImageBitmap()`** → `{ bitmap, status, error, load(file), reset() }`. `load` decodes `File → ImageBitmap` via `createImageBitmap`; sets `status` to `loading`→`ready` (or `error`). Non-image / decode failure → `error`.
- **`<ImageDropzone>`** (shared, reusable): drag-drop **or** click-to-browse; `accept="image/*"`; rejects non-images; shows idle / loading / error states. Sonner toast on rejection/error.

> File drag-drop is a DOM event, so the dropzone is a DOM overlay — never a Konva node.

---

## 8. `SwapCollagePreview` — the Konva tree + swap math

```
<Stage ref width={dispW} height={dispH} scaleX={scale} scaleY={scale} onPointerDown={selectByHit}>
  <Layer>                                          // tiles (clipped)
    <Group x={tileAx} y={tileAy} clip={tileClipA}>
      <Image image={imgA} {...placementA}/>        // base (under)
      <Group clip={maskLocalA}>                    // swap overlay
        <Image image={imgB} {...placementB}/>      // imgB at IDENTICAL local coords → the swap
      </Group>
    </Group>
    <Group x={tileBx} y={tileBy} clip={tileClipB}>
      <Image image={imgB} {...placementB}/>
      <Group clip={maskLocalB}>
        <Image image={imgA} {...placementA}/>      // imgA swapped into tile B
      </Group>
    </Group>
  </Layer>
  <Layer>                                          // mask UI (unclipped, on top)
    <Rect {...maskCanvasA}/>                       // both from one normalized mask
    <Rect {...maskCanvasB}/>
  </Layer>
  <Layer>
    <Transformer ref nodes={selectedNode ? [selectedNode] : []} {...anchorConfig}/>
  </Layer>
</Stage>
```

**Why the swap is trivial:** both tiles are equal-sized and the mask is per-tile-local, so image B's placement numbers are *identical* in tile A's local space and tile B's local space. The swap overlay is just `<Image imgB>` placed at those same coords inside tile A's group, clipped to the mask rect — no per-tile math, and it lines up exactly.

**Mask UI:** the outline Rects (and the Transformer when the mask is selected) live on the **unclipped top layer in canvas coords**, so handles never get clipped by a tile. The swap overlay's clip uses the **tile-local** mask rect inside each tile group. Both derive from one normalized `mask`.

**Selection:** pointer-down hit-tests the topmost object under the cursor → sets `selection`. Clicking empty canvas → `null` (deselect). The `Transformer` rebinds to the selected node ref.

**Transformer config:**
- Images (base `<Image>`): `keepRatio: true`, `rotateEnabled: false`, `flipEnabled: false`, corner anchors only → uniform zoom, no distortion.
- Mask `<Rect>`: `keepRatio: false`, `rotateEnabled: false`, all anchors, `boundBoxFunc` → clamp to `[0,1]` with min size.

**Drag/resize writeback:** on Transformer `dragmove`/`transform`, read node geometry and write back to state (`SET_XFORM` or `SET_MASK`), **RAF-throttled** so live edits don't flood React.

**Empty tiles:** when an image's `status === "idle"`, render a DOM `<ImageDropzone>` overlay positioned over that tile's display rect (dashed, "Drop image / click to browse") instead of the Konva tile group. A filled tile still accepts a file drop (→ Replace).

---

## 9. `SwapCollageControls` — right panel

- Orientation toggle: `lr` / `tb` (segmented).
- Aspect: `square` / `landscape` / `portrait` (segmented).
- Export size: `1080` / `2160` (select).
- Format: `PNG` / `JPG` (segmented).
- **Export** button — disabled until both images are `ready`.
- Per image (A and B): **Replace** (click-to-browse, re-covers on load) + **Clear** (back to dropzone) + status indicator.
- **Reset mask** (recenter to default).

No fit controls (cover is automatic).

---

## 10. Export — `export.ts`

```
pixelRatio = 1 / stage.scaleX                       // = logicalW / dispW
canvas     = stage.toCanvas({ pixelRatio })          // → CW × CH
canvas.toBlob(download, mime, quality)               // image/png  |  image/jpeg, 0.92
```

Filename: `swap-collage-<timestamp>.<ext>`. JPG is safe (canvas is fully opaque — two tiles fill it). Gated on both images `ready`.

---

## 11. Error handling

- Non-image dropped → reject + sonner toast; no state change.
- Decode failure → slot `status: "error"`, error shown in the dropzone; Export disabled.
- Mask collapsed (anchor dragged to ~0) → `boundBoxFunc` clamps to min size.
- Fewer than 2 `ready` images → Export disabled.
- Both tiles `idle` → preview shows two dashed "drop image" dropzones.

---

## 12. Testing strategy (maintainability > testability)

- **Pure helpers** (`geometry`, `fit`): Node unit tests — boundary/min-size clamping, `toPixels`, cover scale + centering.
- **Component tests** (jsdom + the extended `react-konva` mock):
  - `ImageDropzone`: accept image; reject non-image (toast); click-to-browse.
  - `useImageBitmap`: valid → `ready`; invalid → `error` (mock `createImageBitmap`).
  - `SwapCollageControls`: orientation/aspect/size/format dispatch; Export disabled until 2 ready and invokes the export fn (mocked `toCanvas`/`toBlob`/download); Replace/Clear.
  - `SwapCollageProvider`: reducer transitions (load, set-xform, set-mask, set-orientation, set-aspect re-fits, selection).
  - `SwapCollagePreview`: renders the tree with the mock; selection → `Transformer` receives the right node; empty-tile dropzone overlays present when `idle`.
- **`test/setup.ts`** gains a `Transformer` stub in the `react-konva` mock (currently missing — Stage/Layer/Rect/Text/Image/Line/Group exist; add `Transformer` as a div that renders children and accepts a `nodes` prop).
- **Not headless-tested:** actual canvas pixels / Konva compositing (v2 §8).
- **Playwright smoke** (upload 2 → collage renders → drag mask → export downloads): **deferred** — flagged nice-to-have, not in P2.

---

## 13. Deviations from the v2 spec

1. **Per-image pan/zoom transforms added** (v2 had cover-cropped tiles only).
2. **`computeFit` → `coverFit` placement `{scale,x,y}`**, not source-crop `{sx…dh}` (place-and-clip technique).
3. **Fit reduced to cover-only** (`contain` and `stretch` dropped).
4. **`tile` state dropped**; `fit` is no longer state (cover is automatic).
5. **Mask normalized per-tile** (not whole-canvas) — required for the swap to align across equal tiles.
6. **Right panel is static** (carried from P1's decision), not header-toggleable.
7. **Upload lives on the tiles** (dropzones in the preview), not as dedicated panel dropzones.

---

## 14. Deferred / out of scope

- Mask shift-drag aspect-constrain (trivial to add via Transformer later).
- Per-image rotation.
- Filters (HSL, curves); multiple/arbitrary masks; borders/styling; save/reuse presets; additional generators (v2 §2 "out of v1").

---

## 15. P2 acceptance

- Drop two images onto the tiles → both cover-fit; the swapped collage is visible live.
- Pan/zoom each image independently (select + handles); move/resize the mask; **both tiles update live** from one shared mask.
- Orientation (lr/tb), aspect, export size, and format controls all work; changing aspect re-fits the images.
- **Export** downloads a correct PNG or JPG at the chosen resolution; disabled until both images are ready.
- Errors behave: non-image → toast; decode failure → slot error state + export disabled.
- `swap-collage` is registered → reachable at `/swap-collage`; nav link + breadcrumb reflect it.
- `npm test` green; `tsc --noEmit` clean; `npm run build` succeeds.

# Collage Studio — Design Spec (v2)

- **Date:** 2026-06-16
- **Status:** Draft → pending implementation plans
- **Location:** `/home/zain_chen/kiyo-n-zane/nolli-collage`
- **Supersedes:** the *rendering approach* and *phasing* of `2026-06-15-collage-studio-design.md` (v1). Product requirements are unchanged.

## What changed from v1, and why

Same product: an extensible hub of image generators; the v1 generator is "swap collage." Two decisions reshaped the architecture:

1. **Rendering tech → Konva + react-konva** (not a bespoke imperative canvas core). Priority shift stated up front: **maintainability over testability**. Writing our own composition engine is surface we'd maintain forever; a maintained library wins. The collage becomes a declarative component tree, and the preview tree is also the export source (**single source of truth** — what you see is what you export).
2. **Phasing → structure-first.** Land the full app shell + routing + a dummy canvas before populating any generator. Skeleton, then meat.

Consequences vs v1: the bespoke `renderSwap` module and the `@napi-rs/canvas` Node-testing harness (v1 §5, §9) are **dropped**. The pure number-math helpers (`geometry`, `fit`) survive.

---

## 1. Purpose

A standalone SPA for generating composed/collaged images, built as an **extensible hub** of image generators. The first generator ("swap collage") automates a Photoshop workflow used for `nolli` marketing material: take 2 images, lay them as equal tiles, and swap a shared region between them.

Reference assets (read-only, the source of the layout): `./collage/{wright,mies,corb}/`. Each architect folder has a building photo, a Nolli-style map (dark/light), and 4 finished collages. The collage = photo (tile A) over map (tile B), with a rectangular inset swapped between them.

## 2. Scope

### v1 — this build

- **App shell:** shadcn **sidebar-15 inset layout** — left nav (generators), center canvas with a **minor header** (breadcrumb + right-sidebar toggle), right ops sidebar (toggleable). **URL routing** per generator (react-router).
- **Generator #1 "swap collage":** upload 2 images → layout toggle (top/bottom or left/right) → one shared rectangle mask (drag to move, corner handles to resize) → swap each image's mask content into the other → live preview → export png/jpg.

### Out of v1 — later sessions

- Per-image filters (HSL, curves). Multiple masks; arbitrary-shape masks. Border / styling knobs; save/reuse layout presets. Additional generators.

## 3. Architecture

### 3.1 Generator hub (contract unchanged)

```ts
type Generator = {
  id: string;            // route segment + key, e.g. "swap-collage"
  name: string;          // nav label + breadcrumb text
  Preview: React.FC;     // rendered into the CENTER (Konva Stage)
  Controls: React.FC;    // rendered into the RIGHT ops sidebar
  Provider?: React.FC<{ children: ReactNode }>; // shared state for Preview + Controls
};
```

- `registry.ts` → `Generator[]`. It is the single source for **left nav, routes, and breadcrumb**.
- Add a generator: drop a folder under `src/generators/`, append one entry.

### 3.2 Layout — adopt the shadcn sidebar-15 block (already imported)

The block components (`src/components/sidebar-left.tsx`, `sidebar-right.tsx`, `ui/sidebar.tsx`, `ui/breadcrumb.tsx`) are present but currently unused — the live `App.tsx` is a hand-rolled 3-column shell. P1 replaces it with the block's inset layout:

```
┌───────────┬───────────────────────────────────┬──────────┐
│ SidebarLeft│  SidebarInset                      │SidebarRight│
│  brand     │ ┌─────────────────────────────────┐│  Controls │
│  • Swap    │ │ breadcrumb  ◂  [right toggle]   ││ (ops)     │
│  • (next)  │ ├─────────────────────────────────┤│           │
│            │ │                                 ││           │
│            │ │   canvas (Konva <Stage>)        ││           │
│            │ │                                 ││           │
│            │ └─────────────────────────────────┘│           │
└───────────┴───────────────────────────────────┴───────────┘
   left nav      center: minor header + canvas      right ops (toggleable)
```

- `<SidebarProvider>` wraps everything.
- `SidebarLeft` — brand ("Collage Studio") + generator nav **from the registry**. The block's sample nav (favorites, workspaces, team switcher sample data) is stripped; a minimal secondary section (Settings/Help) may remain.
- `SidebarInset`:
  - **Minor header** (the only header; *no full-width global header*): breadcrumb ("Collage Studio / \<active generator\>") + **right-sidebar toggle** (`SidebarTrigger` controlling the inset `SidebarRight`).
  - `main`: the active generator's `Preview` (the Konva canvas).
- `SidebarRight` — hosts the active generator's `Controls`; toggleable via the header trigger. The block's sample content (calendars, date picker, nav-user) is stripped.

### 3.3 Routing — react-router

- `/:genId` → look up the registry entry → render its `Provider` + `Preview` (center) + `Controls` (right sidebar) + breadcrumb.
- `/` → redirect to the first registry entry.
- Left nav uses `NavLink`; active state derives from the route. Back/forward and deep-linking work. No nested routes needed for v1; the registry is the route table.

### 3.4 Rendering — Konva + react-konva, single source of truth

- The collage **is** a declarative `<Stage>` component tree driven by React state; `react-konva` reconciles it to canvas.
- **Preview === export source.** Export is `stage.toCanvas({ pixelRatio }) → toBlob → download`. One rendering path; no separate/imperative engine, no preview↔export divergence.
- **Pure helpers survive as number-math that feeds Konva** (they draw nothing): `geometry.ts` (`clampRect`, `toPixels`), `canvas/fit.ts` (`computeFit`).
- **Swap = declarative overlay:** each tile is a cover-cropped `<Image>` plus an overlay `<Image>` showing the *other* image cropped to the mask region. The overlay *is* the swap.

```
upload → ImageBitmaps → SwapCollage state { orientation, mask, fit, tile }
       → <Stage> (react-konva, auto-renders) → preview
       → export → stage.toCanvas() → toBlob → download
```

State lives inside the generator's `Provider`. No global store (YAGNI).

## 4. Components

**Shared (reused by future generators):**

- `<ImageDropzone>` — upload slot; rejects non-images; toast on error.
- `useImageBitmap(file)` — `File → ImageBitmap`; decode errors surface to UI.

**Generator-specific (swap):**

- `SwapCollageProvider` — state `{ imgA, imgB, orientation, mask, fit, tile }`.
- `SwapCollagePreview` — the `<Stage>`: two tile groups (cover-cropped base image + swap overlay) + a shared mask `<Rect draggable>` + `<Transformer>`, rendered on both tiles.
- `SwapCollageControls` — right ops: dropzones ×2, layout toggle (tb/lr), fit (cover/contain/stretch), export. (The mask is manipulated on-canvas, not via panel sliders.)
- `index.ts` — registry entry `{ id: "swap-collage", name, Preview, Controls, Provider }`.

> Note: there is **no `<RectOverlay>` DOM component** (as v1 proposed). The mask lives inside the Konva Stage as a draggable `Rect` + `Transformer`.

## 5. Rendering layer (pure helpers only)

The v1 "render core" is gone. What remains is two small pure modules — number-math, no canvas, fully unit-testable — whose outputs are fed to Konva:

- `lib/geometry.ts` — `Rect`; `clampRect(r)` keeps `{x,y,w,h}` within `[0,1]` (no overflow, min size); `toPixels(r, w, h)` maps normalized → pixel rect.
- `lib/canvas/fit.ts` — `FitMode = "cover" | "contain" | "stretch"`; `computeFit(imgW, imgH, boxW, boxH, mode)` → `{ sx, sy, sw, sh, dx, dy, dw, dh }`.

These compute the `crop`/position numbers handed to Konva (`<Image crop={…} width height />`) and the mask rect. Konva does all drawing, compositing, interaction, and rasterization. Because the mask is normalized and both tiles are equal pixel size, the swap aligns exactly even when the two source images have different aspect ratios.

## 6. Mask interaction

- One rectangle, **normalized** `{x,y,w,h} ∈ [0,1]`.
- Drag body → move; corner handles (Konva `Transformer`) → resize. Clamp to `[0,1]` with a minimum size (`clampRect`).
- Rendered on **both** tiles from one state; editing either updates the same normalized rect → both re-render (live, `requestAnimationFrame`-throttled during drag).

## 7. Error handling

- Non-image upload → reject + toast (sonner).
- Image decode failure → error state in the slot; export disabled.
- Mask collapsed (`w` or `h` → 0) → clamp to min size.
- Fewer than 2 images → export disabled.

## 8. Testing strategy (maintainability > testability)

- **Pure helpers (`geometry`, `fit`): unit-tested in Node** — pure math, no canvas.
- **Composition / swap / mask-interaction / export: not unit-tested headless.** Konva renders in the browser; it is not a pure function under `@napi-rs/canvas`. Covered instead by:
  - **Component tests** (`@testing-library/react`): Controls wiring (dropzones, layout/fit toggles, export-disabled states); route → registry → correct Preview + Controls + breadcrumb.
  - **Optional Playwright smoke** (P2, nice-to-have): upload 2 → collage renders → drag mask → export downloads the file.
- **No `@napi-rs/canvas`** — there is nothing to render headless anymore.

## 9. Stack

- Vite + React 19 + TypeScript; Tailwind v4 + shadcn/ui (sidebar-15 block, breadcrumb, separator, button, slider, tabs, select, label, sonner).
- **konva + react-konva** (rendering). **react-router** (routing). Canvas 2D under Konva; zero bespoke image-processing code.
- vitest + `@testing-library/react` + jsdom (unit + component tests).
- **Dropped vs v1:** `@napi-rs/canvas`.

## 10. Phased delivery

> v1 was P0 scaffold / P1 render core / P2 swap UI. v2 re-phases to **structure-first**.

### P0 — Scaffold ✅ done

Hand-rolled 3-column shell, `Generator` type + registry with one placeholder, state-based switching, vitest toolchain.

### P1 — App shell & routing *(structure)*

**Goal:** the full structural skeleton — sidebar-15 layout, react-router, a dummy Konva canvas — with **no generator functionality**. Every functional slot is a placeholder.

**Deliverables:**
- Adopt the sidebar-15 inset layout: `SidebarLeft` (brand + registry-driven generator nav), `SidebarInset` (minor header = breadcrumb + right-sidebar toggle; `main` = canvas), `SidebarRight` (Controls host, toggleable). Strip the block's sample data.
- react-router: `/:genId` → registry lookup → `Preview` (center) + `Controls` (right) + breadcrumb; `/` → first entry; `NavLink` active state.
- **Dummy Konva canvas** in center: install `konva` + `react-konva`; render an empty/placeholder `<Stage>` sized to the area as the placeholder generator's `Preview`. Proves the stack.
- Registry still carries the placeholder generator (swap is added in P2).

**Acceptance:** app boots in the sidebar-15 layout; URL routing works (deep-link + back/forward); left nav switches routes; breadcrumb reflects the route; right sidebar toggles from the header; the dummy `<Stage>` renders; lint / typecheck / build / tests pass.

### P2 — Populate swap collage

**Goal:** working v1 generator.

**Deliverables:**
- Pure helpers `lib/geometry.ts` + `lib/canvas/fit.ts` + unit tests.
- `<ImageDropzone>` ×2 + `useImageBitmap`.
- `SwapCollageProvider` (state), `SwapCollagePreview` (Konva Stage: tiles + swap overlay + on-canvas mask), `SwapCollageControls` (layout, fit, export).
- On-canvas mask: draggable `Rect` + `Transformer`, normalized, clamped, shown on both tiles; RAF-throttled.
- Export: `stage.toCanvas({ pixelRatio }) → toBlob → download` (png/jpg).
- Register "swap-collage" (`/swap-collage`); empty/error states; export disabled until 2 images loaded.
- Component tests + optional Playwright smoke.

**Acceptance:** upload 2 images → see the swapped collage live → move/resize the mask updates both tiles → export downloads the correct file. Reproduces the reference collage layout.

## 11. File structure (proposed)

```
src/
  app/
    App.tsx              # shell: SidebarProvider + sidebars + SidebarInset + router outlet
    registry.ts          # Generator[]
    routes.tsx           # react-router: /:genId → registry outlet; / → redirect
  components/
    ui/                  # shadcn (sidebar, breadcrumb, separator, …)
    sidebar-left.tsx     # brand + generator nav (registry-driven)
    sidebar-right.tsx    # Controls host (toggleable)
    shared/
      ImageDropzone.tsx
  generators/
    placeholder/PlaceholderGenerator.tsx   # dummy <Stage> in P1
    swap-collage/
      SwapCollageProvider.tsx
      SwapCollagePreview.tsx               # Konva <Stage>
      SwapCollageControls.tsx
      index.ts                             # registry entry
  lib/
    geometry.ts           # pure
    canvas/fit.ts         # pure
    hooks/useImageBitmap.ts
  export.ts               # thin: stage.toCanvas → toBlob → download
```

## 12. Open items / decisions

- **Export default resolution:** decide in P2 (likely a per-tile target, e.g. 1080, configurable). Same as v1.
- **Mask aspect-constrain (shift-drag):** deferred unless trivial in P2. Same as v1.
- **Left-sidebar secondary sections (Settings/Help):** keep minimal or drop — decided in P1.
- **`react-konva` ↔ React 19 version pinning:** confirm compatible versions at the P1 install.
- **Reference assets (`collage/`):** currently untracked; decide whether to commit or `.gitignore`.

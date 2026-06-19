# Image Filters (A & B) — Design

**Date:** 2026-06-19
**Scope:** Add a per-image, stackable filter list to the swap-collage generator's Image A and Image B, reusable by future collage types.

## Goal

Each image gets its own **filter list** — a stack of filters the user can add, remove, drag-reorder, toggle, and intensity-adjust independently. Filters stack: the result of one feeds the next, and order matters. Selected palette (all Konva-supported, stackable):

- **Blur** (radius)
- **Brightness** (Brighten)
- **Contrast**
- **Saturation** (HSL)
- **Hue shift** (HSL), with a Photoshop-style **Colorize** ("着色") toggle

## Non-goals

- Filters on the layout/mask itself — only on image pixels.
- Saving/loading named filter presets (YAGNI for now).
- Per-pixel painting masks.
- Throttling slider commits (only added later if 2160px drags feel slow).

## Key decisions

1. **Per-image independent stacks.** `filtersA` and `filtersB` are separate; A and B can have different looks.
2. **Swap-overlay correctness falls out for free.** Filters are applied by *source image*, not by tile/slot — imgB always wears `filtersB`, whether it renders as tile B's base or as the peek-through overlay in tile A's swap window.
3. **Approach A: Konva-native filters on the live nodes.** One render path (preview = export); no new dependencies; reorder is free. Tradeoff: requires `node.cache()` discipline.
4. **Filters live in a reusable shared module**, not inside `swap-collage`, so the next collage type can reuse both the logic and the UI.
5. **Explicit discriminated-union `FilterInstance`** — each kind carries only its own params (no unused `colorize`/`colorHue` on `blur`, etc.).
6. **Reset semantics:** clearing an image resets that slot's filters to `DEFAULT_STACK` (fresh image = fresh look); changing orientation/aspect resets only the transform, leaving filters untouched.

## Architecture — where the code lives

```
src/lib/filters/
  types.ts        # FilterInstance discriminated union, FilterStack, DEFAULT_STACK
  kinds.ts        # per-kind metadata: label, param range, neutral default, step
  apply.ts        # stackToFilters(stack) → Konva filter fns; applyToNode(node, stack)
  colorize.ts     # custom colorize imageData filter (unit-testable on raw pixels)
  __tests__/      # colorize + mapping tests
src/components/filters/
  FilterStackControls.tsx   # generic add/remove/reorder + slider UI (no Konva)
```

- **`lib/filters`** is framework-agnostic. Only `apply.ts` imports `konva`; `types.ts`/`kinds.ts`/`colorize.ts` are pure and reusable by any generator (Konva-based or not).
- **`FilterStackControls`** is a pure controlled component: props `({ stack, onChange, disabled })`. No swap-collage knowledge, no Konva. Any collage mounts it in its own UI.
- The **cache lifecycle** stays in each generator (tied to how that generator renders/transforms nodes) but is a one-liner calling the shared `applyToNode(node, stack)`.

## Data model

### `src/lib/filters/types.ts`

```ts
export type FilterInstance =
  | { id: string; kind: "blur";       enabled: boolean; radius: number }        // 0–40
  | { id: string; kind: "brightness"; enabled: boolean; value: number }         // -1–1
  | { id: string; kind: "contrast";   enabled: boolean; value: number }         // -100–100
  | { id: string; kind: "saturation"; enabled: boolean; value: number }         // -2–10
  | { id: string; kind: "hue";        enabled: boolean; shift: number;          // -180–180
      colorize: boolean; colorHue: number; colorSat: number };                  // 0–360 / 0–1

export type FilterStack = FilterInstance[];

export const DEFAULT_STACK: FilterStack; // all five kinds, neutral params, enabled
```

`id` is a stable per-instance id (drag-reorder keys, React list keys, DnD payload). Neutral defaults: blur 0, brightness 0, contrast 0, saturation 0, hue shift 0 (colorize off, colorHue 0, colorSat 1).

### `swapReducer.ts` changes

`SwapState` gains `filtersA: FilterStack` and `filtersB: FilterStack`, each initialized to `DEFAULT_STACK`. New action:

```ts
| { type: "SET_FILTERS"; slot: Slot; filters: FilterStack }
```

One mutation path — the union makes granular actions noisy; the Controls component builds the next stack and dispatches it whole. `SET_FILTERS` updates the named slot only.

## Filter → Konva mapping

`stackToFilters(stack)` walks the stack in order; each **enabled** instance contributes exactly one entry to the Konva `filters` array and sets the node params that filter reads:

| kind | Konva filter | param setter |
|---|---|---|
| `blur` | `Konva.Filters.Blur` | `node.blurRadius(radius)` |
| `brightness` | `Konva.Filters.Brighten` | `node.brightness(value)` |
| `contrast` | `Konva.Filters.Contrast` | `node.contrast(value)` |
| `saturation` | `Konva.Filters.HSL` | `node.saturation(value)` (hue/lum left at 0) |
| `hue`, `!colorize` | `Konva.Filters.HSL` | `node.hue(shift)` (sat/lum left at 0) |
| `hue`, `colorize` | custom `colorize` | `node.colorHue` / `node.colorSat` |

- `saturation` and `hue` each emit their **own** `HSL` filter instance (one sets only `saturation`, the other only `hue`), so they compose and reorder independently. Reordering two HSL filters is visually near-identity but harmless.
- A **disabled** instance contributes nothing (it's as if removed for rendering, but keeps its place/params in the stack).

### Colorize (Photoshop "着色")

Ticking Colorize discards the image's own hue/saturation and repaints each pixel with a single chosen hue+saturation while preserving luminance:

```
out = hslToRgb(colorHue, colorSat, luminance(px))   // luminance = 0.299R + 0.587G + 0.114B
```

Implemented as a custom Konva `(imageData)` filter in `colorize.ts` reading `node.colorHue` / `node.colorSat`. When a `hue` instance's `colorize` is on, `stackToFilters` emits the custom filter *instead of* `HSL`. Unit-testable on raw `ImageData`.

### `applyToNode(node, stack)`

1. Read current geometry/params off `node` as needed.
2. Set every relevant node param from the stack (blur radius, brightness, etc.).
3. `node.filters(fns)`.
4. If `fns.length > 0` → `node.cache()`; else `node.filters([])` + `node.clearCache()`.

## Render + cache lifecycle (in `SwapCollagePreview`)

- **Filter follows the source image.** In `renderTile`, the base node for slot A shows `imgA` → `applyToNode(node, filtersA)`; the overlay node shows the *other* image → that image's filters. imgB always wears `filtersB`.
- **When to re-cache.** A `useEffect` on each image node keyed `[stack, width, height]` calls `applyToNode`. Geometry changes (zoom alters width/height) and stack changes require re-cache; pan/drag (x,y only) move the cached node and do **not** re-cache.
- **Export stays free.** `cache()` bakes at the node's logical size (= export resolution), so `toCanvas({ pixelRatio })` is already crisp — no special export path. The existing `.overlay`-hiding logic in `exportImage` is untouched.

## Controls UI — `FilterStackControls`

Generic controlled component: `({ stack, onChange, disabled }) => JSX`. Renders the ordered stack:

- Each row: **≡ drag handle** (`lucide` `GripVertical`) · kind label · **enable toggle** · param **Slider** · **✕ remove**.
- **Hue row** additionally shows a **Colorize** toggle. When on, its slider switches to **Hue (0–360)** plus a small **Saturation (0–1)** slider, replacing the normal -180…180 shift.
- **Add filter** menu lists only kinds *not* currently in the stack (one of each kind — no duplicates).
- **Reset all** → `onChange(DEFAULT_STACK)`.
- **Drag-reorder:** native HTML5 DnD via the ≡ handle — small list, zero new dependencies. On drop, `onChange` is called with the reordered stack.

**Placement:** under each image's accordion section, after **Zoom**. So Image A = Source → Zoom → **Filters**; Image B likewise.

```tsx
<FilterStackControls
  stack={state.filtersA}
  onChange={(f) => dispatch({ type: "SET_FILTERS", slot: "A", filters: f })}
  disabled={imgA.status !== "ready"}
/>
```

## Reset semantics

- **Clear image** (`SwapCollageProvider.clearImage`): dispatch `RESET_XFORM` **and** `SET_FILTERS(slot, DEFAULT_STACK)`. Fresh image, fresh look.
- **Orientation/Aspect change:** reducer resets transform only; filters untouched (layout change, not a new image).
- New image over a cleared slot starts from `DEFAULT_STACK` + identity xform — already neutral.

## Testing (vitest + RTL/jsdom)

- `colorize.ts`: feed synthetic `ImageData` (white, mid-gray, pure red) → assert output ≈ `hslToRgb(colorHue, colorSat, lum)` and luminance preserved.
- `apply.ts`: assert `stackToFilters` returns the correct Konva filter fns in order, and `applyToNode` sets the right node params + calls `cache()`/`clearCache()` (mock node).
- `swapReducer`: `SET_FILTERS` writes the named slot; clearing resets to `DEFAULT_STACK`; orientation change leaves filters intact.
- `FilterStackControls`: RTL — toggle disables a row, remove drops a row, add repopulates, colorize controls appear only on the hue row, drag-reorder produces the expected array.

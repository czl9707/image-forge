# Swap Collage — Per-Slot Empty/Placeholder States

**Date:** 2026-06-19
**Scope:** `src/generators/swap-collage/SwapCollagePreview.tsx` only (render-only).

## Problem

Each collage tile (slot A / slot B) has a **base** layer (this slot's own image) and a **swap box** layer (the mask region showing the *other* slot's image). Today the swap box is drawn **only when the other image exists** — otherwise that rectangle is empty. This leaves the four logical states inconsistent:

| State | Today (base) | Today (swap box @ mask) |
|---|---|---|
| 1 — neither image | upload text (centered) + outline | *empty* (nothing drawn) |
| 2 — own image only | image | *empty* |
| 3 — other image only | upload text (centered) + outline | other image |
| 4 — both images | image | other image |

Two gaps vs. the desired behavior:

1. **States 1 & 2 have no visible swap box** when the other image is missing.
2. **The upload text is centered**, so it is occluded by the centered swap box (the default mask is `{x:0.3, y:0.3, w:0.4, h:0.4}` — dead center — and the mask is draggable, so it can cover any fixed position).

## Desired Behavior

The swap box is a **persistent element**: always rendered at the mask region. It shows the other slot's image when that image is ready; otherwise it renders as a **fully-opaque muted-foreground block** (the placeholder).

| State | Base (own image) | Swap box (overlay @ mask) |
|---|---|---|
| 1 — neither | upload text (top strip) + outline | opaque gray block |
| 2 — own only | image | opaque gray block |
| 3 — other only | upload text (top strip) + outline | other image |
| 4 — both | image | other image |

The upload text moves from the tile center to a **pinned top strip** (~top 15% of the tile), so the centered swap box never covers it.

## Design

### One rule, no special-casing

Swap-box rendering per tile becomes an if/else driven solely by whether the *other* image is ready:

- **other image ready** → existing clipped `FilteredImage` of the other slot's image, framed by the other slot's transform (unchanged).
- **other image missing** → a `<Rect>` at `maskPx`, `fill={mutedFg}`, fully opaque, `listening={false}`.

The base layer rule is unchanged (own image, or the `Placeholder`).

### Changes (all in `SwapCollagePreview.tsx`)

1. **`renderTile` overlay branch.** Replace
   ```tsx
   {overlay && otherBmp && (<Group clip={maskPx}><FilteredImage …/></Group>)}
   ```
   with an if/else: keep the image branch when `overlay && otherBmp`; otherwise render the opaque gray `<Rect>` at `maskPx`. The gray block lives inside the tile's clipped `Group` in local coords — the same coordinate space and clipping the image branch already uses (`maskPx` is tile-local).

2. **`Placeholder` text position.** Keep the full-tile outline `<Rect>` (the "empty box") and its click-to-open behavior. Change the `<Text>` from `verticalAlign="middle"` to a top strip: anchor it near the top of the tile (top ~15%), full width, centered horizontally. Clicking anywhere on the outline still opens this slot's picker.

3. **`MaskOverlay` simplification.** The translucent guide (`fill={mutedFg} opacity={0.2}`, shown only when this slot's own image is missing) is now redundant — states 1–2 are covered by the opaque gray block, states 3–4 by the image patch. **Remove the guide.** Keep the invisible draggable/resizable `<Rect>` handle (always present, top layer) so the mask stays adjustable in every state.

### Interaction details

- The opaque gray block is **non-interactive** (`listening={false}`): clicks pass through to the `Placeholder` underneath, so clicking the surrounding empty tile opens this slot's picker, as today.
- The invisible mask handle (top layer) remains draggable/resizable in all states, so the swap box can be repositioned before any image is loaded.

### Coordinate notes

- `maskPx = toPixels(mask, tileW, tileH)` is tile-local (0..tileW). The existing overlay `<Group clip={{ x: maskPx.x, … }}>` confirms this, and the gray `<Rect>` reuses the same local coords. No change to `layout.ts`.

## Non-Goals

- **State 4 grab affordance:** when both images are present there is still no visible outline on the swap box — only the invisible handle (same as today). Not adding a visible outline.
- **Gray-block click behavior:** clicking the gray block does nothing special; upload happens by clicking the surrounding empty tile area, as today.
- No reducer, `layout.ts`, controls, or filter changes.

## Testing

Render-only Konva change; no strict unit-test requirement. Optionally add a small unit test asserting the `Placeholder` text is positioned in the top strip rather than vertically centered — defer unless desired.

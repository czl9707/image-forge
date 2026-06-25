# image-forge

A standalone SPA built as an extensible hub of image **generators**. The first (and currently only) generator is **swap collage**. The same Konva `<Stage>` is both the live preview and the export source (preview === export).

## Language

### The hub

**Generator**:
A pluggable image-output module registered in `src/app/registry.ts` as `{ id, name, Preview, Controls, Provider }`. Left nav, routes, and breadcrumb all derive from the registry.
_Avoid_: plugin, tool, effect

**Slot**:
One of the two image positions in a swap collage, named `"A"` or `"B"`. Each slot carries its own image, **transform**, and **filter stack**.
_Avoid_: panel, channel, layer

### Swap collage

**Tile**:
One of the two equal halves of the canvas. Tile A and tile B are laid out by orientation (`lr` = left/right, `tb` = top/bottom).

**Mask**:
The single normalized rectangle `{x,y,w,h} ∈ [0,1]` shared by both tiles — the swapped region. Dragged/resized on-canvas; rendered identically on both tiles.
_Avoid_: window (except in "cover window" below), selection, inset

**Swap overlay**:
Each tile renders its base image **plus** an overlay showing the *other* slot's image cropped to the mask. The overlay *is* the swap. The overlay on tile A wears slot B's image and filter stack (and vice versa).
_Avoid_: cutout, peek-through, inset image

**Transform**:
A slot's resolution-stable image framing: `{ zoom, panX, panY }`. Pan is normalized to the tile. The same transform drives both a tile's base layer and the *other* tile's overlay of that image.
_Avoid_: view, camera, framing state

**Placement**:
The concrete pixel rectangle `{x, y, width, height}` an image occupies inside its tile, computed from the image's dimensions, the tile size, and its **transform**, clamped to the cover window. Forward direction: transform → placement.
_Avoid_: position (too generic), rect (that's the data type)

**Cover window**:
The constraint that an image always fully covers its tile (no empty edge): the image's top-left must satisfy `tileW - width ≤ x ≤ 0` (and y likewise). Enforced by `clampCoverPos`.

**Swap layout**:
The whole-collage placement result: the base and overlay placement for both tiles, plus the mask in pixels. Computed purely from `{ tiles, mask, image dimensions, transforms }`. This is the unit that holds the swap's defining cross-reference (A's overlay uses B's transform).
_Avoid_: composition, arrangement

### Filters

**Filter stack**:
An ordered list of **filter instances** applied to one slot's image (`filtersA` / `filtersB`). Filters apply by *source image*, not by tile: an image keeps its stack whether it renders as a base or as another tile's overlay.

**Filter instance**:
One entry in a filter stack: a discriminated union over `kind` (blur, brightness, contrast, saturation, hue). The `hue` kind carries a **colorize** sub-toggle. Each instance is independently toggled and intensity-adjusted; order matters (output of one feeds the next).

### General

_Avoid_: "boundary," "service," "component" (the generic kind) when naming seams — use **module**, **seam**, **adapter** as in the architecture language.

### Grid reveal

**Slot**:
One of the two stacked images — **Top** (overlays) or **Bottom** (beneath). Both cover the export viewport.
_Avoid_: layer, panel.

**Strip**:
One column-width or row-height partition of the canvas. `cols` column strips × `rows` row strips form the grid. In **equal** mode strips are uniform; in **random** mode each is clamped to a min/max of the uniform size and re-rollable.
_Avoid_: band, lane.

**Cell**:
The intersection of one column strip × one row strip — a window showing Top or Bottom.
_Avoid_: tile (that belongs to swap collage), square.

**Cell state**:
The per-cell boolean. `false` = Top shows (default), `true` = Bottom shows. Click flips it.
_Avoid_: flag (too generic).

**Grid mode**:
`equal` (uniform strips) or `random` (clamped random strips, re-rollable).

**Transform**:
A slot's per-image pan `{ panX, panY } ∈ [0,1]` (0.5 centered). Dragging a cell pans the image it reveals, everywhere that image shows.

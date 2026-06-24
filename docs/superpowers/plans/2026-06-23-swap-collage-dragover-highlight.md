# Swap Collage Drag-over Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a file is dragged over the swap-collage canvas, highlight the tile (A or B) under the cursor with an accent border, and turn that tile's empty-placeholder text to accent color.

**Architecture:** All work is local view state in `SwapCollagePreview.tsx` — no reducer/layout changes. A `hoveredSlot` state tracks the tile under the cursor during a drag, driven by a shared `clientToSlot` helper used by both the drag-over and drop handlers. An accent color is read from the existing off-screen sentinel's new `text-primary` child span. The highlight is a per-slot `<Rect>` on the unclipped top Konva Layer (so the 3px border isn't half-clipped by the tile's clip group); the empty placeholder's text switches to accent via a `highlighted` prop.

**Tech Stack:** React, TypeScript, react-konva, Tailwind (CSS tokens), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-23-swap-collage-dragover-highlight-design.md`

**On testing:** There is no new pure logic to unit-test — `pointToSlot` (the only non-trivial math) is already covered, and everything added here is DOM/Konva visual behavior. So this plan verifies via `npm run build` (type-check) and manual browser checks, as the spec explicitly endorses. Do not fabricate a unit test for DOM-dependent code.

**All code in this plan is in `src/generators/swap-collage/SwapCollagePreview.tsx`.** Line numbers refer to the file as it exists at the start of the task; later tasks shift them, so each task re-reads by anchor text rather than line number.

---

### Task 1: Read a resolved accent color from the shared sentinel

**Files:**
- Modify: `src/generators/swap-collage/SwapCollagePreview.tsx`

This adds a `text-primary` child `<span>` to the existing off-screen sentinel and reads its resolved `color` into a new `accentFg` state, mirroring the existing `mutedFg` read. No behavior change yet — `accentFg` is wired up in Task 3.

- [ ] **Step 1: Add `accentFg` state and read it in the existing effect**

Find this block (the sentinel effect):

```ts
  // Off-screen element wearing the muted-foreground Tailwind class; we read its
  // computed text color. That yields a resolved rgb() value that Konva/canvas
  // always accepts and that tracks light/dark correctly (reading the raw oklch
  // token directly proved unreliable).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [mutedFg, setMutedFg] = useState("");
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    setMutedFg(getComputedStyle(el).color);
  }, [resolvedTheme]);
```

Replace it with:

```ts
  // Off-screen sentinel wearing the muted-foreground Tailwind class; we read its
  // computed text color. That yields a resolved rgb() value that Konva/canvas
  // always accepts and that tracks light/dark correctly (reading the raw oklch
  // token directly proved unreliable). Its child span wears text-primary so we
  // can read a resolved accent color from the SAME sentinel (no second sentinel).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [mutedFg, setMutedFg] = useState("");
  const [accentFg, setAccentFg] = useState("");
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    setMutedFg(getComputedStyle(el).color);
    const span = el.firstElementChild as HTMLElement | null;
    if (span) setAccentFg(getComputedStyle(span).color);
  }, [resolvedTheme]);
```

- [ ] **Step 2: Add the `text-primary` child span to the sentinel JSX**

Find the sentinel at the end of the component's returned JSX:

```tsx
      {/* Sentinel: wears the muted-foreground class so we can read the resolved theme color. */}
      <div
        ref={sentinelRef}
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute h-0 w-0 opacity-0"
      />
```

Replace the self-closing `/>` with a child span, and update the comment:

```tsx
      {/* Sentinel: wears muted-foreground so we can read the resolved theme color;
          its child span wears text-primary so we read a resolved accent color too. */}
      <div
        ref={sentinelRef}
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute h-0 w-0 opacity-0"
      >
        <span className="text-primary" />
      </div>
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: build succeeds (no TS errors). `accentFg` is declared but not yet read — that will NOT error because it IS read inside the effect (setAccentFg). If the linter flags unused state, it won't: it's used via the setter. Build should pass clean.

- [ ] **Step 4: Commit**

```bash
git add src/generators/swap-collage/SwapCollagePreview.tsx
git commit -m "feat(swap-collage): read accent color from shared sentinel span"
```

---

### Task 2: Track the hovered tile during a drag

**Files:**
- Modify: `src/generators/swap-collage/SwapCollagePreview.tsx`

Add `hoveredSlot` state and a shared `clientToSlot` helper; rewrite the drop handler to use it and clear the highlight; add `onDragOver`/`onDragLeave` wiring on the container. Still no visual change (Task 3 draws it).

- [ ] **Step 1: Add the `hoveredSlot` state and import nothing new**

`useState` is already imported. Add this state declaration right before `const openPicker`:

Find:
```ts
  const openPicker = (slot: Slot) => fileRefs[slot].current?.click();
```

Insert before it:
```ts
  // The tile under the cursor during a file drag, or null. Purely view state —
  // not in swapReducer — driving the drop-target highlight.
  const [hoveredSlot, setHoveredSlot] = useState<Slot | null>(null);

  const openPicker = (slot: Slot) => fileRefs[slot].current?.click();
```

- [ ] **Step 2: Extract `clientToSlot` and rewrite `onDropFile`**

Find the existing drop logic:

```ts
  // Drag a file onto the canvas → load it into whichever tile is under the
  // cursor. The stage canvas is centered in the container, so map the drop
  // point against the canvas's own bounding rect; pointToSlot owns which half
  // is which (mirroring the A/B assignment in tileLayout).
  const onDropFile = (e: DragEvent<HTMLDivElement>) => {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.preventDefault();
    const rect = stageRef.current?.container().getBoundingClientRect();
    if (!rect) return;
    loadImage(
      pointToSlot(
        state.orientation,
        e.clientX - rect.left,
        e.clientY - rect.top,
        rect.width,
        rect.height,
      ),
      file,
    );
  };
```

Replace the whole block with:

```ts
  // Map a drag/drop cursor position to the tile (A/B) it's over. The stage
  // canvas is centered in the container, so we map against the canvas's own
  // bounding rect; pointToSlot owns which half is which (mirroring the A/B
  // assignment in tileLayout). Shared by the highlight (onDragOver) and the
  // drop (onDrop) so they can't drift apart.
  const clientToSlot = (clientX: number, clientY: number): Slot | null => {
    const rect = stageRef.current?.container().getBoundingClientRect();
    if (!rect) return null;
    return pointToSlot(
      state.orientation,
      clientX - rect.left,
      clientY - rect.top,
      rect.width,
      rect.height,
    );
  };

  // Track which tile the cursor is over during a drag, for the highlight.
  // preventDefault so the browser allows the drop; only update state when the
  // slot actually changes to avoid re-render churn on every mousemove.
  const onDragOverFile = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const slot = clientToSlot(e.clientX, e.clientY);
    setHoveredSlot((prev) => (prev === slot ? prev : slot));
  };

  // Drop → load the file into the tile under the cursor (if any), then clear
  // the highlight. NOTE: onDragLeave clears unconditionally, which can flicker
  // when crossing internal element boundaries — accepted per the spec; a
  // drag-counter is the documented fallback if it proves noticeable.
  const onDropFile = (e: DragEvent<HTMLDivElement>) => {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.preventDefault();
    const slot = clientToSlot(e.clientX, e.clientY);
    if (slot) loadImage(slot, file);
    setHoveredSlot(null);
  };
```

`DragEvent` is already imported (line 7 area: `type DragEvent`). Verify it remains in the React import list — it is.

- [ ] **Step 3: Wire the handlers onto the container `<div>`**

Find:

```tsx
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropFile}
    >
```

Replace with:

```tsx
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center"
      onDragOver={onDragOverFile}
      onDragLeave={() => setHoveredSlot(null)}
      onDrop={onDropFile}
    >
```

- [ ] **Step 4: Type-check and run existing tests**

Run: `npm run build`
Expected: build succeeds.

Run: `npm test`
Expected: all existing tests pass (no test logic changed; this guards against accidental regressions in imports).

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/SwapCollagePreview.tsx
git commit -m "feat(swap-collage): track hovered tile during file drag"
```

---

### Task 3: Draw the highlight

**Files:**
- Modify: `src/generators/swap-collage/SwapCollagePreview.tsx`

Two visual pieces: (a) a per-slot accent `<Rect>` on the unclipped top Layer, visible for the hovered slot; (b) the empty placeholder's text turns accent when its tile is hovered.

- [ ] **Step 1: Add `accentFg` + `highlighted` props to `Placeholder`, and switch text color**

Find the `Placeholder` component:

```tsx
function Placeholder({
  tileW,
  tileH,
  fontSize,
  mutedFg,
  onActivate,
}: {
  tileW: number;
  tileH: number;
  fontSize: number;
  mutedFg: string;
  onActivate: () => void;
}) {
  const strip = placeholderTextStrip(tileH);
  return (
    <Group onMouseDown={onActivate} onTap={onActivate}>
      <Rect x={0} y={0} width={tileW} height={tileH} stroke={mutedFg} strokeWidth={1} />
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
    </Group>
  );
}
```

Replace the whole component with:

```tsx
function Placeholder({
  tileW,
  tileH,
  fontSize,
  mutedFg,
  accentFg,
  highlighted,
  onActivate,
}: {
  tileW: number;
  tileH: number;
  fontSize: number;
  mutedFg: string;
  accentFg: string;
  highlighted: boolean;
  onActivate: () => void;
}) {
  const strip = placeholderTextStrip(tileH);
  // When this tile is the drop target, the placeholder text turns accent so the
  // user sees the effect on the text as well as the border (which is drawn on
  // the unclipped top Layer, not here).
  const textColor = highlighted && accentFg ? accentFg : mutedFg;
  return (
    <Group onMouseDown={onActivate} onTap={onActivate}>
      <Rect x={0} y={0} width={tileW} height={tileH} stroke={mutedFg} strokeWidth={1} />
      <Text
        text="Drop or click to upload"
        width={tileW}
        y={strip.y}
        height={strip.height}
        align="center"
        verticalAlign="middle"
        fontSize={fontSize}
        fill={textColor}
        listening={false}
      />
    </Group>
  );
}
```

- [ ] **Step 2: Pass the new props from `renderTile`**

Find the `Placeholder` usage inside `renderTile`:

```tsx
          <Placeholder
            tileW={tiles.tileW}
            tileH={tiles.tileH}
            fontSize={PLACEHOLDER_FONT_PX / scale}
            mutedFg={mutedFg}
            onActivate={() => openPicker(slot)}
          />
```

Replace with:

```tsx
          <Placeholder
            tileW={tiles.tileW}
            tileH={tiles.tileH}
            fontSize={PLACEHOLDER_FONT_PX / scale}
            mutedFg={mutedFg}
            accentFg={accentFg}
            highlighted={hoveredSlot === slot}
            onActivate={() => openPicker(slot)}
          />
```

- [ ] **Step 3: Draw the highlight `<Rect>` on the unclipped top Layer**

Find the top Layer (mask handles):

```tsx
        {/* Mask drag handles. Top layer, unclipped, canvas coords. */}
        <Layer>
          {SLOTS.map((slot) => (
            <MaskOverlay
              key={slot}
              origin={tiles[slot]}
              maskPx={maskPx}
              onHandleDrag={(node) => onMaskTransform(slot, node)}
            />
          ))}
        </Layer>
```

Replace with (adds a per-slot highlight Rect BEFORE the mask handles, so handles still sit above it):

```tsx
        {/* Drop-target highlight + mask drag handles. Top layer, unclipped, canvas
            coords. The highlight lives here (not in the clipped tile Group) so the
            3px border isn't half-clipped at the tile edge. strokeWidth is divided
            by `scale` so it renders a consistent ~3 CSS px regardless of stage zoom. */}
        <Layer>
          {SLOTS.map((slot) => {
            const origin = tiles[slot];
            return (
              <Rect
                key={`drop-${slot}`}
                x={origin.x}
                y={origin.y}
                width={tiles.tileW}
                height={tiles.tileH}
                stroke={accentFg}
                strokeWidth={3 / scale}
                visible={hoveredSlot === slot}
                listening={false}
              />
            );
          })}
          {SLOTS.map((slot) => (
            <MaskOverlay
              key={slot}
              origin={tiles[slot]}
              maskPx={maskPx}
              onHandleDrag={(node) => onMaskTransform(slot, node)}
            />
          ))}
        </Layer>
```

`Rect` is already imported from `react-konva` (line 9).

- [ ] **Step 4: Type-check and run tests**

Run: `npm run build`
Expected: build succeeds.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/SwapCollagePreview.tsx
git commit -m "feat(swap-collage): highlight hovered tile + accent placeholder text on drag"
```

---

### Task 4: Manual verification

**Files:** none (visual check in the running app).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL in a browser.

- [ ] **Step 2: Verify empty-tile highlight (both slots empty)**

From your OS file manager, drag an image file (don't release) over:
- The left/top tile → that tile shows an accent border and its "Drop or click to upload" text turns accent.
- The right/bottom tile → highlight moves to that tile.
- Release over a tile → image loads into it.

- [ ] **Step 3: Verify filled-tile highlight (one or both slots filled)**

Repeat the drag over a filled tile → the accent border appears over the image.
Release → the slot's source is replaced (drop still works).

- [ ] **Step 4: Verify leave + gutter**

- Drag out of the canvas entirely → no tile highlighted.
- Hover the cursor in the gutter between tiles (if any) → behavior is acceptable (pointToSlot always assigns A or B, so one tile stays highlighted; this is expected — there's no "no tile" zone inside the canvas bounds).

- [ ] **Step 5: Verify both orientations and both themes**

- Toggle Layout → Orientation between Left/Right and Top/Bottom; repeat the drag checks.
- Toggle light/dark theme; confirm the accent color is correct (resolved, not raw oklch) in both.

- [ ] **Step 6: Check flicker**

During a slow drag across the tile boundary and across internal canvas edges, watch for highlight flicker. If it's noticeable/annoying, note it — the fallback is the drag-counter described in the spec (a separate follow-up task).

- [ ] **Step 7: Stop the dev server**

Stop the running `npm run dev` (Ctrl+C).

---

## Self-review notes

- **Spec coverage:** Accent color from shared sentinel → Task 1. `hoveredSlot` state + `clientToSlot` + dragover/drop/leave wiring → Task 2. Filled-tile accent border + empty-tile text/outline accent → Task 3 (border on top Layer, text in Placeholder). Accepted flicker tradeoff documented in Task 2 Step 2 comment and Task 4 Step 6. All spec sections covered.
- **Type consistency:** `accentFg: string`, `highlighted: boolean` prop names match between Placeholder definition (Task 3 Step 1) and usage (Task 3 Step 2). `hoveredSlot: Slot | null` used consistently. `onDragOverFile`/`onDropFile` handler names match the JSX wiring (Task 2 Step 3). `clientToSlot` returns `Slot | null`, consumed with a null guard in `onDropFile`.
- **No placeholders:** every code step shows full before/after blocks; no "TODO"/"handle edge cases".

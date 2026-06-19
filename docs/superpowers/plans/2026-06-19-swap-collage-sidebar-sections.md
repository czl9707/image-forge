# Swap-collage sidebar: accordion sections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the swap-collage right sidebar into four multiple-open accordion sections (Image A, Image B, Layout, Export) with a sticky Export button, and remove the dead Reset mask control.

**Architecture:** This is a layout refactor — no behavioral logic changes. A new shadcn `accordion.tsx` primitive (Radix, from the `radix-ui` umbrella package, matching `slider.tsx` conventions) wraps the existing control sub-components (`SlotRow`, `ZoomControls`, `MaskSizeControls`), which are reused unchanged. The orphaned `RESET_MASK` reducer action, its test, and the Reset mask button are deleted as dead code.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (`@theme` in `src/index.css`), shadcn/ui, `radix-ui` umbrella package, lucide-react, vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-swap-collage-sidebar-sections-design.md`

---

### Task 1: Add the Accordion primitive (via shadcn CLI)

**Files:**
- Created by CLI: `src/components/ui/accordion.tsx`
- Modified by CLI: `src/index.css` (the CLI adds the `--animate-accordion-*` keys + `@keyframes` to the `@theme` block automatically)

> **Rule:** Always install UI components via the shadcn CLI (`npx shadcn@latest add <name>`), never hand-write `src/components/ui/*`. The CLI keeps components and their CSS theme tokens (keyframes, etc.) consistent with `components.json` (style `new-york`, css `src/index.css`).

- [ ] **Step 1: Install accordion via the shadcn CLI**

Run: `npx shadcn@latest add accordion`
Expected: The CLI writes `src/components/ui/accordion.tsx` and adds the accordion animation tokens/keyframes to `src/index.css`. The project already has the `radix-ui` umbrella dependency, so no new packages should be required — if the CLI asks to install anything, accept it.

- [ ] **Step 2: Confirm the file and exports exist**

Verify `src/components/ui/accordion.tsx` exists and exports `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent` (the CLI-generated file uses the `radix-ui` umbrella import and `data-slot` attributes, matching `slider.tsx`).

Run: `grep -n "export {" src/components/ui/accordion.tsx`
Expected: a line like `export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (only the pre-existing `baseUrl` deprecation warning, if any). No errors referencing `accordion`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/accordion.tsx src/index.css
git commit -m "feat(ui): add shadcn Accordion primitive"
```

---

### Task 2: Remove the dead RESET_MASK action

**Files:**
- Modify: `src/generators/swap-collage/swapReducer.ts:41-49` (action union) and `swapReducer.ts:51-82` (reducer switch)
- Modify: `src/generators/swap-collage/__tests__/swapReducer.test.ts:78-85` (delete the test)

- [ ] **Step 1: Delete the `RESET_MASK` case from the reducer**

In `src/generators/swap-collage/swapReducer.ts`, remove these two lines:

```ts
  case "RESET_MASK":
      return { ...state, mask: DEFAULT_MASK };
```

(Leave `RESET_XFORM` and all other cases intact.)

- [ ] **Step 2: Remove `RESET_MASK` from the action union**

In the same file, delete this one line from the `SwapAction` union:

```ts
  | { type: "RESET_MASK" }
```

- [ ] **Step 3: Delete the "resets the mask" test**

In `src/generators/swap-collage/__tests__/swapReducer.test.ts`, remove this whole `it` block (currently lines 78–85):

```ts
  it("resets the mask", () => {
    const moved = swapReducer(initialSwapState, {
      type: "SET_MASK",
      mask: { x: 0, y: 0, w: 0.2, h: 0.2 },
    } as SwapAction);
    const s = swapReducer(moved, { type: "RESET_MASK" } as SwapAction);
    expect(s.mask).toEqual(DEFAULT_MASK);
  });
```

- [ ] **Step 4: Typecheck and run tests**

Run: `npx tsc --noEmit`
Expected: PASS (no `RESET_MASK` references remain).

Run: `npm run test`
Expected: All test files pass. The swapReducer suite now has one fewer test (7 tests instead of 8 in that file) and none reference `RESET_MASK`.

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/swapReducer.ts src/generators/swap-collage/__tests__/swapReducer.test.ts
git commit -m "refactor(swap-collage): remove dead RESET_MASK action"
```

---

### Task 3: Restructure the controls sidebar into accordion sections

**Files:**
- Modify: `src/generators/swap-collage/SwapCollageControls.tsx` (imports + the `SwapCollageControls` return JSX, lines 1–12 and 161–300)

- [ ] **Step 1: Update imports**

In `src/generators/swap-collage/SwapCollageControls.tsx`:

Remove `RotateCcw` from the lucide-react import (it is only used by the Reset mask button). The import becomes:

```tsx
import {
  Columns2,
  Download,
  RectangleHorizontal,
  RectangleVertical,
  Rows2,
  Square,
  Trash2,
} from "lucide-react";
```

Add the accordion import alongside the other `@/components/ui/*` imports (after the `Slider` import line):

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
```

- [ ] **Step 2: Replace the component return JSX**

Replace the entire `return ( ... )` block of the `SwapCollageControls` function (currently lines 161–299) with this:

```tsx
  return (
    <div className="flex h-full w-full flex-col p-4">
      <Accordion
        type="multiple"
        defaultValue={["image-a", "image-b", "layout", "export"]}
        className="flex-1 overflow-auto"
      >
        <AccordionItem value="image-a">
          <AccordionTrigger>Image A</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <SlotRow
              label="Image A"
              status={imgA.status}
              error={imgA.error}
              onReplace={() => fileA.current?.click()}
              onClear={() => clearImage("A")}
            />
            <input ref={fileA} type="file" accept="image/*" hidden onChange={onPick("A")} />
            <ZoomControls
              slot="A"
              zoom={state.xformA.zoom}
              disabled={imgA.status !== "ready"}
              onChange={(z) =>
                dispatch({
                  type: "SET_XFORM",
                  slot: "A",
                  xform: { ...state.xformA, zoom: z },
                })
              }
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="image-b">
          <AccordionTrigger>Image B</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <SlotRow
              label="Image B"
              status={imgB.status}
              error={imgB.error}
              onReplace={() => fileB.current?.click()}
              onClear={() => clearImage("B")}
            />
            <input ref={fileB} type="file" accept="image/*" hidden onChange={onPick("B")} />
            <ZoomControls
              slot="B"
              zoom={state.xformB.zoom}
              disabled={imgB.status !== "ready"}
              onChange={(z) =>
                dispatch({
                  type: "SET_XFORM",
                  slot: "B",
                  xform: { ...state.xformB, zoom: z },
                })
              }
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="layout">
          <AccordionTrigger>Layout</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <MaskSizeControls
              width={state.mask.w}
              height={state.mask.h}
              onWidth={(w) => dispatch({ type: "SET_MASK", mask: { ...state.mask, w } })}
              onHeight={(h) => dispatch({ type: "SET_MASK", mask: { ...state.mask, h } })}
            />
            <div className="flex flex-col gap-2">
              <Label>Orientation</Label>
              <Tabs
                value={state.orientation}
                onValueChange={(v) =>
                  dispatch({
                    type: "SET_ORIENTATION",
                    orientation: v as Orientation,
                  })
                }
              >
                <TabsList>
                  <TabsTrigger value="lr">
                    <Columns2 /> Left/Right
                  </TabsTrigger>
                  <TabsTrigger value="tb">
                    <Rows2 /> Top/Bottom
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Aspect</Label>
              <Tabs
                value={state.aspect}
                onValueChange={(v) =>
                  dispatch({ type: "SET_ASPECT", aspect: v as AspectId })
                }
              >
                <TabsList>
                  <TabsTrigger value="square">
                    <Square /> Square
                  </TabsTrigger>
                  <TabsTrigger value="landscape">
                    <RectangleHorizontal /> 16:9
                  </TabsTrigger>
                  <TabsTrigger value="portrait">
                    <RectangleVertical /> 9:16
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="export">
          <AccordionTrigger>Export</AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label>Export size</Label>
              <Select
                value={String(state.exportSize)}
                onValueChange={(v) =>
                  dispatch({ type: "SET_EXPORT_SIZE", size: Number(v) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1080">1080px</SelectItem>
                  <SelectItem value="2160">2160px</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Format</Label>
              <Tabs value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                <TabsList>
                  <TabsTrigger value="png">PNG</TabsTrigger>
                  <TabsTrigger value="jpg">JPG</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="pt-4">
        <Button onClick={onExport} disabled={!bothReady} className="w-full">
          <Download /> Export
        </Button>
      </div>
    </div>
  );
```

Notes for the implementer: the sub-components (`SlotRow`, `ZoomControls`, `MaskSizeControls`) and all `dispatch`/prop logic are unchanged — only the wrapping markup changes. The Reset mask button (`<Button ... onClick={() => dispatch({ type: "RESET_MASK" })}>`) is deliberately removed. The root `<div>` no longer has `overflow-auto`/`gap-6` (the `<Accordion>` scrolls instead, and the Export button is pinned below it).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. No unused-import errors (`RotateCcw` is gone, `RESET_MASK` is gone from the previous task).

- [ ] **Step 4: Commit**

```bash
git add src/generators/swap-collage/SwapCollageControls.tsx
git commit -m "feat(swap-collage): group sidebar controls into accordion sections"
```

---

### Task 4: Verify end to end

**Files:** none modified — verification only.

- [ ] **Step 1: Full typecheck and test run**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run test`
Expected: All test files pass (the swapReducer file has 7 tests now; total suite was 41 passing before Task 2, so 40 passing after).

- [ ] **Step 2: Manual verification in the browser**

Start the dev server (`npm run dev`) and open the swap-collage view. Confirm:

1. Four accordion sections appear: **Image A**, **Image B**, **Layout**, **Export**, all expanded by default.
2. Clicking a section header collapses/expands it independently — collapsing one does NOT close the others; all four can be open at once.
3. The **Export** button sits below the accordions and remains visible/reachable while sections are collapsed.
4. Inside each section the controls still work: Replace/Clear and the zoom sliders for A and B, Orientation/Aspect/Swap size in Layout, Export size/Format in Export.
5. Collapsing then re-expanding a section leaves its controls functional.
6. With both images loaded, Export still produces a download.
7. There is no "Reset mask" button anywhere.

- [ ] **Step 3: Final commit if any small fixes were made during manual verification**

Only commit if Step 2 surfaced a needed tweak; otherwise this task needs no commit.

---

## Self-review notes

- **Spec coverage:** Every spec requirement maps to a task — accordion structure (Task 3), multiple-open behavior (`type="multiple"`, Task 3 Step 2), all-open-by-default (`defaultValue`, Task 3 Step 2), sticky Export button outside accordions (Task 3 Step 2), removal of Reset mask button + dead `RESET_MASK` action (Tasks 2 & 3), new accordion primitive (Task 1).
- **Type consistency:** `Accordion`/`AccordionItem`/`AccordionTrigger`/`AccordionContent` are exported in Task 1 and imported in Task 3 with identical names. `AccordionContent`'s `className` prop flows to its inner wrapper div, so `space-y-4` applies spacing to section children.
- **Dead code:** `RotateCcw` import removal (Task 3 Step 1) pairs with the button removal (Task 3 Step 2); `RESET_MASK` union member + case (Task 2 Steps 1–2) pair with the test deletion (Task 2 Step 3) and the button removal (Task 3 Step 2). No orphaned references remain.

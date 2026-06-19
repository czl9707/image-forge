# Swap-collage sidebar: accordion sections

**Date:** 2026-06-19
**Scope:** `src/generators/swap-collage/SwapCollageControls.tsx` (layout refactor) + new `src/components/ui/accordion.tsx`. No logic changes.

## Problem

The swap-collage right sidebar renders ~10 controls as a flat vertical list. As more per-image controls arrive (filters next), the flat list becomes hard to scan and the controls that matter at a given moment get buried.

## Design

Group the existing controls into four collapsible accordion sections, plus a sticky export action.

### Structure

| Section | Contents |
|---|---|
| **Image A** | Replace / Clear + zoom slider |
| **Image B** | Replace / Clear + zoom slider |
| **Layout** | Orientation, Aspect, Swap size |
| **Export** | Export size, Format |
| *(outside accordions)* | **Export** button, sticky at the bottom |

Image A and Image B are kept as **separate** accordions (not merged) because each image will accrue its own filter controls, which would crowd a single combined section.

### Behavior

- **Multiple-open accordion** (shadcn `Accordion type="multiple"`): each section toggles independently; opening one does not close the others. A tool you return to repeatedly shouldn't force re-expansion.
- **All sections open by default.** Collapse is for reducing noise once focused, not the resting state.
- **Export button** stays outside the accordions, pinned at the bottom of the sidebar so it is always reachable without scrolling or expanding.
- **Reset mask button is removed** — it's no longer needed. The now-orphaned `RESET_MASK` reducer action and any test covering it become dead code and should be cleaned up as part of this work.

### Component

- Add `src/components/ui/accordion.tsx` — shadcn's Radix Accordion primitive, importing `{ Accordion as AccordionPrimitive }` from the `radix-ui` umbrella package (matching the existing convention in `slider.tsx` / `tabs.tsx`). Uses the existing `ChevronDown` lucide icon. `type="multiple"` for independent toggles.
- Restructure `SwapCollageControls.tsx`: wrap the existing control groups (`SlotRow` + `ZoomControls`, `MaskSizeControls`, the Orientation/Aspect Tabs, the Export size Select, the Format Tabs) inside `<Accordion.Item>` blocks. The sub-components (`SlotRow`, `ZoomControls`, `MaskSizeControls`) are reused unchanged.

### What does not change

- Every remaining `dispatch` call, every prop, the clamp/zoom/cover behavior — untouched.
- `SwapCollagePreview.tsx`, `dimensions.ts`, `fit.ts` — untouched. `swapReducer.ts` loses only the dead `RESET_MASK` action (and its test).
- `SidebarRight` shell and width — unchanged.

## Testing

Pure layout refactor with no new logic, so no new unit tests. Verify:

1. `npx tsc --noEmit` is clean.
2. Existing test suite still green (`npm run test`).
3. Manual click-through: each section opens/closes independently; all three can be open at once; Export button remains visible/reachable while sections are collapsed; controls inside a collapsed-then-reopened section still work; Export still functions.

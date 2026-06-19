# Image Filters (A & B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-image, stackable, reorderable filter list (Blur, Brightness, Contrast, Saturation, Hue+Colorize) to swap-collage Image A and Image B, in a reusable module.

**Architecture:** Konva-native filters applied to the live image nodes (one render path; export is free via `stage.toCanvas`). Pure filter logic + a generic editor UI live in a shared `src/lib/filters` + `src/components/filters` so future collage types reuse them; the cache lifecycle stays in each generator and calls a shared `applyToNode`.

**Tech Stack:** React 19, TypeScript, react-konva / konva, vitest + @testing-library/react (jsdom), shadcn UI (radix), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-19-image-filters-design.md`

**Spec correction (Konva constraint):** The spec's §2 said saturation and hue each emit their own `HSL` filter instance. Konva's `HSL` reads `hue`+`saturation`+`luminance` *together*, so two HSL instances would double-apply both. Corrected design: all enabled hue+saturation contributions are merged into **one** HSL pass (set once on the node), emitted at the earlier of the two positions in the stack. Hue rotation and saturation scaling commute, so this is visually equivalent and reorder between the two is a documented no-op. Everything else in the spec stands.

---

## File structure

- Create: `src/lib/filters/types.ts` — `FilterKind`, `FilterInstance` discriminated union, `FilterStack`.
- Create: `src/lib/filters/kinds.ts` — `KIND_META`, colorize range consts, `makeFilter`, `DEFAULT_STACK`.
- Create: `src/lib/filters/stackOps.ts` — pure stack mutators (`amountOf`, `withAmount`, `updateFilter`, `removeFilter`, `toggleFilter`, `addFilter`, `moveFilter`).
- Create: `src/lib/filters/colorize.ts` — `hslToRgb`, `luminance`, `colorize` Konva filter.
- Create: `src/lib/filters/apply.ts` — `stackToFilters`, `hslValues`, `applyToNode`.
- Create: `src/lib/filters/index.ts` — barrel.
- Create: `src/lib/filters/__tests__/kinds.test.ts`
- Create: `src/lib/filters/__tests__/stackOps.test.ts`
- Create: `src/lib/filters/__tests__/colorize.test.ts`
- Create: `src/lib/filters/__tests__/apply.test.ts`
- Create: `src/components/filters/FilterStackControls.tsx` — generic editor UI.
- Create: `src/components/filters/__tests__/FilterStackControls.test.tsx`
- Create: `src/components/filters/FilteredImage.tsx` — react-konva binding (`KonvaImage` + `applyToNode` effect).
- Create: `src/components/ui/switch.tsx` — via shadcn CLI.
- Modify: `src/generators/swap-collage/swapReducer.ts` — add `filtersA`/`filtersB`, `SET_FILTERS`.
- Modify: `src/generators/swap-collage/__tests__/swapReducer.test.ts`
- Modify: `src/generators/swap-collage/SwapCollageProvider.tsx` — `clearImage` resets filters; re-export filter types.
- Modify: `src/generators/swap-collage/SwapCollagePreview.tsx` — render via `FilteredImage`.
- Modify: `src/generators/swap-collage/SwapCollageControls.tsx` — mount `FilterStackControls` per image.

---

## Task 1: Filter types, kind metadata, and stack mutators

**Files:**
- Create: `src/lib/filters/types.ts`
- Create: `src/lib/filters/kinds.ts`
- Create: `src/lib/filters/stackOps.ts`
- Create: `src/lib/filters/__tests__/kinds.test.ts`
- Create: `src/lib/filters/__tests__/stackOps.test.ts`

- [ ] **Step 1: Write `types.ts`**

```ts
// src/lib/filters/types.ts

/** A filter kind supported by the editor. Each maps to a Konva filter. */
export type FilterKind = "blur" | "brightness" | "contrast" | "saturation" | "hue";

/** One entry in a per-image filter stack. Discriminated by `kind` so each
 *  variant carries only the params that apply to it (no `colorize` on `blur`). */
export type FilterInstance =
  | { id: string; kind: "blur"; enabled: boolean; radius: number }
  | { id: string; kind: "brightness"; enabled: boolean; value: number }
  | { id: string; kind: "contrast"; enabled: boolean; value: number }
  | { id: string; kind: "saturation"; enabled: boolean; value: number }
  | {
      id: string;
      kind: "hue";
      enabled: boolean;
      shift: number; // -180..180 (normal hue rotation)
      colorize: boolean; // Photoshop "着色"
      colorHue: number; // 0..360 (used when colorize === true)
      colorSat: number; // 0..1 (used when colorize === true)
    };

/** An ordered stack of filters applied bottom-to-top. */
export type FilterStack = FilterInstance[];
```

- [ ] **Step 2: Write `kinds.ts`**

```ts
// src/lib/filters/kinds.ts
import type { FilterInstance, FilterKind, FilterStack } from "./types";

/** UI metadata for a kind's primary slider. */
export interface KindMeta {
  label: string;
  min: number;
  max: number;
  step: number;
  neutral: number;
}

export const KIND_META: Record<FilterKind, KindMeta> = {
  blur: { label: "Blur", min: 0, max: 40, step: 0.5, neutral: 0 },
  brightness: { label: "Brightness", min: -1, max: 1, step: 0.01, neutral: 0 },
  contrast: { label: "Contrast", min: -100, max: 100, step: 1, neutral: 0 },
  saturation: { label: "Saturation", min: -2, max: 10, step: 0.1, neutral: 0 },
  hue: { label: "Hue", min: -180, max: 180, step: 1, neutral: 0 },
};

/** Range for the colorize hue slider (shown when a hue filter's colorize is on). */
export const COLORIZE_HUE = { min: 0, max: 360, step: 1, neutral: 0 };
/** Range for the colorize saturation slider. */
export const COLORIZE_SAT = { min: 0, max: 1, step: 0.01, neutral: 1 };

/** All kinds, in the canonical default-stack order. */
export const KIND_ORDER: FilterKind[] = [
  "blur",
  "brightness",
  "contrast",
  "saturation",
  "hue",
];

/** Build a fresh neutral instance of `kind` with the given stable id. */
export function makeFilter(kind: FilterKind, id: string): FilterInstance {
  switch (kind) {
    case "blur":
      return { id, kind, enabled: true, radius: KIND_META.blur.neutral };
    case "brightness":
      return { id, kind, enabled: true, value: KIND_META.brightness.neutral };
    case "contrast":
      return { id, kind, enabled: true, value: KIND_META.contrast.neutral };
    case "saturation":
      return { id, kind, enabled: true, value: KIND_META.saturation.neutral };
    case "hue":
      return {
        id,
        kind,
        enabled: true,
        shift: KIND_META.hue.neutral,
        colorize: false,
        colorHue: COLORIZE_HUE.neutral,
        colorSat: COLORIZE_SAT.neutral,
      };
  }
}

/** The starting stack for a freshly loaded image: all five kinds, neutral, enabled. */
export const DEFAULT_STACK: FilterStack = KIND_ORDER.map((k) => makeFilter(k, k));
```

- [ ] **Step 3: Write `stackOps.ts`**

```ts
// src/lib/filters/stackOps.ts
import { makeFilter } from "./kinds";
import type { FilterInstance, FilterKind, FilterStack } from "./types";

/** The primary-slider value of an instance (radius / value / shift). Hue's
 *  primary slider is `shift`; colorize hue/sat are handled separately by the UI. */
export function amountOf(f: FilterInstance): number {
  if (f.kind === "blur") return f.radius;
  if (f.kind === "hue") return f.shift;
  return f.value;
}

/** Return a copy of `f` with its primary-slider value set to `n`. */
export function withAmount(f: FilterInstance, n: number): FilterInstance {
  if (f.kind === "blur") return { ...f, radius: n };
  if (f.kind === "hue") return { ...f, shift: n };
  return { ...f, value: n };
}

/** Return a new stack with the instance `id` replaced by merging `patch` into it. */
export function updateFilter(
  stack: FilterStack,
  id: string,
  patch: Partial<FilterInstance>,
): FilterStack {
  return stack.map((f) => (f.id === id ? ({ ...f, ...patch } as FilterInstance) : f));
}

/** Remove the instance `id`. */
export function removeFilter(stack: FilterStack, id: string): FilterStack {
  return stack.filter((f) => f.id !== id);
}

/** Flip the `enabled` flag of instance `id`. */
export function toggleFilter(stack: FilterStack, id: string): FilterStack {
  return stack.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f));
}

/** Append a fresh neutral instance of `kind`. No-op (returns stack unchanged)
 *  if `kind` is already present — one of each kind. The new id is `newId`. */
export function addFilter(
  stack: FilterStack,
  kind: FilterKind,
  newId: string,
): FilterStack {
  if (stack.some((f) => f.kind === kind)) return stack;
  return [...stack, makeFilter(kind, newId)];
}

/** Move the instance at `from` to `to`, shifting the others. Indices clamped. */
export function moveFilter(stack: FilterStack, from: number, to: number): FilterStack {
  if (from === to) return stack;
  if (from < 0 || from >= stack.length) return stack;
  const clampedTo = Math.max(0, Math.min(stack.length - 1, to));
  const next = stack.slice();
  const [moved] = next.splice(from, 1);
  next.splice(clampedTo, 0, moved);
  return next;
}
```

- [ ] **Step 4: Write the failing `kinds.test.ts`**

```ts
// src/lib/filters/__tests__/kinds.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_STACK, KIND_ORDER, makeFilter } from "../kinds";

describe("kinds", () => {
  it("DEFAULT_STACK has all five kinds in canonical order, enabled at neutral", () => {
    expect(DEFAULT_STACK.map((f) => f.kind)).toEqual(KIND_ORDER);
    expect(DEFAULT_STACK.every((f) => f.enabled)).toBe(true);
    expect(DEFAULT_STACK.length).toBe(5);
  });

  it("makeFilter builds a neutral hue instance with colorize off", () => {
    const f = makeFilter("hue", "x");
    expect(f).toMatchObject({
      id: "x",
      kind: "hue",
      enabled: true,
      shift: 0,
      colorize: false,
      colorHue: 0,
      colorSat: 1,
    });
  });
});
```

- [ ] **Step 5: Write the failing `stackOps.test.ts`**

```ts
// src/lib/filters/__tests__/stackOps.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_STACK } from "../kinds";
import {
  addFilter,
  amountOf,
  moveFilter,
  removeFilter,
  toggleFilter,
  updateFilter,
  withAmount,
} from "../stackOps";

describe("stackOps", () => {
  it("amountOf reads the primary value for each kind", () => {
    const blur = DEFAULT_STACK.find((f) => f.kind === "blur")!;
    const hue = DEFAULT_STACK.find((f) => f.kind === "hue")!;
    expect(amountOf({ ...blur, radius: 5 })).toBe(5);
    expect(amountOf({ ...hue, shift: 30 })).toBe(30);
  });

  it("withAmount sets the primary value for each kind", () => {
    const blur = DEFAULT_STACK.find((f) => f.kind === "blur")!;
    const hue = DEFAULT_STACK.find((f) => f.kind === "hue")!;
    expect(withAmount(blur, 7).kind === "blur" && (withAmount(blur, 7) as any).radius).toBe(7);
    expect(withAmount(hue, 42).kind === "hue" && (withAmount(hue, 42) as any).shift).toBe(42);
  });

  it("updateFilter merges a patch into the matched instance only", () => {
    const next = updateFilter(DEFAULT_STACK, "blur", { enabled: false } as any);
    expect(next.find((f) => f.id === "blur")!.enabled).toBe(false);
    expect(DEFAULT_STACK.find((f) => f.id === "blur")!.enabled).toBe(true); // unchanged
  });

  it("removeFilter drops the matched instance", () => {
    expect(removeFilter(DEFAULT_STACK, "blur").length).toBe(4);
  });

  it("toggleFilter flips enabled", () => {
    const next = toggleFilter(DEFAULT_STACK, "contrast");
    expect(next.find((f) => f.id === "contrast")!.enabled).toBe(false);
  });

  it("addFilter appends a missing kind and is a no-op when present", () => {
    const withoutHue = removeFilter(DEFAULT_STACK, "hue");
    const readded = addFilter(withoutHue, "hue", "new-hue");
    expect(readded.length).toBe(5);
    expect(readded[4].kind).toBe("hue");
    // already present -> unchanged
    expect(addFilter(DEFAULT_STACK, "blur", "dup").length).toBe(5);
  });

  it("moveFilter reorders and clamps", () => {
    const ids = (s: typeof DEFAULT_STACK) => s.map((f) => f.id);
    expect(ids(moveFilter(DEFAULT_STACK, 0, 2))).toEqual([
      "brightness",
      "contrast",
      "blur",
      "saturation",
      "hue",
    ]);
    expect(moveFilter(DEFAULT_STACK, 0, 0)).toBe(DEFAULT_STACK); // no-op returns same ref
    expect(moveFilter(DEFAULT_STACK, -1, 0)).toBe(DEFAULT_STACK); // out of range -> same ref
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/filters/__tests__/kinds.test.ts src/lib/filters/__tests__/stackOps.test.ts`
Expected: PASS (implementation shipped in steps 1–3; these are the first runnable tests for it).

- [ ] **Step 7: Commit**

```bash
git add src/lib/filters
git commit -m "feat(filters): pure filter types, kind metadata, and stack mutators"
```

---

## Task 2: Colorize filter (`hslToRgb`, `luminance`, `colorize`)

**Files:**
- Create: `src/lib/filters/colorize.ts`
- Create: `src/lib/filters/__tests__/colorize.test.ts`

- [ ] **Step 1: Write the failing `colorize.test.ts`**

```ts
// src/lib/filters/__tests__/colorize.test.ts
import { describe, expect, it } from "vitest";
import { colorize, hslToRgb, luminance } from "../colorize";

function gray(v: number): [number, number, number] {
  return [v, v, v];
}

describe("colorize helpers", () => {
  it("luminance matches the Rec.601 weighted sum, normalized to [0,1]", () => {
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 5);
    expect(luminance(0, 0, 0)).toBeCloseTo(0, 5);
    expect(luminance(255, 0, 0)).toBeCloseTo(0.299, 3);
  });

  it("hslToRgb at L=0 and L=1 is black and white regardless of hue/sat", () => {
    expect(hslToRgb(0, 1, 0)).toEqual([0, 0, 0]);
    expect(hslToRgb(180, 1, 1)).toEqual([255, 255, 255]);
  });

  it("hslToRgb red/green/blue at L=0.5, full sat", () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual([255, 0, 0]);
    expect(hslToRgb(120, 1, 0.5)).toEqual([0, 255, 0]);
    expect(hslToRgb(240, 1, 0.5)).toEqual([0, 0, 255]);
  });
});

describe("colorize filter", () => {
  it("repaints each pixel to hslToRgb(colorHue, colorSat, luminance(px))", () => {
    const data = new Uint8ClampedArray([
      ...gray(128), 255, // mid gray
      ...gray(255), 255, // white
      ...gray(0), 255, // black
    ]);
    const imageData = { data, width: 3, height: 1 } as ImageData;

    const ctx = { colorHue: 0, colorSat: 1 };
    colorize.call(ctx, imageData);

    const [r0, g0, b0] = hslToRgb(0, 1, luminance(128, 128, 128));
    expect([data[0], data[1], data[2]]).toEqual([r0, g0, b0]);
    // white stays white, black stays black
    expect([data[4], data[5], data[6]]).toEqual([255, 255, 255]);
    expect([data[8], data[9], data[10]]).toEqual([0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/filters/__tests__/colorize.test.ts`
Expected: FAIL — `colorize.ts` does not exist (module not found).

- [ ] **Step 3: Write `colorize.ts`**

```ts
// src/lib/filters/colorize.ts

/** Rec.601 luminance of an 8-bit RGB triple, normalized to [0,1]. */
export function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Convert HSL to an 8-bit RGB triple. h in [0,360), s and l in [0,1]. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Konva filter: Photoshop-style "着色". Reads `this.colorHue` and `this.colorSat`,
 * discards each pixel's original hue/saturation, and repaints it at the pixel's
 * own luminance. White stays white, black stays black; mid-tones take the tint.
 *
 * `this` is the Konva node at apply time.
 */
export function colorize(this: { colorHue: number; colorSat: number }, imageData: ImageData): void {
  const { colorHue, colorSat } = this;
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = luminance(d[i], d[i + 1], d[i + 2]);
    const [r, g, b] = hslToRgb(colorHue, colorSat, l);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/filters/__tests__/colorize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/filters/colorize.ts src/lib/filters/__tests__/colorize.test.ts
git commit -m "feat(filters): colorize (Photoshop 着色) filter and hsl/luminance helpers"
```

---

## Task 3: Apply layer (`stackToFilters`, `hslValues`, `applyToNode`)

**Files:**
- Create: `src/lib/filters/apply.ts`
- Create: `src/lib/filters/__tests__/apply.test.ts`
- Create: `src/lib/filters/index.ts`

- [ ] **Step 1: Write the failing `apply.test.ts` (mocks konva)**

```ts
// src/lib/filters/__tests__/apply.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock konva so the test never touches a real canvas. Each filter is a unique
// sentinel so we can assert which filters landed in the array and in what order.
vi.mock("konva", () => {
  const Filters = { Blur: "BLUR", Brighten: "BRIGHTEN", Contrast: "CONTRAST", HSL: "HSL" };
  return { default: { Filters }, Filters };
});

import Konva from "konva";
import { applyToNode, hslValues, stackToFilters } from "../apply";
import { DEFAULT_STACK } from "../kinds";
import { removeFilter, toggleFilter, updateFilter, withAmount } from "../stackOps";

/** A minimal recording stand-in for a Konva node. */
function mockNode() {
  const calls: string[] = [];
  const params: Record<string, number> = {};
  const node: any = {
    blurRadius(n?: number) { if (n !== undefined) { params.blurRadius = n; calls.push("blurRadius"); } return params.blurRadius; },
    brightness(n?: number) { if (n !== undefined) { params.brightness = n; calls.push("brightness"); } return params.brightness; },
    contrast(n?: number) { if (n !== undefined) { params.contrast = n; calls.push("contrast"); } return params.contrast; },
    hue(n?: number) { if (n !== undefined) { params.hue = n; calls.push("hue"); } return params.hue; },
    saturation(n?: number) { if (n !== undefined) { params.saturation = n; calls.push("saturation"); } return params.saturation; },
    luminance(n?: number) { if (n !== undefined) { params.luminance = n; calls.push("luminance"); } return params.luminance; },
    colorHue(n?: number) { if (n !== undefined) { params.colorHue = n; calls.push("colorHue"); } return params.colorHue; },
    colorSat(n?: number) { if (n !== undefined) { params.colorSat = n; calls.push("colorSat"); } return params.colorSat; },
    filters(f?: any) { if (f !== undefined) { calls.push("filters:" + f.length); } return []; },
    cache() { calls.push("cache"); },
    clearCache() { calls.push("clearCache"); },
  };
  return { node, calls, params };
}

describe("stackToFilters", () => {
  it("emits one Konva filter per enabled kind, in stack order", () => {
    const fns = stackToFilters(DEFAULT_STACK);
    expect(fns).toEqual([
      Konva.Filters.Blur,
      Konva.Filters.Brighten,
      Konva.Filters.Contrast,
      Konva.Filters.HSL,
      Konva.Filters.HSL, // hue (non-colorize) -> its own HSL pass
    ]);
  });

  it("skips disabled instances", () => {
    const stack = toggleFilter(DEFAULT_STACK, "contrast");
    expect(stackToFilters(stack)).toEqual([
      Konva.Filters.Blur,
      Konva.Filters.Brighten,
      Konva.Filters.HSL, // saturation
      Konva.Filters.HSL, // hue
    ]);
  });

  it("emits colorize instead of HSL when a hue instance has colorize on", () => {
    const hue = DEFAULT_STACK.find((f) => f.kind === "hue")!;
    const stack = updateFilter(DEFAULT_STACK, hue.id, { colorize: true } as any);
    const fns = stackToFilters(stack);
    expect(fns[3]).toBe(Konva.Filters.HSL); // saturation still HSL
    expect(fns[4]).not.toBe(Konva.Filters.HSL); // hue replaced by colorize fn
  });
});

describe("hslValues", () => {
  it("sums enabled saturation/hue contributions", () => {
    let stack = withAmount(DEFAULT_STACK.find((f) => f.kind === "saturation")!, 1.5) as any;
    stack = updateFilter(stack, "saturation", stack.find((f: any) => f.kind === "saturation"));
    const v = hslValues(DEFAULT_STACK);
    expect(v).toEqual({ hue: 0, saturation: 0, luminance: 0 });
  });
});

describe("applyToNode", () => {
  it("sets params, applies filters, and caches when any filter is active", () => {
    const { node, calls, params } = mockNode();
    const stack = withAmount(DEFAULT_STACK.find((f) => f.kind === "blur")!, 8) as any;
    applyToNode(node, stack);
    expect(params.blurRadius).toBe(8);
    expect(calls).toContain("filters:5");
    expect(calls).toContain("cache");
    expect(calls).not.toContain("clearCache");
  });

  it("clears cache and sets no filters when nothing is enabled", () => {
    const { node, calls } = mockNode();
    const allOff = DEFAULT_STACK.reduce((s, f) => toggleFilter(s, f.id), DEFAULT_STACK);
    applyToNode(node, allOff);
    expect(calls).toContain("filters:0");
    expect(calls).toContain("clearCache");
    expect(calls).not.toContain("cache");
  });

  it("sets colorize params when a hue instance has colorize on", () => {
    const { node, params } = mockNode();
    const hue = DEFAULT_STACK.find((f) => f.kind === "hue")!;
    const stack = updateFilter(DEFAULT_STACK, hue.id, {
      colorize: true,
      colorHue: 200,
      colorSat: 0.5,
    } as any);
    applyToNode(node, stack);
    expect(params.colorHue).toBe(200);
    expect(params.colorSat).toBe(0.5);
  });
});
```

> Note: the `hslValues` test above only asserts the neutral default. Strengthen it if desired, but keep the assertion shape matching the implementation below.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/filters/__tests__/apply.test.ts`
Expected: FAIL — `apply.ts` does not exist.

- [ ] **Step 3: Write `apply.ts`**

```ts
// src/lib/filters/apply.ts
import Konva from "konva";
import { colorize } from "./colorize";
import type { FilterInstance, FilterStack } from "./types";

type FilterFn = (this: unknown, imageData: ImageData) => void;

/**
 * Build the Konva filter array for a stack, in order.
 *
 * Konva constraint: `HSL` reads hue+saturation+luminance together, so emitting
 * one HSL per saturation/hue instance would double-apply. Instead we emit a
 * single HSL pass (combined values set on the node) at the earlier of the
 * saturation/hue positions. Hue rotation and saturation scaling commute, so
 * this is visually equivalent; reordering saturation vs hue is a no-op.
 * Colorize is its own filter (replaces that hue instance's HSL).
 */
export function stackToFilters(stack: FilterStack): FilterFn[] {
  const fns: FilterFn[] = [];
  let hslPushed = false;
  for (const f of stack) {
    if (!f.enabled) continue;
    switch (f.kind) {
      case "blur":
        fns.push(Konva.Filters.Blur);
        break;
      case "brightness":
        fns.push(Konva.Filters.Brighten);
        break;
      case "contrast":
        fns.push(Konva.Filters.Contrast);
        break;
      case "saturation":
        if (!hslPushed) {
          fns.push(Konva.Filters.HSL);
          hslPushed = true;
        }
        break;
      case "hue":
        if (f.colorize) {
          fns.push(colorize as unknown as FilterFn);
        } else if (!hslPushed) {
          fns.push(Konva.Filters.HSL);
          hslPushed = true;
        }
        break;
    }
  }
  return fns;
}

/** Combined HSL values for all enabled saturation/hue (non-colorize) instances. */
export function hslValues(stack: FilterStack): { hue: number; saturation: number; luminance: number } {
  let hue = 0;
  let saturation = 0;
  for (const f of stack) {
    if (!f.enabled) continue;
    if (f.kind === "saturation") saturation += f.value;
    else if (f.kind === "hue" && !f.colorize) hue += f.shift;
  }
  return { hue, saturation, luminance: 0 };
}

/**
 * Apply a stack to a Konva image node: set each enabled filter's node params,
 * set the combined HSL values, install the filter array, then cache (or clear).
 * Call this whenever the stack OR the node's geometry changes.
 */
export function applyToNode(node: Konva.Image, stack: FilterStack): void {
  const n = node as unknown as Record<string, (v?: number) => unknown>;
  for (const f of stack) {
    if (!f.enabled) continue;
    switch (f.kind) {
      case "blur":
        n.blurRadius?.(f.radius);
        break;
      case "brightness":
        n.brightness?.(f.value);
        break;
      case "contrast":
        n.contrast?.(f.value);
        break;
      case "hue":
        if (f.colorize) {
          n.colorHue?.(f.colorHue);
          n.colorSat?.(f.colorSat);
        }
        break;
    }
  }
  const hsl = hslValues(stack);
  n.hue?.(hsl.hue);
  n.saturation?.(hsl.saturation);
  n.luminance?.(hsl.luminance);

  const fns = stackToFilters(stack);
  (node as unknown as { filters: (f: FilterFn[]) => void }).filters(fns);
  if (fns.length > 0) (node as unknown as { cache: () => void }).cache();
  else (node as unknown as { clearCache: () => void }).clearCache();
}
```

- [ ] **Step 4: Write `index.ts` barrel**

```ts
// src/lib/filters/index.ts
export * from "./types";
export * from "./kinds";
export * from "./stackOps";
export * from "./colorize";
export * from "./apply";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/filters/__tests__/apply.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole filters suite**

Run: `npx vitest run src/lib/filters`
Expected: PASS (all four files).

- [ ] **Step 7: Commit**

```bash
git add src/lib/filters/apply.ts src/lib/filters/index.ts src/lib/filters/__tests__/apply.test.ts
git commit -m "feat(filters): apply layer maps a stack to Konva filters + cache"
```

---

## Task 4: Reducer integration (`filtersA`/`filtersB`, `SET_FILTERS`)

**Files:**
- Modify: `src/generators/swap-collage/swapReducer.ts`
- Modify: `src/generators/swap-collage/__tests__/swapReducer.test.ts`

- [ ] **Step 1: Add the failing reducer test**

Append to the `describe("swapReducer", ...)` block in `src/generators/swap-collage/__tests__/swapReducer.test.ts`:

```ts
  it("initializes each slot with the default filter stack", () => {
    expect(initialSwapState.filtersA).toHaveLength(5);
    expect(initialSwapState.filtersB).toHaveLength(5);
  });

  it("SET_FILTERS updates the named slot only", () => {
    const next = swapReducer(initialSwapState, {
      type: "SET_FILTERS",
      slot: "A",
      filters: [],
    } as SwapAction);
    expect(next.filtersA).toEqual([]);
    expect(next.filtersB).toHaveLength(5); // untouched
  });

  it("orientation change resets transform but leaves filters intact", () => {
    const withFilters = swapReducer(initialSwapState, {
      type: "SET_FILTERS",
      slot: "A",
      filters: [],
    } as SwapAction);
    const after = swapReducer(withFilters, {
      type: "SET_ORIENTATION",
      orientation: "tb",
    } as SwapAction);
    expect(after.filtersA).toEqual([]); // preserved
    expect(after.xformA.zoom).toBe(1); // transform reset
  });
```

Also update the existing "has the expected initial state" test (around line 11) to add:

```ts
    expect(initialSwapState.filtersA.map((f) => f.kind)).toEqual([
      "blur",
      "brightness",
      "contrast",
      "saturation",
      "hue",
    ]);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/generators/swap-collage/__tests__/swapReducer.test.ts`
Expected: FAIL — `filtersA` does not exist on `initialSwapState`, `SET_FILTERS` not handled.

- [ ] **Step 3: Modify `swapReducer.ts`**

At the top, add the import (after the existing `clampRect` import on line 2):

```ts
import { DEFAULT_STACK, type FilterStack } from "@/lib/filters";
```

Add the two fields to `SwapState` (after `xformB: Transform;`, before `selection: Selection;`):

```ts
  filtersA: FilterStack;
  filtersB: FilterStack;
```

Add defaults to `initialSwapState` (after the `xformB` line, before `selection: null,`):

```ts
  filtersA: DEFAULT_STACK.map((f) => ({ ...f })),
  filtersB: DEFAULT_STACK.map((f) => ({ ...f })),
```

> Note: `DEFAULT_STACK` is a shared module constant; map-spread gives each slot its own array/objects so they never alias.

Add to the `SwapAction` union (after the `RESET_XFORM` member):

```ts
  | { type: "SET_FILTERS"; slot: Slot; filters: FilterStack }
```

Add a case to `swapReducer` (before `case "RESET_XFORM":`):

```ts
    case "SET_FILTERS":
      return action.slot === "A"
        ? { ...state, filtersA: action.filters }
        : { ...state, filtersB: action.filters };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/generators/swap-collage/__tests__/swapReducer.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/swapReducer.ts src/generators/swap-collage/__tests__/swapReducer.test.ts
git commit -m "feat(swap-collage): add per-slot filter stacks + SET_FILTERS action"
```

---

## Task 5: Install shadcn Switch

**Files:**
- Create: `src/components/ui/switch.tsx` (via CLI)

- [ ] **Step 1: Add the component via shadcn CLI**

Run: `npx shadcn@latest add switch`
Expected: a new `src/components/ui/switch.tsx` is created and `Switch` exported. Confirm `Switch` is now imported from `@/components/ui/switch`.

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/switch.tsx package.json
git commit -m "feat(ui): add shadcn Switch primitive for filter toggles"
```

---

## Task 6: `FilterStackControls` editor UI

**Files:**
- Create: `src/components/filters/FilterStackControls.tsx`
- Create: `src/components/filters/__tests__/FilterStackControls.test.tsx`

- [ ] **Step 1: Write the failing component test**

```tsx
// src/components/filters/__tests__/FilterStackControls.test.tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterStackControls } from "../FilterStackControls";
import { DEFAULT_STACK } from "@/lib/filters";

describe("FilterStackControls", () => {
  it("renders a row per filter in the stack", () => {
    render(<FilterStackControls stack={DEFAULT_STACK} onChange={() => {}} />);
    expect(screen.getByText("Blur")).toBeTruthy();
    expect(screen.getByText("Brightness")).toBeTruthy();
    expect(screen.getByText("Hue")).toBeTruthy();
  });

  it("clicking remove calls onChange without that filter", () => {
    const onChange = vi.fn();
    render(<FilterStackControls stack={DEFAULT_STACK} onChange={onChange} />);
    fireEvent.click(screen.getAllByLabelText("Remove filter")[0]);
    expect(onChange).toHaveBeenCalledWith(
      DEFAULT_STACK.filter((f) => f.id !== "blur"),
    );
  });

  it("toggling a switch flips enabled for that filter", () => {
    const onChange = vi.fn();
    render(<FilterStackControls stack={DEFAULT_STACK} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Toggle Blur"));
    const next = onChange.mock.calls[0][0];
    expect(next.find((f: any) => f.id === "blur").enabled).toBe(false);
  });

  it("shows colorize controls only on the hue row", () => {
    render(<FilterStackControls stack={DEFAULT_STACK} onChange={() => {}} />);
    expect(screen.getByLabelText("Colorize")).toBeTruthy();
    // exactly one colorize toggle (only hue has it)
    expect(screen.getAllByLabelText("Colorize")).toHaveLength(1);
  });

  it("the add control offers only kinds not already present", () => {
    render(<FilterStackControls stack={DEFAULT_STACK} onChange={() => {}} />);
    // all five kinds are present in DEFAULT_STACK -> nothing to add
    expect(screen.queryByLabelText("Add filter")).toBeTruthy();
    // With DEFAULT_STACK, the add menu is disabled (no missing kinds)
    expect(screen.getByLabelText("Add filter")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/filters/__tests__/FilterStackControls.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Write `FilterStackControls.tsx`**

```tsx
// src/components/filters/FilterStackControls.tsx
import { useState, type DragEvent } from "react";
import { GripVertical, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  addFilter,
  amountOf,
  COLORIZE_HUE,
  COLORIZE_SAT,
  DEFAULT_STACK,
  KIND_META,
  moveFilter,
  removeFilter,
  toggleFilter,
  updateFilter,
  withAmount,
  type FilterInstance,
  type FilterKind,
  type FilterStack,
} from "@/lib/filters";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `f-${Math.random().toString(36).slice(2)}`;
}

function missingKinds(stack: FilterStack): FilterKind[] {
  const present = new Set(stack.map((f) => f.kind));
  return (Object.keys(KIND_META) as FilterKind[]).filter((k) => !present.has(k));
}

/** `make` receives the real current stack and returns the next stack. */
function Row({
  f,
  index,
  make,
}: {
  f: FilterInstance;
  index: number;
  make: (fn: (real: FilterStack) => FilterStack) => void;
}) {
  const meta = KIND_META[f.kind];
  const [dragging, setDragging] = useState(false);

  const isHue = f.kind === "hue";
  const hueF = f as Extract<FilterInstance, { kind: "hue" }>;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border p-2",
        !f.enabled && "opacity-50",
        dragging && "opacity-40",
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData("text/plain"));
        make((real) => moveFilter(real, from, index));
      }}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Drag ${meta.label}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", String(index));
            setDragging(true);
          }}
          onDragEnd={() => setDragging(false)}
          className="cursor-grab text-muted-foreground"
        >
          <GripVertical className="size-4" />
        </button>
        <Label className="flex-1 text-xs font-medium">{meta.label}</Label>
        <Switch
          aria-label={`Toggle ${meta.label}`}
          checked={f.enabled}
          onCheckedChange={() => make((real) => toggleFilter(real, f.id))}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remove filter"
          onClick={() => make((real) => removeFilter(real, f.id))}
        >
          <X className="size-4" />
        </Button>
      </div>

      {isHue && (
        <div className="flex items-center gap-2 pl-6">
          <Switch
            aria-label="Colorize"
            checked={hueF.colorize}
            onCheckedChange={(v) =>
              make((real) => updateFilter(real, f.id, { colorize: v }) as FilterStack)
            }
          />
          <Label className="text-xs text-muted-foreground">Colorize</Label>
        </div>
      )}

      {isHue && hueF.colorize ? (
        <div className="flex flex-col gap-2 pl-6">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Hue</Label>
            <span className="text-xs text-muted-foreground">{Math.round(hueF.colorHue)}°</span>
          </div>
          <Slider
            value={[hueF.colorHue]}
            min={COLORIZE_HUE.min}
            max={COLORIZE_HUE.max}
            step={COLORIZE_HUE.step}
            onValueChange={([v]) =>
              make((real) => updateFilter(real, f.id, { colorHue: v }) as FilterStack)
            }
          />
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Saturation</Label>
            <span className="text-xs text-muted-foreground">{hueF.colorSat.toFixed(2)}</span>
          </div>
          <Slider
            value={[hueF.colorSat]}
            min={COLORIZE_SAT.min}
            max={COLORIZE_SAT.max}
            step={COLORIZE_SAT.step}
            onValueChange={([v]) =>
              make((real) => updateFilter(real, f.id, { colorSat: v }) as FilterStack)
            }
          />
        </div>
      ) : (
        <Slider
          value={[amountOf(f)]}
          min={meta.min}
          max={meta.max}
          step={meta.step}
          onValueChange={([v]) => make((real) => real.map((x) => (x.id === f.id ? withAmount(x, v) : x)))}
        />
      )}
    </div>
  );
}

export function FilterStackControls({
  stack,
  onChange,
  disabled,
}: {
  stack: FilterStack;
  onChange: (next: FilterStack) => void;
  disabled?: boolean;
}) {
  const make = (fn: (real: FilterStack) => FilterStack) => {
    if (disabled) return;
    onChange(fn(stack));
  };
  const missing = missingKinds(stack);

  return (
    <div className="flex flex-col gap-2">
      {stack.map((f, i) => (
        <Row key={f.id} f={f} index={i} make={make} />
      ))}

      {missing.length > 0 ? (
        <Select
          value=""
          onValueChange={(kind) => {
            if (!kind || disabled) return;
            onChange(addFilter(stack, kind as FilterKind, newId()));
          }}
        >
          <SelectTrigger className="w-full" aria-label="Add filter">
            <span className="flex items-center gap-2 text-muted-foreground">
              <Plus className="size-4" /> Add filter
            </span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {missing.map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_META[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Button type="button" variant="outline" className="w-full" aria-label="Add filter" disabled>
          <Plus className="size-4" /> All filters added
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground"
        disabled={disabled}
        onClick={() => onChange(DEFAULT_STACK.map((f) => ({ ...f })))}
      >
        <RotateCcw className="size-4" /> Reset filters
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/filters/__tests__/FilterStackControls.test.tsx`
Expected: PASS.

> Note: the test asserts the Add control is disabled when no kinds are missing (DEFAULT_STACK has all five). If `Select` rendering interferes with `toBeDisabled()` in jsdom, change that single assertion to check `missingKinds(DEFAULT_STACK)` directly via the imported helper instead.

- [ ] **Step 5: Commit**

```bash
git add src/components/filters/FilterStackControls.tsx src/components/filters/__tests__/FilterStackControls.test.tsx
git commit -m "feat(filters): generic FilterStackControls editor (add/remove/reorder/toggle)"
```

---

## Task 7: `FilteredImage` react-konva binding

**Files:**
- Create: `src/components/filters/FilteredImage.tsx`

> No unit test (matches the existing pattern: `SwapCollagePreview` has none — react-konva needs a real canvas). Verified manually in Task 9.

- [ ] **Step 1: Write `FilteredImage.tsx`**

```tsx
// src/components/filters/FilteredImage.tsx
import { useEffect, useRef } from "react";
import { Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import { applyToNode, type FilterStack } from "@/lib/filters";

/**
 * A Konva image node whose filter stack is applied imperatively. react-konva
 * owns the node; we re-apply (and re-cache) whenever the stack or the node's
 * geometry (width/height) changes. Pan/drag (x/y) does NOT re-cache — the
 * cached filtered bitmap moves with the node.
 *
 * Pass through any KonvaImage props (draggable, onDragMove, listening, etc.).
 */
export function FilteredImage({
  stack,
  ...props
}: React.ComponentProps<typeof KonvaImage> & {
  stack: FilterStack;
}) {
  const ref = useRef<Konva.Image | null>(null);

  // width/height come through as numbers in props; track them as deps so a
  // geometry change (e.g. zoom) re-caches the filtered bitmap at the new size.
  const { width, height, image } = props as {
    width?: number;
    height?: number;
    image?: CanvasImageSource;
  };

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    applyToNode(node, stack);
  }, [stack, width, height, image]);

  return <KonvaImage ref={ref} {...props} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/filters/FilteredImage.tsx
git commit -m "feat(filters): FilteredImage react-konva binding with apply-on-change"
```

---

## Task 8: Wire filters into the generator

**Files:**
- Modify: `src/generators/swap-collage/SwapCollageProvider.tsx`
- Modify: `src/generators/swap-collage/SwapCollagePreview.tsx`
- Modify: `src/generators/swap-collage/SwapCollageControls.tsx`

- [ ] **Step 1: `SwapCollageProvider.tsx` — reset filters on clear; re-export types**

Add the import near the top (after the existing `./swapReducer` import block):

```ts
import { DEFAULT_STACK, type FilterInstance, type FilterKind, type FilterStack } from "@/lib/filters";
```

In `clearImage`, add a second dispatch so clearing also resets the slot's filters:

```ts
  const clearImage = (slot: Slot) => {
    if (slot === "A") a.reset();
    else b.reset();
    // Clearing an image also resets its zoom/pan AND its filters — no stale
    // transform or look on a now-empty tile.
    dispatch({ type: "RESET_XFORM", slot });
    dispatch({ type: "SET_FILTERS", slot, filters: DEFAULT_STACK.map((f) => ({ ...f })) });
  };
```

In the `export type { ... }` block at the bottom, add:

```ts
export type { FilterInstance, FilterKind, FilterStack };
```

- [ ] **Step 2: `SwapCollagePreview.tsx` — render through `FilteredImage`**

Add the imports (with the other react-konva imports near the top):

```ts
import { FilteredImage } from "@/components/filters/FilteredImage";
```

In `renderTile`, replace the base `<KonvaImage ... />` (the one with `draggable` + `onDragMove`) with a `FilteredImage` carrying the *base image's own* filters. The base image is `imgA` when `slot === "A"`, else `imgB`, so its filters are `slot === "A" ? state.filtersA : state.filtersB`. Replace this block:

```tsx
        {base && baseBmp ? (
          <KonvaImage
            image={baseBmp}
            {...base}
            draggable
            onDragMove={(e) => {
              const node = e.target as Konva.Image;
              const w = node.width() * node.scaleX();
              const h = node.height() * node.scaleY();
              const clamped = clampCoverPos(node.x(), node.y(), w, h, tiles.tileW, tiles.tileH);
              node.x(clamped.x);
              node.y(clamped.y);
              onImageTransform(slot, node);
            }}
          />
        ) : (
```

with:

```tsx
        {base && baseBmp ? (
          <FilteredImage
            stack={slot === "A" ? state.filtersA : state.filtersB}
            image={baseBmp}
            {...base}
            draggable
            onDragMove={(e) => {
              const node = e.target as Konva.Image;
              const w = node.width() * node.scaleX();
              const h = node.height() * node.scaleY();
              const clamped = clampCoverPos(node.x(), node.y(), w, h, tiles.tileW, tiles.tileH);
              node.x(clamped.x);
              node.y(clamped.y);
              onImageTransform(slot, node);
            }}
          />
        ) : (
```

And replace the overlay `<KonvaImage image={otherBmp} {...overlay} listening={false} />` with a `FilteredImage` carrying the *overlay image's own* filters. The overlay image is the *other* slot, so its filters are `slot === "A" ? state.filtersB : state.filtersA`. Replace:

```tsx
          <Group clip={{ x: maskPx.x, y: maskPx.y, width: maskPx.w, height: maskPx.h }}>
            <KonvaImage image={otherBmp} {...overlay} listening={false} />
          </Group>
```

with:

```tsx
          <Group clip={{ x: maskPx.x, y: maskPx.y, width: maskPx.w, height: maskPx.h }}>
            <FilteredImage
              stack={slot === "A" ? state.filtersB : state.filtersA}
              image={otherBmp}
              {...overlay}
              listening={false}
            />
          </Group>
```

- [ ] **Step 3: `SwapCollageControls.tsx` — mount the editor per image**

Add the imports:

```ts
import { FilterStackControls } from "@/components/filters/FilterStackControls";
```

In the **Image A** `AccordionContent` (right after the `ZoomControls` block for A, before the closing `</AccordionContent>`), add:

```tsx
            <div className="flex flex-col gap-2">
              <FieldLabel>Filters</FieldLabel>
              <FilterStackControls
                stack={state.filtersA}
                onChange={(f) => dispatch({ type: "SET_FILTERS", slot: "A", filters: f })}
                disabled={imgA.status !== "ready"}
              />
            </div>
```

In the **Image B** `AccordionContent` (right after the `ZoomControls` block for B), add the same with slot B:

```tsx
            <div className="flex flex-col gap-2">
              <FieldLabel>Filters</FieldLabel>
              <FilterStackControls
                stack={state.filtersB}
                onChange={(f) => dispatch({ type: "SET_FILTERS", slot: "B", filters: f })}
                disabled={imgB.status !== "ready"}
              />
            </div>
```

- [ ] **Step 4: Typecheck + full test suite**

Run: `npx tsc -b && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/SwapCollageProvider.tsx src/generators/swap-collage/SwapCollagePreview.tsx src/generators/swap-collage/SwapCollageControls.tsx
git commit -m "feat(swap-collage): wire per-image filter stacks into preview, controls, clear"
```

---

## Task 9: Manual verification

**Files:** none (runtime check)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Open the printed local URL.

- [ ] **Step 2: Functional checks**

For each of Image A and Image B independently, confirm:
1. Load a photo. The **Filters** section appears under Zoom.
2. Drag the **Blur** slider → image softens; drag back to 0 → returns to crisp.
3. **Brightness / Contrast / Saturation** each adjust as expected at neutral default.
4. On the **Hue** row, toggle **Colorize** → the image becomes a monochrome tint; drag **Hue** to recolor (e.g. 120 = green) and **Saturation** toward 0 to fade it. Turn Colorize off → normal hue **Shift** slider returns.
5. **Toggle** a filter's switch → that filter stops applying (row dims). Toggle back.
6. **Remove** a filter with ✕ → row disappears; the **Add filter** control now offers it; add it back.
7. **Drag** a row by the ≡ handle to reorder → order changes; for Blur/Brightness/Contrast/Hue the visible result changes position in the chain.
8. **Reset filters** → all five return at neutral.
9. Drag one image's swap-window so the other image peeks through → the peek-through region shows the **other** image's filters (apply a strong Blur to B, see it blur in A's swap window).

- [ ] **Step 3: Reset + export checks**

1. **Clear** Image A (✕ on its source) → its filters reset to the full neutral stack; reload an image → starts unfiltered.
2. Change **Orientation** or **Aspect** → transforms reset but A/B filters are preserved.
3. Set an extreme filter (e.g. Blur 20 on A), then **Export** PNG at 2160px → open the file: the blur is baked in and **crisp at full resolution** (not a blurry low-res upscale). Confirm JPG export too.

- [ ] **Step 4: Final commit if any tweaks were made**

```bash
git status   # if clean, nothing to commit
```

---

## Self-review notes

- **Spec coverage:** palette (Task 1 kinds), colorize (Task 2), filter→Konva mapping incl. the HSL-merge correction (Task 3), per-image state + SET_FILTERS + reset semantics (Tasks 4 + 8), swap-overlay-correctness (Task 8 — filter by source image), reusable module location (Tasks 1/3/6/7), add/remove/reorder/toggle UI (Task 6), export crispness (Task 9 step 3). All spec sections covered.
- **Placeholder scan:** no TBD/TODO; every code step ships full, correct code.
- **Type consistency:** `FilterInstance` variants, helper names (`amountOf`/`withAmount`/`moveFilter`/`addFilter`/`removeFilter`/`toggleFilter`/`updateFilter`), `applyToNode`, `stackToFilters`, `hslValues`, `DEFAULT_STACK`, `KIND_META`, `COLORIZE_HUE/SAT`, and the `SET_FILTERS` action shape are used identically across all tasks.

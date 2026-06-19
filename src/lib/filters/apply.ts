// src/lib/filters/apply.ts
import Konva from "konva";
import { colorize } from "./colorize";
import type { FilterStack } from "./types";

/** Konva's `Filter` type — a function with `this: Node`, or a string for a
 *  registered named filter. Derived from a real filter value so it always
 *  matches whatever Konva declares (`FilterFunction | string`). */
type FilterFn = typeof Konva.Filters.Blur;

/**
 * Build the Konva filter array for a stack, in order.
 *
 * Konva constraint: `HSL` reads hue+saturation+luminance together, so emitting
 * one HSL per saturation/hue instance would double-apply. Instead we emit a
 * single shared HSL pass (combined values set on the node) at the earlier of the
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
export function hslValues(stack: FilterStack): {
  hue: number;
  saturation: number;
  luminance: number;
} {
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
 * Call whenever the stack OR the node's geometry changes.
 *
 * Built-in params use Konva's registered getter-setter methods. Colorize's
 * `colorHue`/`colorSat` are custom (un-registered), so they are stored as plain
 * instance properties that the `colorize` filter reads via `this.colorHue`.
 */
export function applyToNode(node: Konva.Image, stack: FilterStack): void {
  const n = node as unknown as {
    blurRadius: (v: number) => void;
    brightness: (v: number) => void;
    contrast: (v: number) => void;
    hue: (v: number) => void;
    saturation: (v: number) => void;
    luminance: (v: number) => void;
    colorHue: number;
    colorSat: number;
    filters: (f: FilterFn[]) => void;
    cache: () => void;
    clearCache: () => void;
  };

  for (const f of stack) {
    if (!f.enabled) continue;
    switch (f.kind) {
      case "blur":
        n.blurRadius(f.radius);
        break;
      case "brightness":
        n.brightness(f.value);
        break;
      case "contrast":
        n.contrast(f.value);
        break;
      case "hue":
        if (f.colorize) {
          n.colorHue = f.colorHue;
          n.colorSat = f.colorSat;
        }
        break;
    }
  }

  const hsl = hslValues(stack);
  n.hue(hsl.hue);
  n.saturation(hsl.saturation);
  n.luminance(hsl.luminance);

  const fns = stackToFilters(stack);
  n.filters(fns);
  if (fns.length > 0) n.cache();
  else n.clearCache();
}

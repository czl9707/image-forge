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

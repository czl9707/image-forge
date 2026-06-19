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

/** A per-variant patch: each branch only allows the fields of ONE variant
 *  (excluding the discriminator `kind` and the stable `id`). */
export type FilterPatch = {
  [K in FilterInstance["kind"]]: Partial<
    Omit<Extract<FilterInstance, { kind: K }>, "id" | "kind">
  >;
}[FilterInstance["kind"]];

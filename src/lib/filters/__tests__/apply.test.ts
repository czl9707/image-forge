// src/lib/filters/__tests__/apply.test.ts
import { describe, expect, it, vi } from "vitest";

// Mock konva so the test never touches a real canvas. Each filter is a unique
// sentinel string so we can assert which filters landed and in what order.
vi.mock("konva", () => {
  const Filters = {
    Blur: "BLUR",
    Brighten: "BRIGHTEN",
    Contrast: "CONTRAST",
    HSL: "HSL",
  };
  return { default: { Filters }, Filters };
});

import Konva from "konva";
import { colorize } from "../colorize";
import { DEFAULT_STACK } from "../kinds";
import { moveFilter, toggleFilter, updateFilter } from "../stackOps";
import { applyToNode, hslValues, stackToFilters } from "../apply";

/** A recording stand-in for a Konva node: getter-setter methods for built-in
 *  params, plus plain properties for the custom colorize params. */
function mockNode() {
  const params: Record<string, number> = {};
  const calls: string[] = [];
  const setter = (name: string) => (v?: number) => {
    if (v !== undefined) {
      params[name] = v;
      calls.push(name);
    }
    return params[name];
  };
  const node = {
    blurRadius: setter("blurRadius"),
    brightness: setter("brightness"),
    contrast: setter("contrast"),
    hue: setter("hue"),
    saturation: setter("saturation"),
    luminance: setter("luminance"),
    colorHue: 0, // plain property, like a real custom-param node
    colorSat: 1,
    filters: (f?: unknown[]) => {
      if (f !== undefined) calls.push("filters:" + f.length);
      return [];
    },
    cache: () => calls.push("cache"),
    clearCache: () => calls.push("clearCache"),
  };
  return { node, calls, params };
}

describe("stackToFilters", () => {
  it("DEFAULT_STACK emits Blur/Brighten/Contrast/HSL (saturation+hue share one HSL)", () => {
    expect(stackToFilters(DEFAULT_STACK)).toEqual([
      Konva.Filters.Blur,
      Konva.Filters.Brighten,
      Konva.Filters.Contrast,
      Konva.Filters.HSL,
    ]);
  });

  it("skips disabled instances", () => {
    const off = toggleFilter(DEFAULT_STACK, "contrast");
    expect(stackToFilters(off)).toEqual([
      Konva.Filters.Blur,
      Konva.Filters.Brighten,
      Konva.Filters.HSL,
    ]);
  });

  it("emits colorize instead of a second HSL when hue has colorize on", () => {
    const hue = DEFAULT_STACK.find((f) => f.kind === "hue")!;
    const stack = updateFilter(DEFAULT_STACK, hue.id, { colorize: true });
    expect(stackToFilters(stack)).toEqual([
      Konva.Filters.Blur,
      Konva.Filters.Brighten,
      Konva.Filters.Contrast,
      Konva.Filters.HSL, // saturation
      colorize, // hue -> its own filter
    ]);
  });

  it("emits exactly one HSL regardless of saturation/hue order", () => {
    const hueIdx = DEFAULT_STACK.findIndex((f) => f.kind === "hue");
    const satIdx = DEFAULT_STACK.findIndex((f) => f.kind === "saturation");
    const reordered = moveFilter(DEFAULT_STACK, hueIdx, satIdx); // hue before saturation
    const hslCount = stackToFilters(reordered).filter(
      (f) => f === Konva.Filters.HSL,
    ).length;
    expect(hslCount).toBe(1);
  });
});

describe("hslValues", () => {
  it("sums enabled saturation/hue (non-colorize) contributions", () => {
    const hue = DEFAULT_STACK.find((f) => f.kind === "hue")!;
    let stack = updateFilter(DEFAULT_STACK, "saturation", { value: 1.5 });
    stack = updateFilter(stack, hue.id, { shift: 40 });
    expect(hslValues(stack)).toEqual({ hue: 40, saturation: 1.5, luminance: 0 });
  });

  it("ignores colorized hue", () => {
    const hue = DEFAULT_STACK.find((f) => f.kind === "hue")!;
    const stack = updateFilter(DEFAULT_STACK, hue.id, { shift: 99, colorize: true });
    expect(hslValues(stack).hue).toBe(0);
  });
});

describe("applyToNode", () => {
  it("sets params, installs filters, and caches when any filter is active", () => {
    const { node, calls, params } = mockNode();
    const blur = DEFAULT_STACK.find((f) => f.kind === "blur")!;
    const stack = updateFilter(DEFAULT_STACK, blur.id, { radius: 8 });
    applyToNode(node as unknown as Konva.Image, stack);
    expect(params.blurRadius).toBe(8);
    expect(calls).toContain("filters:4");
    expect(calls).toContain("cache");
    expect(calls).not.toContain("clearCache");
  });

  it("clears cache and installs no filters when nothing is enabled", () => {
    const { node, calls } = mockNode();
    const allOff = DEFAULT_STACK.reduce<typeof DEFAULT_STACK>(
      (s, f) => toggleFilter(s, f.id),
      DEFAULT_STACK,
    );
    applyToNode(node as unknown as Konva.Image, allOff);
    expect(calls).toContain("filters:0");
    expect(calls).toContain("clearCache");
    expect(calls).not.toContain("cache");
  });

  it("sets colorize params as plain node properties", () => {
    const { node } = mockNode();
    const hue = DEFAULT_STACK.find((f) => f.kind === "hue")!;
    const stack = updateFilter(DEFAULT_STACK, hue.id, {
      colorize: true,
      colorHue: 200,
      colorSat: 0.5,
    });
    applyToNode(node as unknown as Konva.Image, stack);
    expect(node.colorHue).toBe(200);
    expect(node.colorSat).toBe(0.5);
  });
});

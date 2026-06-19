// src/generators/swap-collage/__tests__/swapReducer.test.ts
import { describe, expect, it } from "vitest";
import {
  swapReducer,
  initialSwapState,
  DEFAULT_MASK,
  type SwapAction,
} from "../swapReducer";

describe("swapReducer", () => {
  it("has the expected initial state", () => {
    expect(initialSwapState.orientation).toBe("tb");
    expect(initialSwapState.aspect).toBe("4:3");
    expect(initialSwapState.exportSize).toBe(1080);
    expect(initialSwapState.mask).toEqual(DEFAULT_MASK);
    expect(initialSwapState.xformA.zoom).toBe(1);
    expect(initialSwapState.selection).toBeNull();
    expect(initialSwapState.filtersA).toEqual([]);
  });

  it("sets orientation AND re-fits both images (canvas rotated)", () => {
    const moved: SwapAction = {
      type: "SET_XFORM",
      slot: "A",
      xform: { panX: 0.5, panY: 0.5, zoom: 2 },
    };
    const after = swapReducer(
      swapReducer(initialSwapState, moved),
      { type: "SET_ORIENTATION", orientation: "tb" } as SwapAction,
    );
    expect(after.orientation).toBe("tb");
    expect(after.xformA.zoom).toBe(1); // reset
    expect(after.xformA.panX).toBe(0);
  });

  it("changes aspect AND re-fits both images", () => {
    const moved: SwapAction = {
      type: "SET_XFORM",
      slot: "A",
      xform: { panX: 0.5, panY: 0.5, zoom: 2 },
    };
    const after = swapReducer(
      swapReducer(initialSwapState, moved),
      { type: "SET_ASPECT", aspect: "1:1" } as SwapAction,
    );
    expect(after.aspect).toBe("1:1");
    expect(after.xformA.zoom).toBe(1); // reset
    expect(after.xformA.panX).toBe(0);
  });

  it("sets export size", () => {
    const s = swapReducer(initialSwapState, {
      type: "SET_EXPORT_SIZE",
      size: 2160,
    } as SwapAction);
    expect(s.exportSize).toBe(2160);
  });

  it("clamps the mask on SET_MASK", () => {
    const s = swapReducer(initialSwapState, {
      type: "SET_MASK",
      mask: { x: 5, y: 5, w: 0.01, h: 0.01 },
    } as SwapAction);
    expect(s.mask.w).toBeGreaterThanOrEqual(0.05);
    expect(s.mask.x + s.mask.w).toBeLessThanOrEqual(1.0000001);
  });

  it("sets per-slot transform", () => {
    const s = swapReducer(initialSwapState, {
      type: "SET_XFORM",
      slot: "B",
      xform: { panX: 0.1, panY: 0.2, zoom: 1.5 },
    } as SwapAction);
    expect(s.xformB.zoom).toBe(1.5);
    expect(s.xformA.zoom).toBe(1); // untouched
  });

  it("sets selection", () => {
    const s = swapReducer(initialSwapState, {
      type: "SET_SELECTION",
      selection: "mask",
    } as SwapAction);
    expect(s.selection).toBe("mask");
  });

  it("resets a slot's transform to identity", () => {
    const moved: SwapAction = {
      type: "SET_XFORM",
      slot: "B",
      xform: { panX: 0.3, panY: 0.4, zoom: 2.5 },
    };
    const s = swapReducer(
      swapReducer(initialSwapState, moved),
      { type: "RESET_XFORM", slot: "B" } as SwapAction,
    );
    expect(s.xformB).toEqual({ panX: 0, panY: 0, zoom: 1 });
    expect(s.xformA.zoom).toBe(1); // untouched
  });

  it("initializes each slot with an empty filter stack", () => {
    expect(initialSwapState.filtersA).toEqual([]);
    expect(initialSwapState.filtersB).toEqual([]);
  });

  it("SET_FILTERS updates the named slot only", () => {
    const stack = [{ id: "b", kind: "blur", enabled: true, radius: 5 }];
    const next = swapReducer(initialSwapState, {
      type: "SET_FILTERS",
      slot: "A",
      filters: stack,
    } as SwapAction);
    expect(next.filtersA).toEqual(stack);
    expect(next.filtersB).toEqual([]); // untouched
  });

  it("orientation change resets transform but leaves filters intact", () => {
    const stack = [{ id: "b", kind: "blur", enabled: true, radius: 5 }];
    const withFilters = swapReducer(initialSwapState, {
      type: "SET_FILTERS",
      slot: "A",
      filters: stack,
    } as SwapAction);
    const after = swapReducer(withFilters, {
      type: "SET_ORIENTATION",
      orientation: "tb",
    } as SwapAction);
    expect(after.filtersA).toEqual(stack); // preserved
    expect(after.xformA.zoom).toBe(1); // transform reset
  });

});

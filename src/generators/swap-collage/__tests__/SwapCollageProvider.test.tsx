// src/generators/swap-collage/__tests__/SwapCollageProvider.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import {
  SwapCollageProvider,
  useSwapCollage,
} from "../SwapCollageProvider";
import { initialSwapState } from "../swapReducer";

const fakeBitmap = { width: 100, height: 50 };

let captured: ReturnType<typeof useSwapCollage> | null = null;
function Consumer() {
  captured = useSwapCollage();
  return null;
}

function renderProvider() {
  return render(
    <SwapCollageProvider>
      <Consumer />
    </SwapCollageProvider>,
  );
}

describe("SwapCollageProvider", () => {
  beforeEach(() => {
    captured = null;
    globalThis.createImageBitmap = vi
      .fn()
      .mockResolvedValue(fakeBitmap) as unknown as typeof createImageBitmap;
  });

  it("exposes the initial state and refs", () => {
    renderProvider();
    expect(captured).not.toBeNull();
    expect(captured!.state).toEqual(initialSwapState);
    expect(captured!.imgA.status).toBe("idle");
    expect(captured!.stageRef).toBeDefined();
  });

  it("dispatches to the reducer", () => {
    renderProvider();
    act(() => captured!.dispatch({ type: "SET_ORIENTATION", orientation: "tb" }));
    expect(captured!.state.orientation).toBe("tb");
  });

  it("loads an image into slot A", async () => {
    renderProvider();
    const file = new File(["x"], "a.png", { type: "image/png" });
    await act(async () => {
      await captured!.loadImage("A", file);
    });
    expect(captured!.imgA.status).toBe("ready");
    expect(captured!.imgA.bitmap).toBe(fakeBitmap);
  });

  it("clears an image", async () => {
    renderProvider();
    const file = new File(["x"], "a.png", { type: "image/png" });
    await act(async () => {
      await captured!.loadImage("A", file);
    });
    act(() => captured!.clearImage("A"));
    expect(captured!.imgA.status).toBe("idle");
  });
});

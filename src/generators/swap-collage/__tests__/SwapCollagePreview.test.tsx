// src/generators/swap-collage/__tests__/SwapCollagePreview.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SwapContextValue } from "../SwapCollageProvider";

vi.mock("../SwapCollageProvider", () => ({
  useSwapCollage: vi.fn(),
}));

import { useSwapCollage } from "../SwapCollageProvider";
import { SwapCollagePreview } from "../SwapCollagePreview";
import { initialSwapState } from "../swapReducer";

function mockContext(overrides: Partial<SwapContextValue> = {}) {
  const value: SwapContextValue = {
    imgA: { bitmap: null, status: "idle", error: null },
    imgB: { bitmap: null, status: "idle", error: null },
    loadImage: vi.fn(),
    clearImage: vi.fn(),
    state: initialSwapState,
    dispatch: vi.fn(),
    stageRef: { current: null },
    ...overrides,
  };
  (useSwapCollage as unknown as ReturnType<typeof vi.fn>).mockReturnValue(value);
  return value;
}

describe("SwapCollagePreview", () => {
  it("renders dropzones when no images are loaded", () => {
    mockContext();
    render(<SwapCollagePreview />);
    const prompts = screen.getAllByText(/drop an image/i);
    expect(prompts.length).toBe(2);
  });

  it("renders the Konva stage with tiles + mask when both images are ready", () => {
    const bmp = { width: 40, height: 30 } as unknown as ImageBitmap;
    mockContext({
      imgA: { bitmap: bmp, status: "ready", error: null },
      imgB: { bitmap: bmp, status: "ready", error: null },
    });
    render(<SwapCollagePreview />);
    expect(screen.getByTestId("konva-stage")).toBeInTheDocument();
    // base images (2) + 2 swap overlays = 4 konva-image nodes
    expect(screen.getAllByTestId("konva-image").length).toBe(4);
    // one mask rect per tile
    expect(screen.getAllByTestId("konva-rect").length).toBe(2);
  });
});

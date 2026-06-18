// src/generators/swap-collage/__tests__/SwapCollageControls.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SwapContextValue } from "../SwapCollageProvider";

vi.mock("../SwapCollageProvider", () => ({
  useSwapCollage: vi.fn(),
}));
vi.mock("@/export", () => ({ exportStage: vi.fn() }));

import { useSwapCollage } from "../SwapCollageProvider";
import { exportStage } from "@/export";
import { SwapCollageControls } from "../SwapCollageControls";
import { initialSwapState } from "../swapReducer";

const fakeStage = { scaleX: () => 1, toCanvas: () => ({}) };

function mockContext(overrides: Partial<SwapContextValue> = {}) {
  const value: SwapContextValue = {
    imgA: { bitmap: null, status: "idle", error: null },
    imgB: { bitmap: null, status: "idle", error: null },
    loadImage: vi.fn(),
    clearImage: vi.fn(),
    state: initialSwapState,
    dispatch: vi.fn(),
    stageRef: { current: fakeStage } as unknown as SwapContextValue["stageRef"],
    ...overrides,
  };
  (useSwapCollage as unknown as ReturnType<typeof vi.fn>).mockReturnValue(value);
  return value;
}

describe("SwapCollageControls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the control sections", () => {
    mockContext();
    render(<SwapCollageControls />);
    expect(screen.getByText("Image A")).toBeInTheDocument();
    expect(screen.getByText("Image B")).toBeInTheDocument();
    expect(screen.getByText("Orientation")).toBeInTheDocument();
    expect(screen.getByText("Aspect")).toBeInTheDocument();
    expect(screen.getByText("Export size")).toBeInTheDocument();
    expect(screen.getByText("Format")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
  });

  it("disables Export until both images are ready", () => {
    mockContext();
    render(<SwapCollageControls />);
    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();
  });

  it("enables Export and triggers exportStage when both ready", async () => {
    const user = userEvent.setup();
    mockContext({
      imgA: { bitmap: null, status: "ready", error: null },
      imgB: { bitmap: null, status: "ready", error: null },
    });
    render(<SwapCollageControls />);
    const btn = screen.getByRole("button", { name: /export/i });
    expect(btn).not.toBeDisabled();
    await user.click(btn);
    expect(exportStage).toHaveBeenCalledWith(fakeStage, "png");
  });

  it("dispatches RESET_MASK on reset", async () => {
    const user = userEvent.setup();
    const v = mockContext();
    render(<SwapCollageControls />);
    await user.click(screen.getByRole("button", { name: /reset mask/i }));
    expect(v.dispatch).toHaveBeenCalledWith({ type: "RESET_MASK" });
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { exportStage, type ExportableStage } from "../export";

function makeStage(scaleX: number) {
  const toBlob = vi.fn((cb: BlobCallback, _mime?: string, _q?: number) => {
    cb(new Blob(["x"], { type: "image/jpeg" }));
  });
  const canvas = { toBlob } as unknown as HTMLCanvasElement;
  return {
    stage: {
      scaleX: () => scaleX,
      toCanvas: vi.fn(() => canvas),
    } as unknown as ExportableStage,
    toCanvas: (canvas as unknown as { toCanvas?: unknown }).toCanvas,
    toBlob,
    canvas,
  };
}

describe("exportStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:url");
    vi.spyOn(URL, "revokeObjectURL").mockReturnValue();
    // Build a REAL anchor element (jsdom Node) BEFORE spying on createElement,
    // then return that same stable instance from the spy. This keeps it a valid
    // Node for document.body.appendChild while also being the object whose
    // .click we assert against. (The plain-object mock the plan started with
    // throws in appendChild because it isn't a Node.)
    const anchor = document.createElement("a");
    const clickSpy = vi.fn();
    anchor.click = clickSpy;
    vi.spyOn(document, "createElement").mockReturnValue(anchor);
  });

  it("renders the stage at pixelRatio = 1/scaleX", async () => {
    const { stage } = makeStage(0.5); // dispW is half of logical → pixelRatio 2
    await exportStage(stage, "png");
    expect(stage.toCanvas).toHaveBeenCalledWith({ pixelRatio: 2 });
  });

  it("exports jpg with the jpeg mime and quality", async () => {
    const { stage, toBlob } = makeStage(1);
    await exportStage(stage, "jpg");
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.92);
  });

  it("exports png with the png mime and no quality", async () => {
    const { stage, toBlob } = makeStage(1);
    await exportStage(stage, "png");
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png", undefined);
  });

  it("triggers a download", async () => {
    const { stage } = makeStage(1);
    await exportStage(stage, "png");
    const anchor = document.createElement("a") as unknown as HTMLAnchorElement;
    expect((anchor as unknown as { click: ReturnType<typeof vi.fn> }).click).toHaveBeenCalled();
  });

  it("uses the prefix in the download filename", async () => {
    const { stage } = makeStage(1);
    await exportStage(stage, "png", "grid-reveal");
    const anchor = document.createElement("a") as unknown as HTMLAnchorElement;
    expect(anchor.download.startsWith("grid-reveal-")).toBe(true);
    expect(anchor.download.endsWith(".png")).toBe(true);
  });

  it("defaults to the swap-collage prefix", async () => {
    const { stage } = makeStage(1);
    await exportStage(stage, "png");
    const anchor = document.createElement("a") as unknown as HTMLAnchorElement;
    expect(anchor.download.startsWith("swap-collage-")).toBe(true);
  });
});

type BlobCallback = (blob: Blob | null) => void;

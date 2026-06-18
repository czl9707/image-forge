# Collage Studio — P2 Swap Collage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real generator — "swap collage" — drop two images, pan/zoom each independently, draw one shared swap mask, see the live swapped collage, export PNG/JPG.

**Architecture:** A generator folder `src/generators/swap-collage/` with `SwapCollageProvider` (state: `useReducer` for layout/mask/transforms + `useImageBitmap`×2 for image decode), `SwapCollagePreview` (a single Konva `<Stage>` that is both preview and export source — responsive via ResizeObserver, exported at full logical resolution via `pixelRatio`), and `SwapCollageControls` (right panel). Pure helpers (`geometry`, `fit`, generator-local `dimensions`) compute the numbers fed to Konva. Upload lives on the tiles (empty tile = dropzone). Registered in `registry` → reachable at `/swap-collage`; the P1 shell, routing, theme, and `react-konva` test mock are reused.

**Tech Stack:** Vite + React 19 + TypeScript, Tailwind v4 + shadcn/ui (Tabs, Select, Button, Label, sonner), `konva@10` + `react-konva@19` (rendering, already installed), `react-router@8` (routing, reused), vitest + `@testing-library/react` + jsdom. **No new packages.**

**Reference spec:** `docs/superpowers/specs/2026-06-17-collage-studio-swap-collage-p2-design.md`.

---

## Prerequisite

We are on branch `feat/collage-studio-p2-swap-collage` (off `feat/collage-studio-p1-shell-routing`, which includes P0 + P1 + the v2 design + the P2 spec). If executing via subagent-driven-development, it manages the worktree/branch; otherwise continue on this branch.

## File Structure (this phase)

- **Modify:** `src/test/setup.ts` — add `ResizeObserver` mock + `Transformer` to the `react-konva` mock.
- **Create:** `src/lib/geometry.ts` — `Rect`, `clampRect`, `toPixels` (pure).
- **Create:** `src/lib/canvas/fit.ts` — `coverFit` (pure).
- **Create:** `src/hooks/useImageBitmap.ts` — `File → ImageBitmap` + status.
- **Create:** `src/components/shared/ImageDropzone.tsx` — drag-drop / click-to-browse slot.
- **Create:** `src/export.ts` — `stage.toCanvas({pixelRatio}) → toBlob → download`.
- **Create:** `src/generators/swap-collage/swapReducer.ts` — pure reducer + types.
- **Create:** `src/generators/swap-collage/dimensions.ts` — `canvasDims`, `tileLayout`, `containFit` (pure).
- **Create:** `src/generators/swap-collage/SwapCollageProvider.tsx` — context + `useSwapCollage`.
- **Create:** `src/generators/swap-collage/SwapCollageControls.tsx` — right panel.
- **Create:** `src/generators/swap-collage/SwapCollagePreview.tsx` — the Konva `<Stage>`.
- **Create:** `src/generators/swap-collage/index.ts` — registry entry.
- **Modify:** `src/app/registry.ts` — append `swap-collage`.
- **Modify:** `src/main.tsx` — mount `<Toaster />` (currently absent; needed for `toast()` to display).

---

### Task 1: Test infrastructure — `ResizeObserver` + `Transformer` mock

The preview sizes its `<Stage>` from a `ResizeObserver`, and renders a Konva `<Transformer>` — neither exists in jsdom. Add both to the global test setup.

**Files:**
- Modify: `src/test/setup.ts`

- [ ] **Step 1: Replace `src/test/setup.ts`**

```ts
// src/test/setup.ts
import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// jsdom does not implement matchMedia; the shadcn Sidebar (useIsMobile) and
// next-themes (system theme resolution) both read it. Desktop + "light" default.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom does not implement ResizeObserver; SwapCollagePreview uses it to size the Stage.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// Konva needs a real canvas, which jsdom does not provide. Replace react-konva's
// primitives with plain divs so component tests can render the shell without canvas.
vi.mock("react-konva", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const mockEl = (testId: string) =>
    React.forwardRef<HTMLDivElement, { children?: React.ReactNode; text?: string }>(
      (props, ref) =>
        React.createElement(
          "div",
          { ref, "data-testid": testId },
          props.children ?? props.text ?? null,
        ),
    );
  // Transformer is special: the preview calls instance methods on its ref
  // (nodes/keepRatio/getLayer). Expose no-op stubs via imperativeHandle so the
  // selection-binding effect doesn't throw under the jsdom mock.
  const Transformer = React.forwardRef<
    Record<string, (...args: never[]) => void>,
    { children?: React.ReactNode }
  >((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      nodes: () => {},
      keepRatio: () => {},
      getLayer: () => ({ batchDraw: () => {} }),
    }));
    return React.createElement(
      "div",
      { "data-testid": "konva-transformer" },
      props.children,
    );
  });

  return {
    Stage: mockEl("konva-stage"),
    Layer: mockEl("konva-layer"),
    Rect: mockEl("konva-rect"),
    Text: mockEl("konva-text"),
    Image: mockEl("konva-image"),
    Line: mockEl("konva-line"),
    Group: mockEl("konva-group"),
    Transformer,
  };
});
```

- [ ] **Step 2: Verify the existing suite is still green (mocks are inert until used)**

Run: `npm test`
Expected: PASS — all existing tests (registry, App shell, ModeToggle, SidebarLeft, SidebarRight, PlaceholderGenerator, StudioShell) still pass.

- [ ] **Step 3: Commit**

```bash
git add src/test/setup.ts
git commit -m "test(p2): mock ResizeObserver and add Transformer to react-konva mock"
```

---

### Task 2: Pure helper — `geometry.ts` (TDD)

Normalized-rect math for the mask.

**Files:**
- Create: `src/lib/geometry.ts`
- Test: `src/lib/__tests__/geometry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/geometry.test.ts
import { describe, expect, it } from "vitest";
import { clampRect, toPixels, type Rect } from "../geometry";

describe("clampRect", () => {
  it("passes through an in-bounds rect", () => {
    expect(clampRect({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 0.05)).toEqual({
      x: 0.2,
      y: 0.2,
      w: 0.5,
      h: 0.5,
    });
  });

  it("enforces a minimum size", () => {
    const r = clampRect({ x: 0.5, y: 0.5, w: 0.01, h: 0.01 }, 0.1);
    expect(r.w).toBe(0.1);
    expect(r.h).toBe(0.1);
  });

  it("clamps width/height to 1", () => {
    const r = clampRect({ x: 0, y: 0, w: 2, h: 3 }, 0.05);
    expect(r.w).toBe(1);
    expect(r.h).toBe(1);
  });

  it("keeps the rect inside [0,1] after resizing", () => {
    // w=0.8, x=0.5 would overflow; x clamps to 1-0.8=0.2
    const r = clampRect({ x: 0.5, y: 0, w: 0.8, h: 0.2 }, 0.05);
    expect(r.x).toBe(0.2);
    expect(r.x + r.w).toBeLessThanOrEqual(1.0000001);
  });
});

describe("toPixels", () => {
  it("scales a normalized rect to pixels", () => {
    const r: Rect = { x: 0.5, y: 0.25, w: 0.5, h: 0.5 };
    expect(toPixels(r, 1000, 800)).toEqual({
      x: 500,
      y: 200,
      w: 500,
      h: 400,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/geometry.test.ts`
Expected: FAIL — "Cannot find module '../geometry'".

- [ ] **Step 3: Create `src/lib/geometry.ts`**

```ts
// src/lib/geometry.ts
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Clamp a normalized ([0,1]) rect so it stays in bounds with at least `min`
 * width/height. Used for the swap mask.
 */
export function clampRect(r: Rect, min: number): Rect {
  const w = Math.max(min, Math.min(r.w, 1));
  const h = Math.max(min, Math.min(r.h, 1));
  const x = Math.max(0, Math.min(r.x, 1 - w));
  const y = Math.max(0, Math.min(r.y, 1 - h));
  return { x, y, w, h };
}

/** Map a normalized rect to pixel coords for a box of (w, h). */
export function toPixels(r: Rect, w: number, h: number): Rect {
  return { x: r.x * w, y: r.y * h, w: r.w * w, h: r.h * h };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/geometry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry.ts src/lib/__tests__/geometry.test.ts
git commit -m "feat(p2): geometry helpers (clampRect, toPixels)"
```

---

### Task 3: Pure helper — `canvas/fit.ts` (TDD)

Cover-fit placement for an image inside a box.

**Files:**
- Create: `src/lib/canvas/fit.ts`
- Test: `src/lib/canvas/__tests__/fit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/canvas/__tests__/fit.test.ts
import { describe, expect, it } from "vitest";
import { coverFit } from "../fit";

describe("coverFit", () => {
  it("scales to cover the box (picks the larger scale)", () => {
    // image 200x100, box 100x100 → need scale 1 (width-limited? max(0.5,1)=1)
    const f = coverFit(200, 100, 100, 100);
    expect(f.scale).toBe(1);
    expect(f.x).toBe(-50); // drawW=200 centered in 100 → (100-200)/2
    expect(f.y).toBe(0);
  });

  it("scales a landscape image into a portrait box", () => {
    // image 400x200, box 100x200 → max(100/400, 200/200)=1 → drawW=400,drawH=200
    const f = coverFit(400, 200, 100, 200);
    expect(f.scale).toBe(1);
    expect(f.x).toBe(-150); // (100-400)/2
    expect(f.y).toBe(0);
  });

  it("upscales a small image to cover", () => {
    // image 50x50, box 100x100 → scale 2
    const f = coverFit(50, 50, 100, 100);
    expect(f.scale).toBe(2);
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/canvas/__tests__/fit.test.ts`
Expected: FAIL — "Cannot find module '../fit'".

- [ ] **Step 3: Create `src/lib/canvas/fit.ts`**

```ts
// src/lib/canvas/fit.ts
export interface Fit {
  scale: number;
  x: number;
  y: number;
}

/**
 * Cover-fit: scale an (iw × ih) image so it fully covers a (boxW × boxH) box,
 * centered. Returns the uniform scale and the centered top-left position.
 */
export function coverFit(
  iw: number,
  ih: number,
  boxW: number,
  boxH: number,
): Fit {
  const scale = Math.max(boxW / iw, boxH / ih);
  const drawW = iw * scale;
  const drawH = ih * scale;
  return { scale, x: (boxW - drawW) / 2, y: (boxH - drawH) / 2 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/canvas/__tests__/fit.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/fit.ts src/lib/canvas/__tests__/fit.test.ts
git commit -m "feat(p2): coverFit placement helper"
```

---

### Task 4: `useImageBitmap` hook (TDD)

Decode a `File` into an `ImageBitmap`, exposing a status lifecycle. Used twice by the provider (one per image).

**Files:**
- Create: `src/hooks/useImageBitmap.ts`
- Test: `src/hooks/__tests__/useImageBitmap.test.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// src/hooks/__tests__/useImageBitmap.test.ts
import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useImageBitmap } from "../useImageBitmap";

const fakeBitmap = { width: 100, height: 50 };

beforeEach(() => {
  globalThis.createImageBitmap = vi
    .fn()
    .mockResolvedValue(fakeBitmap) as unknown as typeof createImageBitmap;
});

describe("useImageBitmap", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useImageBitmap());
    expect(result.current.status).toBe("idle");
    expect(result.current.bitmap).toBeNull();
  });

  it("rejects a non-image file without decoding", async () => {
    const { result } = renderHook(() => useImageBitmap());
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    await act(async () => {
      await result.current.load(file);
    });
    expect(result.current.status).toBe("error");
    expect(globalThis.createImageBitmap).not.toHaveBeenCalled();
  });

  it("decodes an image file to ready", async () => {
    const { result } = renderHook(() => useImageBitmap());
    const file = new File(["x"], "a.png", { type: "image/png" });
    await act(async () => {
      await result.current.load(file);
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.bitmap).toBe(fakeBitmap);
  });

  it("surfaces a decode error", async () => {
    globalThis.createImageBitmap = vi
      .fn()
      .mockRejectedValue(new Error("bad")) as unknown as typeof createImageBitmap;
    const { result } = renderHook(() => useImageBitmap());
    const file = new File(["x"], "a.png", { type: "image/png" });
    await act(async () => {
      await result.current.load(file);
    });
    expect(result.current.status).toBe("error");
    expect(result.current.bitmap).toBeNull();
  });

  it("reset returns to idle", async () => {
    const { result } = renderHook(() => useImageBitmap());
    const file = new File(["x"], "a.png", { type: "image/png" });
    await act(async () => {
      await result.current.load(file);
    });
    act(() => result.current.reset());
    expect(result.current.status).toBe("idle");
    expect(result.current.bitmap).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useImageBitmap.test.ts`
Expected: FAIL — "Cannot find module '../useImageBitmap'".

- [ ] **Step 3: Create `src/hooks/useImageBitmap.ts`**

```ts
// src/hooks/useImageBitmap.ts
import { useCallback, useState } from "react";

export type ImgStatus = "idle" | "loading" | "ready" | "error";

export interface UseImageBitmap {
  bitmap: ImageBitmap | null;
  status: ImgStatus;
  error: string | null;
  load: (file: File) => Promise<void>;
  reset: () => void;
}

export function useImageBitmap(): UseImageBitmap {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [status, setStatus] = useState<ImgStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (file: File) => {
    setStatus("loading");
    setError(null);
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Not an image file");
      }
      const bmp = await createImageBitmap(file);
      setBitmap(bmp);
      setStatus("ready");
    } catch (e) {
      setBitmap(null);
      setError(e instanceof Error ? e.message : "Failed to load image");
      setStatus("error");
    }
  }, []);

  const reset = useCallback(() => {
    setBitmap(null);
    setStatus("idle");
    setError(null);
  }, []);

  return { bitmap, status, error, load, reset };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useImageBitmap.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useImageBitmap.ts src/hooks/__tests__/useImageBitmap.test.ts
git commit -m "feat(p2): useImageBitmap hook"
```

---

### Task 5: `ImageDropzone` component (TDD)

A presentational drag-drop / click-to-browse slot. Rejects non-images with a sonner toast; forwards valid files via `onFile`. Reused over the empty tiles.

**Files:**
- Create: `src/components/shared/ImageDropzone.tsx`
- Test: `src/components/shared/__tests__/ImageDropzone.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/shared/__tests__/ImageDropzone.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageDropzone } from "../ImageDropzone";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { toast } from "sonner";

describe("ImageDropzone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the idle prompt", () => {
    render(<ImageDropzone status="idle" onFile={() => {}} />);
    expect(screen.getByText(/drop an image/i)).toBeInTheDocument();
  });

  it("forwards a valid image file via onFile", async () => {
    const user = userEvent.setup();
    const onFile = vi.fn();
    render(<ImageDropzone status="idle" onFile={onFile} />);
    const input = screen.getByLabelText(/drop an image/i) as HTMLInputElement;
    const file = new File(["x"], "a.png", { type: "image/png" });
    await user.upload(input, file);
    expect(onFile).toHaveBeenCalledWith(file);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("rejects a non-image file with a toast and does not call onFile", async () => {
    const user = userEvent.setup();
    const onFile = vi.fn();
    render(<ImageDropzone status="idle" onFile={onFile} />);
    const input = screen.getByLabelText(/drop an image/i) as HTMLInputElement;
    await user.upload(input, new File(["x"], "a.txt", { type: "text/plain" }));
    expect(onFile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("shows an error state", () => {
    render(<ImageDropzone status="error" error="bad" onFile={() => {}} />);
    expect(screen.getByText(/bad/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/shared/__tests__/ImageDropzone.test.tsx`
Expected: FAIL — "Cannot find module '../ImageDropzone'".

- [ ] **Step 3: Create `src/components/shared/ImageDropzone.tsx`**

```tsx
// src/components/shared/ImageDropzone.tsx
import { useRef, type DragEvent } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ImgStatus } from "@/hooks/useImageBitmap";

interface ImageDropzoneProps {
  status: ImgStatus;
  error?: string | null;
  onFile: (file: File) => void;
  className?: string;
}

export function ImageDropzone({
  status,
  error,
  onFile,
  className,
}: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    onFile(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 p-4 text-center text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50",
        status === "error" && "border-destructive/50 text-destructive",
        className,
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <Upload className="size-6" />
      {status === "loading" && <span>Decoding…</span>}
      {status === "error" && <span>{error ?? "Could not load image"}</span>}
      {(status === "idle" || status === "ready") && (
        <>
          <span>Drop an image, or click to browse</span>
          <button
            type="button"
            className="text-xs underline"
            onClick={() => inputRef.current?.click()}
          >
            choose file
          </button>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Drop an image, or click to browse"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/shared/__tests__/ImageDropzone.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/ImageDropzone.tsx src/components/shared/__tests__/ImageDropzone.test.tsx
git commit -m "feat(p2): ImageDropzone shared upload slot"
```

---

### Task 6: `export.ts` (TDD)

Export the Konva stage to a PNG/JPG download at the logical resolution.

**Files:**
- Create: `src/export.ts`
- Test: `src/__tests__/export.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/export.test.ts
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
    const anchor = {
      click: vi.fn(),
      href: "",
      download: "",
    } as unknown as HTMLAnchorElement;
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
});

type BlobCallback = (blob: Blob | null) => void;
```

> Note: the last assertion re-fetches the anchor via the same mocked `createElement`; the mock returns the same anchor instance (vi.fn default return is `undefined`, so replace the mock with one that returns a stable anchor if the assertion is flaky — see Step 3's implementation, which is what the test drives).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/export.test.ts`
Expected: FAIL — "Cannot find module '../export'".

- [ ] **Step 3: Create `src/export.ts`**

```ts
// src/export.ts
export type ExportFormat = "png" | "jpg";

/** Minimal slice of Konva.Stage that export needs (keeps this module testable). */
export interface ExportableStage {
  scaleX(): number;
  toCanvas(opts?: { pixelRatio?: number }): HTMLCanvasElement;
}

export async function exportStage(
  stage: ExportableStage,
  format: ExportFormat,
): Promise<void> {
  // The on-screen stage is scaled down from the logical size; invert it so the
  // exported canvas is exactly the logical (export) resolution.
  const pixelRatio = 1 / stage.scaleX();
  const canvas = stage.toCanvas({ pixelRatio });
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const quality = format === "jpg" ? 0.92 : undefined;

  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, filename(format));
      resolve();
    }, mime, quality);
  });
}

function filename(format: ExportFormat): string {
  return `swap-collage-${Date.now()}.${format}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/export.test.ts`

If the "triggers a download" assertion is flaky (because `vi.spyOn(...).mockReturnValue` returns a fresh value per call), replace the `document.createElement` mock in the test with a stable anchor:
```ts
const anchor = { click: vi.fn(), href: "", download: "", remove: vi.fn() } as unknown as HTMLAnchorElement;
vi.spyOn(document, "createElement").mockReturnValue(anchor);
```
and assert `(anchor as any).click` directly.

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/export.ts src/__tests__/export.test.ts
git commit -m "feat(p2): stage export to PNG/JPG download"
```

---

### Task 7: Pure reducer — `swapReducer.ts` (TDD)

Layout/mask/transform state as a pure reducer (image bitmaps are held separately by the provider's `useImageBitmap` hooks).

**Files:**
- Create: `src/generators/swap-collage/swapReducer.ts`
- Test: `src/generators/swap-collage/__tests__/swapReducer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
    expect(initialSwapState.orientation).toBe("lr");
    expect(initialSwapState.aspect).toBe("landscape");
    expect(initialSwapState.exportSize).toBe(1080);
    expect(initialSwapState.mask).toEqual(DEFAULT_MASK);
    expect(initialSwapState.xformA.zoom).toBe(1);
    expect(initialSwapState.selection).toBeNull();
  });

  it("sets orientation", () => {
    const s = swapReducer(initialSwapState, {
      type: "SET_ORIENTATION",
      orientation: "tb",
    } as SwapAction);
    expect(s.orientation).toBe("tb");
  });

  it("changes aspect AND re-fits both images", () => {
    const moved: SwapAction = {
      type: "SET_XFORM",
      slot: "A",
      xform: { panX: 0.5, panY: 0.5, zoom: 2 },
    };
    const after = swapReducer(
      swapReducer(initialSwapState, moved),
      { type: "SET_ASPECT", aspect: "square" } as SwapAction,
    );
    expect(after.aspect).toBe("square");
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

  it("resets the mask", () => {
    const moved = swapReducer(initialSwapState, {
      type: "SET_MASK",
      mask: { x: 0, y: 0, w: 0.2, h: 0.2 },
    } as SwapAction);
    const s = swapReducer(moved, { type: "RESET_MASK" } as SwapAction);
    expect(s.mask).toEqual(DEFAULT_MASK);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/generators/swap-collage/__tests__/swapReducer.test.ts`
Expected: FAIL — "Cannot find module '../swapReducer'".

- [ ] **Step 3: Create `src/generators/swap-collage/swapReducer.ts`**

```ts
// src/generators/swap-collage/swapReducer.ts
import { clampRect, type Rect } from "@/lib/geometry";

export type Orientation = "lr" | "tb";
export type AspectId = "square" | "landscape" | "portrait";
export type Selection = "imgA" | "imgB" | "mask" | null;
export type Slot = "A" | "B";

export interface Transform {
  panX: number; // fraction of tile width (0 = cover-centered)
  panY: number; // fraction of tile height
  zoom: number; // multiplier of cover scale (1 = cover)
}

export type Mask = Rect; // normalized [0,1] per-tile

export interface SwapState {
  orientation: Orientation;
  aspect: AspectId;
  exportSize: number; // long-edge px
  mask: Mask;
  xformA: Transform;
  xformB: Transform;
  selection: Selection;
}

export const MASK_MIN = 0.05;
export const DEFAULT_MASK: Mask = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
export const IDENTITY_XFORM: Transform = { panX: 0, panY: 0, zoom: 1 };

export const initialSwapState: SwapState = {
  orientation: "lr",
  aspect: "landscape",
  exportSize: 1080,
  mask: DEFAULT_MASK,
  xformA: { ...IDENTITY_XFORM },
  xformB: { ...IDENTITY_XFORM },
  selection: null,
};

export type SwapAction =
  | { type: "SET_ORIENTATION"; orientation: Orientation }
  | { type: "SET_ASPECT"; aspect: AspectId }
  | { type: "SET_EXPORT_SIZE"; size: number }
  | { type: "SET_MASK"; mask: Mask }
  | { type: "SET_XFORM"; slot: Slot; xform: Transform }
  | { type: "SET_SELECTION"; selection: Selection }
  | { type: "RESET_MASK" }
  | { type: "RESET_XFORM"; slot: Slot };

export function swapReducer(state: SwapState, action: SwapAction): SwapState {
  switch (action.type) {
    case "SET_ORIENTATION":
      return { ...state, orientation: action.orientation };
    case "SET_ASPECT":
      // Window shape changed → re-cover both images.
      return {
        ...state,
        aspect: action.aspect,
        xformA: { ...IDENTITY_XFORM },
        xformB: { ...IDENTITY_XFORM },
      };
    case "SET_EXPORT_SIZE":
      return { ...state, exportSize: action.size };
    case "SET_MASK":
      return { ...state, mask: clampRect(action.mask, MASK_MIN) };
    case "SET_XFORM":
      return action.slot === "A"
        ? { ...state, xformA: action.xform }
        : { ...state, xformB: action.xform };
    case "SET_SELECTION":
      return { ...state, selection: action.selection };
    case "RESET_MASK":
      return { ...state, mask: DEFAULT_MASK };
    case "RESET_XFORM":
      return action.slot === "A"
        ? { ...state, xformA: { ...IDENTITY_XFORM } }
        : { ...state, xformB: { ...IDENTITY_XFORM } };
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/generators/swap-collage/__tests__/swapReducer.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/swapReducer.ts src/generators/swap-collage/__tests__/swapReducer.test.ts
git commit -m "feat(p2): swapCollage reducer + state types"
```

---

### Task 8: Pure layout helpers — `dimensions.ts` (TDD)

Map aspect/orientation/size to canvas + tile pixel geometry, and contain-fit the logical canvas into a display box.

**Files:**
- Create: `src/generators/swap-collage/dimensions.ts`
- Test: `src/generators/swap-collage/__tests__/dimensions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/generators/swap-collage/__tests__/dimensions.test.ts
import { describe, expect, it } from "vitest";
import { canvasDims, tileLayout, containFit } from "../dimensions";

describe("canvasDims", () => {
  it("square = long edge both", () => {
    expect(canvasDims("square", 1080)).toEqual({ cw: 1080, ch: 1080 });
  });
  it("landscape = wide", () => {
    expect(canvasDims("landscape", 1080)).toEqual({ cw: 1080, ch: 608 });
  });
  it("portrait = tall", () => {
    expect(canvasDims("portrait", 1080)).toEqual({ cw: 608, ch: 1080 });
  });
});

describe("tileLayout", () => {
  it("lr splits horizontally", () => {
    const t = tileLayout("lr", { cw: 1000, ch: 600 });
    expect(t.tileW).toBe(500);
    expect(t.tileH).toBe(600);
    expect(t.A).toEqual({ x: 0, y: 0 });
    expect(t.B).toEqual({ x: 500, y: 0 });
  });
  it("tb splits vertically", () => {
    const t = tileLayout("tb", { cw: 1000, ch: 600 });
    expect(t.tileW).toBe(1000);
    expect(t.tileH).toBe(300);
    expect(t.A).toEqual({ x: 0, y: 0 });
    expect(t.B).toEqual({ x: 0, y: 300 });
  });
});

describe("containFit", () => {
  it("scales down to fit (width-limited)", () => {
    expect(containFit(1000, 1000, 500, 800)).toEqual({
      dispW: 500,
      dispH: 500,
      scale: 0.5,
    });
  });
  it("scales down to fit (height-limited)", () => {
    expect(containFit(1000, 1000, 800, 250)).toEqual({
      dispW: 250,
      dispH: 250,
      scale: 0.25,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/generators/swap-collage/__tests__/dimensions.test.ts`
Expected: FAIL — "Cannot find module '../dimensions'".

- [ ] **Step 3: Create `src/generators/swap-collage/dimensions.ts`**

```ts
// src/generators/swap-collage/dimensions.ts
import type { AspectId, Orientation } from "./swapReducer";

export interface Dims {
  cw: number;
  ch: number;
}

/** Logical canvas size from aspect + long-edge export size. */
export function canvasDims(aspect: AspectId, longEdge: number): Dims {
  switch (aspect) {
    case "square":
      return { cw: longEdge, ch: longEdge };
    case "landscape":
      return { cw: longEdge, ch: Math.round((longEdge * 9) / 16) };
    case "portrait":
      return { cw: Math.round((longEdge * 9) / 16), ch: longEdge };
  }
}

export interface TileLayout {
  tileW: number;
  tileH: number;
  A: { x: number; y: number };
  B: { x: number; y: number };
}

/** Equal-half tile positions in logical px. */
export function tileLayout(orientation: Orientation, { cw, ch }: Dims): TileLayout {
  if (orientation === "lr") {
    return {
      tileW: cw / 2,
      tileH: ch,
      A: { x: 0, y: 0 },
      B: { x: cw / 2, y: 0 },
    };
  }
  return {
    tileW: cw,
    tileH: ch / 2,
    A: { x: 0, y: 0 },
    B: { x: 0, y: ch / 2 },
  };
}

export interface Display {
  dispW: number;
  dispH: number;
  scale: number;
}

/** Largest uniform scale fitting the logical canvas into the available box. */
export function containFit(
  cw: number,
  ch: number,
  availW: number,
  availH: number,
): Display {
  const scale = Math.min(availW / cw, availH / ch);
  return { dispW: cw * scale, dispH: ch * scale, scale };
}
```

> `canvasDims("landscape", 1080)` → ch = round(1080·9/16) = round(607.5) = 608. That matches the test.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/generators/swap-collage/__tests__/dimensions.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/dimensions.ts src/generators/swap-collage/__tests__/dimensions.test.ts
git commit -m "feat(p2): canvas/tile/display dimension helpers"
```

---

### Task 9: `SwapCollageProvider` (TDD)

Wires two `useImageBitmap` hooks (one per image) + the reducer + a shared `stageRef`, exposed through context.

**Files:**
- Create: `src/generators/swap-collage/SwapCollageProvider.tsx`
- Test: `src/generators/swap-collage/__tests__/SwapCollageProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/generators/swap-collage/__tests__/SwapCollageProvider.test.tsx`
Expected: FAIL — "Cannot find module '../SwapCollageProvider'".

- [ ] **Step 3: Create `src/generators/swap-collage/SwapCollageProvider.tsx`**

```tsx
// src/generators/swap-collage/SwapCollageProvider.tsx
import {
  createContext,
  useContext,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
  type RefObject,
} from "react";
import type Konva from "konva";
import { useImageBitmap, type ImgStatus } from "@/hooks/useImageBitmap";
import {
  initialSwapState,
  swapReducer,
  type AspectId,
  type Mask,
  type Orientation,
  type Selection,
  type Slot,
  type SwapAction,
  type SwapState,
  type Transform,
} from "./swapReducer";

export interface ImageSlot {
  bitmap: ImageBitmap | null;
  status: ImgStatus;
  error: string | null;
}

export interface SwapContextValue {
  imgA: ImageSlot;
  imgB: ImageSlot;
  loadImage: (slot: Slot, file: File) => Promise<void>;
  clearImage: (slot: Slot) => void;
  state: SwapState;
  dispatch: Dispatch<SwapAction>;
  stageRef: RefObject<Konva.Stage | null>;
}

const SwapContext = createContext<SwapContextValue | null>(null);

export function SwapCollageProvider({ children }: { children: ReactNode }) {
  const a = useImageBitmap();
  const b = useImageBitmap();
  const [state, dispatch] = useReducer(swapReducer, initialSwapState);
  const stageRef = useRef<Konva.Stage | null>(null);

  const loadImage = (slot: Slot, file: File) =>
    slot === "A" ? a.load(file) : b.load(file);
  const clearImage = (slot: Slot) =>
    slot === "A" ? a.reset() : b.reset();

  const value: SwapContextValue = {
    imgA: { bitmap: a.bitmap, status: a.status, error: a.error },
    imgB: { bitmap: b.bitmap, status: b.status, error: b.error },
    loadImage,
    clearImage,
    state,
    dispatch,
    stageRef,
  };

  return <SwapContext.Provider value={value}>{children}</SwapContext.Provider>;
}

export function useSwapCollage(): SwapContextValue {
  const ctx = useContext(SwapContext);
  if (!ctx) {
    throw new Error("useSwapCollage must be used within SwapCollageProvider");
  }
  return ctx;
}

export type {
  AspectId,
  Mask,
  Orientation,
  Selection,
  Slot,
  SwapAction,
  SwapState,
  Transform,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/generators/swap-collage/__tests__/SwapCollageProvider.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/SwapCollageProvider.tsx src/generators/swap-collage/__tests__/SwapCollageProvider.test.tsx
git commit -m "feat(p2): SwapCollageProvider context + useSwapCollage"
```

---

### Task 10: `SwapCollageControls` (TDD)

Right panel: per-image Replace/Clear + status, orientation, aspect, export size, format, reset mask, export. Mocks `useSwapCollage` so the tests can drive state directly.

**Files:**
- Create: `src/generators/swap-collage/SwapCollageControls.tsx`
- Test: `src/generators/swap-collage/__tests__/SwapCollageControls.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/generators/swap-collage/__tests__/SwapCollageControls.test.tsx`
Expected: FAIL — "Cannot find module '../SwapCollageControls'".

- [ ] **Step 3: Create `src/generators/swap-collage/SwapCollageControls.tsx`**

```tsx
// src/generators/swap-collage/SwapCollageControls.tsx
import { useRef, useState, type ChangeEvent } from "react";
import {
  Columns2,
  Download,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  Rows2,
  Square,
  Trash2,
} from "lucide-react";
import { useSwapCollage } from "./SwapCollageProvider";
import { exportStage, type ExportFormat } from "@/export";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AspectId, Orientation } from "./swapReducer";

function SlotRow({
  label,
  status,
  error,
  onReplace,
  onClear,
}: {
  label: string;
  status: string;
  error: string | null;
  onReplace: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {status === "ready" ? "loaded" : status === "error" ? error ?? "error" : status}
        </span>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onReplace}>
          Replace
        </Button>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <Trash2 /> Clear
        </Button>
      </div>
    </div>
  );
}

export function SwapCollageControls() {
  const { imgA, imgB, loadImage, clearImage, state, dispatch, stageRef } =
    useSwapCollage();
  const [format, setFormat] = useState<ExportFormat>("png");
  const fileA = useRef<HTMLInputElement>(null);
  const fileB = useRef<HTMLInputElement>(null);

  const bothReady = imgA.status === "ready" && imgB.status === "ready";

  const onPick = (slot: "A" | "B") => (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadImage(slot, f);
    e.target.value = "";
  };

  const onExport = () => {
    if (stageRef.current) exportStage(stageRef.current, format);
  };

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-auto p-4">
      <SlotRow
        label="Image A"
        status={imgA.status}
        error={imgA.error}
        onReplace={() => fileA.current?.click()}
        onClear={() => clearImage("A")}
      />
      <input ref={fileA} type="file" accept="image/*" hidden onChange={onPick("A")} />

      <SlotRow
        label="Image B"
        status={imgB.status}
        error={imgB.error}
        onReplace={() => fileB.current?.click()}
        onClear={() => clearImage("B")}
      />
      <input ref={fileB} type="file" accept="image/*" hidden onChange={onPick("B")} />

      <div className="flex flex-col gap-2">
        <Label>Orientation</Label>
        <Tabs
          value={state.orientation}
          onValueChange={(v) =>
            dispatch({
              type: "SET_ORIENTATION",
              orientation: v as Orientation,
            })
          }
        >
          <TabsList>
            <TabsTrigger value="lr">
              <Columns2 /> Left/Right
            </TabsTrigger>
            <TabsTrigger value="tb">
              <Rows2 /> Top/Bottom
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Aspect</Label>
        <Tabs
          value={state.aspect}
          onValueChange={(v) =>
            dispatch({ type: "SET_ASPECT", aspect: v as AspectId })
          }
        >
          <TabsList>
            <TabsTrigger value="square">
              <Square /> Square
            </TabsTrigger>
            <TabsTrigger value="landscape">
              <RectangleHorizontal /> 16:9
            </TabsTrigger>
            <TabsTrigger value="portrait">
              <RectangleVertical /> 9:16
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Export size</Label>
        <Select
          value={String(state.exportSize)}
          onValueChange={(v) =>
            dispatch({ type: "SET_EXPORT_SIZE", size: Number(v) })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1080">1080px</SelectItem>
            <SelectItem value="2160">2160px</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Format</Label>
        <Tabs value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
          <TabsList>
            <TabsTrigger value="png">PNG</TabsTrigger>
            <TabsTrigger value="jpg">JPG</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => dispatch({ type: "RESET_MASK" })}
      >
        <RotateCcw /> Reset mask
      </Button>

      <Button onClick={onExport} disabled={!bothReady}>
        <Download /> Export
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/generators/swap-collage/__tests__/SwapCollageControls.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/SwapCollageControls.tsx src/generators/swap-collage/__tests__/SwapCollageControls.test.tsx
git commit -m "feat(p2): SwapCollageControls right panel"
```

---

### Task 11: `SwapCollagePreview` (TDD)

The Konva `<Stage>`: two clipped tile groups (base image + swap overlay), the shared mask on a top layer, a Transformer on the selected object, empty-tile dropzones. This is the export source.

**Files:**
- Create: `src/generators/swap-collage/SwapCollagePreview.tsx`
- Test: `src/generators/swap-collage/__tests__/SwapCollagePreview.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/generators/swap-collage/__tests__/SwapCollagePreview.test.tsx`
Expected: FAIL — "Cannot find module '../SwapCollagePreview'".

- [ ] **Step 3: Create `src/generators/swap-collage/SwapCollagePreview.tsx`**

```tsx
// src/generators/swap-collage/SwapCollagePreview.tsx
import { useEffect, useRef, useState } from "react";
import {
  Group,
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
  Transformer,
} from "react-konva";
import type Konva from "konva";
import { useSwapCollage } from "./SwapCollageProvider";
import { canvasDims, containFit, tileLayout } from "./dimensions";
import { coverFit } from "@/lib/canvas/fit";
import { toPixels } from "@/lib/geometry";
import { ImageDropzone } from "@/components/shared/ImageDropzone";
import type { Slot, Transform } from "./swapReducer";

interface Placement {
  x: number;
  y: number;
  width: number;
  height: number;
}

function placement(
  iw: number,
  ih: number,
  tileW: number,
  tileH: number,
  xform: Transform,
): Placement {
  const { scale } = coverFit(iw, ih, tileW, tileH);
  const width = iw * scale * xform.zoom;
  const height = ih * scale * xform.zoom;
  return {
    width,
    height,
    x: (tileW - width) / 2 + xform.panX * tileW,
    y: (tileH - height) / 2 + xform.panY * tileH,
  };
}

/** Solve a node's geometry back to a resolution-stable transform. */
function solveXform(
  node: Konva.Image,
  iw: number,
  ih: number,
  tileW: number,
  tileH: number,
): Transform {
  const { scale } = coverFit(iw, ih, tileW, tileH);
  const width = node.width() * node.scaleX();
  const height = node.height() * node.scaleY();
  const zoom = width / (iw * scale);
  return {
    zoom,
    panX: (node.x() - (tileW - width) / 2) / tileW,
    panY: (node.y() - (tileH - height) / 2) / tileH,
  };
}

export function SwapCollagePreview() {
  const { imgA, imgB, loadImage, state, dispatch, stageRef } = useSwapCollage();
  const containerRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });

  // node refs for selection → Transformer binding
  const imgARef = useRef<Konva.Image | null>(null);
  const imgBRef = useRef<Konva.Image | null>(null);
  const maskARef = useRef<Konva.Rect | null>(null);
  const trRef = useRef<Konva.Transformer | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setAvail({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // keep the Transformer bound to the selected node
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node =
      state.selection === "imgA"
        ? imgARef.current
        : state.selection === "imgB"
          ? imgBRef.current
          : state.selection === "mask"
            ? maskARef.current
            : null;
    tr.nodes(node ? [node] : []);
    // images keep aspect (uniform zoom); the mask is a free rectangle
    tr.keepRatio(state.selection === "imgA" || state.selection === "imgB");
    tr.getLayer()?.batchDraw();
  }, [state.selection, imgA.status, imgB.status]);

  const dims = canvasDims(state.aspect, state.exportSize);
  const tiles = tileLayout(state.orientation, dims);
  const { dispW, dispH, scale } = containFit(
    dims.cw,
    dims.ch,
    avail.w || dims.cw,
    avail.h || dims.ch,
  );

  const maskPx = toPixels(state.mask, tiles.tileW, tiles.tileH);

  const selectSlot = (slot: Slot) => dispatch({ type: "SET_SELECTION", selection: slot === "A" ? "imgA" : "imgB" });
  const selectMask = () => dispatch({ type: "SET_SELECTION", selection: "mask" });
  const deselect = () => dispatch({ type: "SET_SELECTION", selection: null });

  const onImageTransform = (slot: Slot, node: Konva.Image | null) => {
    const bmp = slot === "A" ? imgA.bitmap : imgB.bitmap;
    if (!bmp) return;
    dispatch({
      type: "SET_XFORM",
      slot,
      xform: solveXform(node!, bmp.width, bmp.height, tiles.tileW, tiles.tileH),
    });
  };

  const onMaskTransform = (node: Konva.Rect | null) => {
    if (!node) return;
    const origin = tiles.A; // tile A origin is always (0,0)
    dispatch({
      type: "SET_MASK",
      mask: {
        x: (node.x() - origin.x) / tiles.tileW,
        y: (node.y() - origin.y) / tiles.tileH,
        w: node.width() * node.scaleX() / tiles.tileW,
        h: node.height() * node.scaleY() / tiles.tileH,
      },
    });
  };

  const renderTile = (
    slot: "A" | "B",
    baseBmp: ImageBitmap | null,
    otherBmp: ImageBitmap | null,
    xform: Transform,
    origin: { x: number; y: number },
    imgRef: React.RefObject<Konva.Image | null>,
  ) => {
    const base = baseBmp
      ? placement(baseBmp.width, baseBmp.height, tiles.tileW, tiles.tileH, xform)
      : null;
    const overlay = otherBmp
      ? placement(
          otherBmp.width,
          otherBmp.height,
          tiles.tileW,
          tiles.tileH,
          slot === "A" ? state.xformB : state.xformA,
        )
      : null;
    return (
      <Group
        x={origin.x}
        y={origin.y}
        clip={{ x: 0, y: 0, width: tiles.tileW, height: tiles.tileH }}
      >
        {base && (
          <KonvaImage
            ref={imgRef}
            image={baseBmp ?? undefined}
            {...base}
            draggable
            onMouseDown={() => selectSlot(slot)}
            onDragEnd={(e) => onImageTransform(slot, e.target as Konva.Image)}
            onTransformEnd={(e) => onImageTransform(slot, e.target as Konva.Image)}
          />
        )}
        {overlay && otherBmp && (
          <Group clip={{ x: maskPx.x, y: maskPx.y, width: maskPx.w, height: maskPx.h }}>
            <KonvaImage image={otherBmp} {...overlay} listening={false} />
          </Group>
        )}
      </Group>
    );
  };

  const bothReady = imgA.status === "ready" && imgB.status === "ready";

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center"
    >
      {!bothReady ? (
        <div className="flex h-full w-full gap-2">
          <ImageDropzone
            status={imgA.status}
            error={imgA.error}
            onFile={(f) => loadImage("A", f)}
          />
          <ImageDropzone
            status={imgB.status}
            error={imgB.error}
            onFile={(f) => loadImage("B", f)}
          />
        </div>
      ) : (
        <Stage
          ref={stageRef as unknown as React.Ref<Konva.Stage>}
          width={dispW}
          height={dispH}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) deselect();
          }}
        >
          <Layer>
            {renderTile("A", imgA.bitmap, imgB.bitmap, state.xformA, tiles.A, imgARef)}
            {renderTile("B", imgB.bitmap, imgA.bitmap, state.xformB, tiles.B, imgBRef)}
          </Layer>

          {/* mask UI on top, unclipped, canvas coords */}
          <Layer>
            <Rect
              ref={maskARef}
              x={tiles.A.x + maskPx.x}
              y={tiles.A.y + maskPx.y}
              width={maskPx.w}
              height={maskPx.h}
              stroke="#3b82f6"
              strokeWidth={2 / scale}
              dash={[8 / scale, 6 / scale]}
              draggable
              onMouseDown={selectMask}
              onDragEnd={(e) => onMaskTransform(e.target as Konva.Rect)}
              onTransformEnd={(e) => onMaskTransform(e.target as Konva.Rect)}
            />
            <Rect
              x={tiles.B.x + maskPx.x}
              y={tiles.B.y + maskPx.y}
              width={maskPx.w}
              height={maskPx.h}
              stroke="#3b82f6"
              strokeWidth={2 / scale}
              dash={[8 / scale, 6 / scale]}
              listening={false}
            />
          </Layer>

          <Layer>
            <Transformer
              ref={trRef as unknown as React.Ref<Konva.Transformer>}
              rotateEnabled={false}
              flipEnabled={false}
              boundBoxFunc={(_oldBox, newBox) => {
                // min size guard for the mask; images keep ratio via keepRatio
                if (newBox.width < 10 || newBox.height < 10) return _oldBox;
                return newBox;
              }}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}
```

> The Transformer enforces **uniform zoom on images** (`keepRatio(true)`) and a **free rectangle on the mask** (`keepRatio(false)`), set per-selection in the binding effect above. Selection / drag / transform round-trip is verified in the manual smoke (Task 13), not by the jsdom test, since Konva interaction is not headless-testable.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/generators/swap-collage/__tests__/SwapCollagePreview.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/SwapCollagePreview.tsx src/generators/swap-collage/__tests__/SwapCollagePreview.test.tsx
git commit -m "feat(p2): SwapCollagePreview Konva stage (tiles, swap, mask, selection)"
```

---

### Task 12: Register `swap-collage` + mount `<Toaster />`

Wire the generator into the registry (→ `/swap-collage`) and mount the sonner `<Toaster />` so `toast()` calls display (P1 never mounted it).

**Files:**
- Create: `src/generators/swap-collage/index.ts`
- Modify: `src/app/registry.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Create `src/generators/swap-collage/index.ts`**

```ts
// src/generators/swap-collage/index.ts
import type { Generator } from "@/app/registry";
import { Images } from "lucide-react";
import { SwapCollageControls } from "./SwapCollageControls";
import { SwapCollagePreview } from "./SwapCollagePreview";
import { SwapCollageProvider } from "./SwapCollageProvider";

export const swapCollageGenerator: Generator = {
  id: "swap-collage",
  name: "Swap Collage",
  icon: Images,
  Preview: SwapCollagePreview,
  Controls: SwapCollageControls,
  Provider: SwapCollageProvider,
};
```

- [ ] **Step 2: Append it to `src/app/registry.ts`**

Change the registry array to include the new generator. Replace the `registry` declaration:

```ts
// src/app/registry.ts
import type { FC, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Layers } from "lucide-react";
import {
  PlaceholderControls,
  PlaceholderPreview,
} from "../generators/placeholder/PlaceholderGenerator";
import { swapCollageGenerator } from "../generators/swap-collage";

export type Generator = {
  id: string;
  name: string;
  icon?: LucideIcon;
  Preview: FC;
  Controls: FC;
  Provider?: FC<{ children: ReactNode }>;
};

export const registry: Generator[] = [
  {
    id: "placeholder",
    name: "Placeholder",
    icon: Layers,
    Preview: PlaceholderPreview,
    Controls: PlaceholderControls,
  },
  swapCollageGenerator,
];
```

- [ ] **Step 3: Mount `<Toaster />` in `src/main.tsx`**

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  </StrictMode>,
);
```

- [ ] **Step 4: Verify the registry + App tests still pass**

Run: `npx vitest run src/app/__tests__/registry.test.ts src/app/__tests__/App.test.tsx`
Expected: PASS — the registry test (generic: non-empty, unique ids, name/Preview/Controls) and App routing test both still pass with two generators.

- [ ] **Step 5: Commit**

```bash
git add src/generators/swap-collage/index.ts src/app/registry.ts src/main.tsx
git commit -m "feat(p2): register swap-collage generator; mount Toaster"
```

---

### Task 13: Full suite + typecheck + build + manual smoke

**Files:** none new.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all PASS — every prior task's tests, plus the existing P1 suite. No regressions.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If the `stageRef`/`Transformer` ref casts flag anything, adjust the `as unknown as React.Ref<…>` casts in `SwapCollagePreview.tsx` — they bridge react-konva's ref types and are intentional.)

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (bundles the swap-collage generator).

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`, open http://localhost:5173, then confirm:
- `/` redirects to the first generator; the left nav now lists **Placeholder** and **Swap Collage**. Click **Swap Collage** → `/swap-collage`; breadcrumb reads "Collage Studio / Swap Collage".
- With no images: the center shows two dashed dropzones ("Drop an image, or click to browse").
- Drop/click two images → both cover-fit; the swapped collage renders (each tile shows the other image inside the shared mask rectangle).
- **Select + transform:** click image A → handles appear; drag the body to pan, drag a corner to zoom (uniform — no distortion). Repeat for image B (independent). Click the mask → free-rectangle handles; drag to move, drag a corner to resize. Click empty canvas to deselect. Both tiles update live from the one mask.
- Orientation (Left/Right ↔ Top/Bottom), Aspect (Square / 16:9 / 9:16 — changing it re-covers both images), Export size (1080 / 2160) all update the canvas.
- **Export:** with both images loaded, Export downloads a file at the chosen size/format (PNG or JPG). With fewer than two images, Export is disabled.
- Drop a non-image file → a toast "Please choose an image file" appears; nothing loads.
- Theme toggle still works; right panel scrolls if the window is short.

- [ ] **Step 5: Commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "test(p2): swap-collage acceptance fixes"
```

(Skip if Steps 1–3 passed with no changes.)

---

## P2 Acceptance

- Drop two images onto the tiles → both cover-fit; the swapped collage is visible live.
- Pan/zoom each image independently (select + handles); move/resize the mask; both tiles update live from one shared mask.
- Orientation / aspect / export size / format controls all work; changing aspect re-fits the images.
- **Export** downloads a correct PNG or JPG at the chosen resolution; disabled until both images are ready.
- Non-image → toast; decode failure → slot error state + export disabled.
- `swap-collage` is registered → reachable at `/swap-collage`; nav link + breadcrumb reflect it.
- `npm test` green; `tsc --noEmit` clean; `npm run build` succeeds.

## Handoff to P3 (not in this plan)

Optional polish: Playwright smoke (upload 2 → drag mask → export); mask shift-drag aspect-constrain; per-image rotation; filters / multiple masks / presets (v2 §2 "out of v1"). The shell, routing, theming, registry, and test mocks are reused unchanged.

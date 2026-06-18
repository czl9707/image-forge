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

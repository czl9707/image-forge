// src/test/setup.ts
import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver, which Radix's Select/Switch depend on at mount.
// A no-op stub is sufficient for these controlled-component tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

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

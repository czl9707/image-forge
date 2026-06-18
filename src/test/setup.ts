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
  return {
    Stage: mockEl("konva-stage"),
    Layer: mockEl("konva-layer"),
    Rect: mockEl("konva-rect"),
    Text: mockEl("konva-text"),
    Image: mockEl("konva-image"),
    Line: mockEl("konva-line"),
    Group: mockEl("konva-group"),
  };
});

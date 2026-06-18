import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaceholderControls, PlaceholderPreview } from "../PlaceholderGenerator";

describe("PlaceholderPreview", () => {
  it("renders a Konva stage", () => {
    render(<PlaceholderPreview />);
    expect(screen.getByTestId("konva-stage")).toBeInTheDocument();
  });

  it("shows a placeholder label", () => {
    render(<PlaceholderPreview />);
    expect(screen.getByText("Preview area")).toBeInTheDocument();
  });
});

describe("PlaceholderControls", () => {
  it("renders the operations label", () => {
    render(<PlaceholderControls />);
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });
});

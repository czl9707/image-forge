import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { StudioShell } from "../StudioShell";
import { registry } from "../registry";

function renderShellAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StudioShell />
    </MemoryRouter>,
  );
}

describe("StudioShell", () => {
  it("shows the active generator's name in the breadcrumb", () => {
    renderShellAt("/placeholder");
    const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(breadcrumb).toHaveTextContent(registry[0].name);
  });

  it("renders the active generator's Preview and Controls", () => {
    renderShellAt("/placeholder");
    expect(screen.getByText("Preview area")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("renders the theme toggle in the header", () => {
    renderShellAt("/placeholder");
    expect(
      screen.getByRole("button", { name: "Toggle theme" }),
    ).toBeInTheDocument();
  });
});

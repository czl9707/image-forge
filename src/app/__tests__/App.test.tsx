import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "../App";
import { registry } from "../registry";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routing + shell", () => {
  it("redirects '/' to the first generator", () => {
    renderAt("/");
    const breadcrumb = screen.getByRole("navigation", { name: "breadcrumb" });
    expect(breadcrumb).toHaveTextContent(registry[0].name);
  });

  it("renders the active generator's preview and operations", () => {
    renderAt("/placeholder");
    expect(screen.getByText("Preview area")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("renders a nav link per registry entry", () => {
    renderAt("/placeholder");
    expect(
      screen.getAllByRole("link", { name: registry[0].name }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders the theme toggle in the header", () => {
    renderAt("/placeholder");
    expect(
      screen.getByRole("button", { name: "Toggle theme" }),
    ).toBeInTheDocument();
  });
});

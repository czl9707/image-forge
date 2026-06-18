import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SidebarLeft } from "../sidebar-left";
import { registry } from "@/app/registry";

function renderLeft() {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <SidebarLeft />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

describe("SidebarLeft", () => {
  it("renders a nav link to each registry generator", () => {
    renderLeft();
    for (const g of registry) {
      expect(screen.getByRole("link", { name: g.name })).toHaveAttribute(
        "href",
        `/${g.id}`,
      );
    }
  });

  it("shows the Collage Studio brand", () => {
    renderLeft();
    expect(screen.getByText("Collage Studio")).toBeInTheDocument();
  });
});

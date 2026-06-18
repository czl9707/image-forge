import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SidebarRight } from "../sidebar-right";

describe("SidebarRight", () => {
  it("renders its children as the operations content", () => {
    render(
      <MemoryRouter>
        <SidebarProvider>
          <SidebarRight>
            <div>ops content</div>
          </SidebarRight>
        </SidebarProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("ops content")).toBeInTheDocument();
  });
});

import { describe, expect, it, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../theme-provider";
import { ModeToggle } from "../mode-toggle";

afterEach(() => {
  document.documentElement.classList.remove("dark", "light");
  // next-themes persists the chosen theme to localStorage; clear it so tests
  // don't bleed state into each other.
  localStorage.clear();
});

describe("ModeToggle", () => {
  it("renders a single toggle button", () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <ModeToggle />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  });

  it("flips light → dark on click (toggles the .dark class on <html>)", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <ModeToggle />
      </ThemeProvider>,
    );
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});

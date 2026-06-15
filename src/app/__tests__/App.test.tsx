import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";

describe("App shell", () => {
  it("renders nav from registry", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Placeholder" })).toBeInTheDocument();
  });

  it("renders the active generator's Preview and Controls", () => {
    render(<App />);
    expect(screen.getByText("Preview area")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("switches active generator on nav click", async () => {
    const user = userEvent.setup();
    render(<App />);
    const btn = screen.getByRole("button", { name: "Placeholder" });
    await user.click(btn);
    // still rendered (single generator); assert no crash + still present
    expect(screen.getByText("Preview area")).toBeInTheDocument();
  });
});

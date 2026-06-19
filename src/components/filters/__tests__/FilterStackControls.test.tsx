import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterStackControls } from "../FilterStackControls";
import { DEFAULT_STACK, makeFilter } from "@/lib/filters";

describe("FilterStackControls", () => {
  it("renders a row per filter in the stack", () => {
    render(<FilterStackControls stack={DEFAULT_STACK} onChange={() => {}} />);
    expect(screen.getByText("Blur")).toBeTruthy();
    expect(screen.getByText("Brightness")).toBeTruthy();
    expect(screen.getByText("Hue")).toBeTruthy();
  });

  it("clicking remove calls onChange without that filter", () => {
    const onChange = vi.fn();
    render(<FilterStackControls stack={DEFAULT_STACK} onChange={onChange} />);
    fireEvent.click(screen.getAllByLabelText("Remove filter")[0]);
    expect(onChange).toHaveBeenCalledWith(
      DEFAULT_STACK.filter((f) => f.id !== "blur"),
    );
  });

  it("toggling a switch flips enabled for that filter", () => {
    const onChange = vi.fn();
    render(<FilterStackControls stack={DEFAULT_STACK} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Toggle Blur"));
    const next = onChange.mock.calls[0][0];
    expect(next.find((f: { id: string; enabled: boolean }) => f.id === "blur").enabled).toBe(false);
  });

  it("shows colorize controls only on the hue row", () => {
    render(<FilterStackControls stack={DEFAULT_STACK} onChange={() => {}} />);
    expect(screen.getAllByLabelText("Colorize")).toHaveLength(1);
  });

  it("with an empty stack, shows a hint and an enabled add control", () => {
    render(<FilterStackControls stack={[]} onChange={() => {}} />);
    expect(screen.getByText(/No filters yet/i)).toBeTruthy();
    expect(screen.getByLabelText("Add filter")).toBeTruthy();
  });

  it("typing a number in the field commits that value on blur", () => {
    const onChange = vi.fn();
    const stack = [makeFilter("blur", "blur")];
    render(<FilterStackControls stack={stack} onChange={onChange} />);
    const input = screen.getByLabelText("Blur value");
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);
    expect(onChange.mock.calls[0][0][0].radius).toBe(12);
  });

  it("out-of-range input clamps to the max on commit", () => {
    const onChange = vi.fn();
    const stack = [makeFilter("blur", "blur")];
    render(<FilterStackControls stack={stack} onChange={onChange} />);
    const input = screen.getByLabelText("Blur value");
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.blur(input);
    expect(onChange.mock.calls[0][0][0].radius).toBe(40);
  });
});

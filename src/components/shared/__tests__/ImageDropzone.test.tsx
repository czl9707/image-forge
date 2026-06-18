// src/components/shared/__tests__/ImageDropzone.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageDropzone } from "../ImageDropzone";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { toast } from "sonner";

describe("ImageDropzone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the idle prompt", () => {
    render(<ImageDropzone status="idle" onFile={() => {}} />);
    expect(screen.getByText(/drop an image/i)).toBeInTheDocument();
  });

  it("forwards a valid image file via onFile", async () => {
    const user = userEvent.setup();
    const onFile = vi.fn();
    render(<ImageDropzone status="idle" onFile={onFile} />);
    const input = screen.getByLabelText(/drop an image/i) as HTMLInputElement;
    const file = new File(["x"], "a.png", { type: "image/png" });
    await user.upload(input, file);
    expect(onFile).toHaveBeenCalledWith(file);
    expect(toast.error).not.toHaveBeenCalled();
  });

  // NOTE: uses fireEvent rather than userEvent.upload because
  // @testing-library/user-event filters out files that don't match the
  // input's `accept="image/*"` attribute before firing onChange (see
  // testing-library/user-event#1046). fireEvent.change dispatches the
  // change event directly so the component's in-app MIME check is exercised.
  it("rejects a non-image file with a toast and does not call onFile", () => {
    const onFile = vi.fn();
    render(<ImageDropzone status="idle" onFile={onFile} />);
    const input = screen.getByLabelText(/drop an image/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["x"], "a.txt", { type: "text/plain" })] },
    });
    expect(onFile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("shows an error state", () => {
    render(<ImageDropzone status="error" error="bad" onFile={() => {}} />);
    expect(screen.getByText(/bad/i)).toBeInTheDocument();
  });
});

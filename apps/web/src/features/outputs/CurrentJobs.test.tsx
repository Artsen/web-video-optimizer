import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { job } from "../../testing/fixtures";
import { CurrentJobs } from "./CurrentJobs";

describe("CurrentJobs", () => {
  it("renders the empty running-job state", () => {
    render(<CurrentJobs jobs={[]} onCancel={vi.fn()} />);

    expect(screen.getByText(/no active work/i)).toBeInTheDocument();
  });

  it("renders progress and sends cancel intents", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const running = job({ id: "running-1", status: "running", progress: 42, message: "Encoding" });
    render(<CurrentJobs jobs={[running]} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.getByText("Encoding")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "42");
    expect(onCancel).toHaveBeenCalledWith(running);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppMark } from "./AppMark";

describe("AppMark", () => {
  it("renders the compression-frame brand mark as decorative SVG geometry", () => {
    render(
      <div>
        <AppMark />
        <span>Web Video Optimizer</span>
      </div>
    );

    const mark = document.querySelector(".app-mark");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Web Video Optimizer")).toBeVisible();
    expect(document.querySelector(".app-mark-frame")).toBeInTheDocument();
    expect(document.querySelectorAll(".app-mark-band")).toHaveLength(3);
    expect(document.querySelector(".app-mark-play")).toBeInTheDocument();
  });
});

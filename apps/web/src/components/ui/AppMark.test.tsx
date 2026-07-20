import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppMark, WVO_LOGO_TRANSPARENT_PATH, WVO_LOGO_WHITE_TRANSPARENT_PATH } from "./AppMark";

describe("AppMark", () => {
  it("renders the approved WVO monogram variants as decorative images", () => {
    render(
      <div>
        <AppMark size="small" />
        <span>Web Video Optimizer</span>
      </div>
    );

    const mark = document.querySelector(".app-mark");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveClass("small");
    expect(screen.getByText("Web Video Optimizer")).toBeVisible();

    const images = document.querySelectorAll<HTMLImageElement>(".app-mark-image");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", WVO_LOGO_TRANSPARENT_PATH);
    expect(images[1]).toHaveAttribute("src", WVO_LOGO_WHITE_TRANSPARENT_PATH);
    expect(images[0]).toHaveAttribute("alt", "");
    expect(images[1]).toHaveAttribute("alt", "");
    expect(images[0]).toHaveAttribute("draggable", "false");
    expect(images[1]).toHaveAttribute("draggable", "false");
    expect(mark?.querySelector("svg")).not.toBeInTheDocument();
  });
});

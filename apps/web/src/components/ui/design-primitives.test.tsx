import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppMark } from "./AppMark";
import { StatusBadge } from "./StatusBadge";

describe("design primitives", () => {
  it("renders the product mark as decorative chrome", () => {
    const { container } = render(<AppMark />);

    expect(container.querySelector(".app-mark")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".app-mark")).toHaveClass("default");
  });

  it("renders status badges with semantic text and tone classes", () => {
    render(<StatusBadge tone="good">Local only</StatusBadge>);

    expect(screen.getByText("Local only")).toHaveClass("good");
  });

  it("keeps the mobile bottom chrome height contract in shared tokens", () => {
    const tokens = readFileSync("src/styles/tokens.css", "utf8");

    expect(tokens).toContain("--mobile-bottom-nav-height");
    expect(tokens).toContain("--mobile-contextual-bar-height");
    expect(tokens).toContain("--mobile-bottom-content-padding");
    expect(tokens).toContain("safe-area-inset-bottom");
    expect(tokens).toContain("(var(--mobile-bottom-chrome-gap) * 5)");

    const responsive = readFileSync("src/styles/responsive.css", "utf8");
    expect(responsive).toContain("var(--mobile-bottom-nav-height) + var(--mobile-safe-area-bottom)");
  });

  it("keeps the desktop sidebar sizing contract in shared tokens", () => {
    const tokens = readFileSync("src/styles/tokens.css", "utf8");

    expect(tokens).toContain("--layout-sidebar-width: 300px");
    expect(tokens).toContain("--layout-sidebar-medium-width: 260px");
  });
});

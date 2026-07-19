import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PosterLightbox } from "./PosterLightbox";
import { job } from "../../testing/fixtures";

describe("PosterLightbox", () => {
  it("renders poster controls, closes, and emits bounded zoom intents", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onZoom = vi.fn();

    render(
      <PosterLightbox
        apiBaseUrl="http://localhost:4000"
        poster={job({ id: "poster-1", kind: "poster", outputFileName: "poster.webp" })}
        posterUrl="http://localhost:4000/api/jobs/poster-1/output"
        zoom={1}
        pan={{ x: 0, y: 0 }}
        onClose={onClose}
        onZoom={onZoom}
        onStartPan={vi.fn()}
        onMovePan={vi.fn()}
        onStopPan={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "Poster preview" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("link", { name: /download/i })).toHaveAttribute(
      "href",
      "http://localhost:4000/api/jobs/poster-1/download"
    );

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await user.click(screen.getByRole("button", { name: "Close poster preview" }));

    expect(onZoom).toHaveBeenCalledWith(1.25);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores the previous page overflow when unmounted", () => {
    document.body.style.overflow = "auto";

    const { unmount } = render(
      <PosterLightbox
        apiBaseUrl="http://localhost:4000"
        poster={job({ id: "poster-1", kind: "poster", outputFileName: "poster.webp" })}
        posterUrl="http://localhost:4000/api/jobs/poster-1/output"
        zoom={1}
        pan={{ x: 0, y: 0 }}
        onClose={vi.fn()}
        onZoom={vi.fn()}
        onStartPan={vi.fn()}
        onMovePan={vi.fn()}
        onStopPan={vi.fn()}
      />
    );

    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });
});

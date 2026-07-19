import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useBrowserRoute } from "./useBrowserRoute";

describe("useBrowserRoute", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("pushes meaningful route changes and replaces minor state changes", () => {
    window.history.replaceState(null, "", "/");
    const { result } = renderHook(() => useBrowserRoute());

    act(() => result.current.navigate({ view: "prepare", sourceId: "video-1" }));
    expect(window.location.search).toBe("?view=prepare&source=video-1");

    act(() => result.current.replace({ view: "results", sourceId: "video-1", outputId: "job-1" }));
    expect(window.location.search).toBe("?view=results&source=video-1&output=job-1");
    expect(result.current.route).toEqual({ view: "results", sourceId: "video-1", outputId: "job-1" });
  });

  it("responds to popstate navigation", () => {
    window.history.replaceState(null, "", "/?view=library");
    const { result } = renderHook(() => useBrowserRoute());

    window.history.pushState(null, "", "/?view=compare&source=video-1&mode=ab&layout=two");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    expect(result.current.route).toEqual({
      view: "compare",
      sourceId: "video-1",
      compareMode: "ab",
      compareLayout: "two"
    });
  });
});

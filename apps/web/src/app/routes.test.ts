import { describe, expect, it } from "vitest";
import { buildAppRoute, parseAppRoute } from "./routes";

describe("app routes", () => {
  it("parses new and library routes", () => {
    expect(parseAppRoute("/?view=new")).toEqual({ view: "new" });
    expect(parseAppRoute("/?view=library")).toEqual({ view: "library" });
  });

  it("falls back invalid views safely", () => {
    expect(parseAppRoute("/?view=nope")).toEqual({ view: "new" });
    expect(parseAppRoute("/?source=video-1&view=nope")).toEqual({ view: "prepare", sourceId: "video-1" });
  });

  it("preserves source and selected output IDs without filenames or paths", () => {
    expect(parseAppRoute("/?view=results&source=video-1&output=job-1")).toEqual({
      view: "results",
      sourceId: "video-1",
      outputId: "job-1"
    });
  });

  it("parses compare mode, layout, and visible versions with invalid values normalized", () => {
    expect(
      parseAppRoute("/?view=compare&source=video-1&output=job-1&mode=wipe&layout=two&versions=source,job-1,job-2")
    ).toEqual({
      view: "compare",
      sourceId: "video-1",
      outputId: "job-1",
      compareMode: "wipe",
      compareLayout: "two",
      compareIds: ["source", "job-1", "job-2"]
    });
    expect(parseAppRoute("/?view=compare&source=video-1&mode=sideways&layout=huge")).toEqual({
      view: "compare",
      sourceId: "video-1",
      compareMode: "grid",
      compareLayout: "auto"
    });
  });

  it("builds stable query routes", () => {
    expect(buildAppRoute({ view: "new" })).toBe("/?view=new");
    expect(buildAppRoute({ view: "library" })).toBe("/?view=library");
    expect(buildAppRoute({ view: "custom", sourceId: "video-1" })).toBe("/?view=custom&source=video-1");
    expect(
      buildAppRoute({
        view: "compare",
        sourceId: "video-1",
        outputId: "job-1",
        compareMode: "ab",
        compareLayout: "four",
        compareIds: ["source", "job-1"]
      })
    ).toBe("/?view=compare&source=video-1&output=job-1&mode=ab&layout=four&versions=source%2Cjob-1");
  });
});

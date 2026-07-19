export const routeViews = ["new", "library", "prepare", "results", "custom", "compare"] as const;
export const compareModes = ["grid", "wipe", "ab"] as const;
export const compareLayouts = ["auto", "one", "two", "four"] as const;

export type RouteView = (typeof routeViews)[number];
export type CompareRouteMode = (typeof compareModes)[number];
export type CompareRouteLayout = (typeof compareLayouts)[number];

export type AppRoute =
  | { view: "new" }
  | { view: "library" }
  | {
      view: "prepare" | "results" | "custom" | "compare";
      sourceId: string;
      outputId?: string;
      compareMode?: CompareRouteMode;
      compareLayout?: CompareRouteLayout;
      compareIds?: string[];
    };

function isRouteView(value: string | null): value is RouteView {
  return Boolean(value && (routeViews as readonly string[]).includes(value));
}

function isCompareMode(value: string | null): value is CompareRouteMode {
  return Boolean(value && (compareModes as readonly string[]).includes(value));
}

function isCompareLayout(value: string | null): value is CompareRouteLayout {
  return Boolean(value && (compareLayouts as readonly string[]).includes(value));
}

export function parseAppRoute(input: string | URL | URLSearchParams): AppRoute {
  const params =
    input instanceof URLSearchParams
      ? input
      : input instanceof URL
        ? input.searchParams
        : new URL(input, "http://local.app").searchParams;
  const view = params.get("view");
  const sourceId = params.get("source")?.trim() ?? "";
  const normalizedView = isRouteView(view) ? view : sourceId ? "prepare" : "new";

  if (normalizedView === "library") return { view: "library" };
  if (normalizedView === "new") return { view: "new" };
  if (!sourceId) return { view: "new" };

  const outputId = params.get("output")?.trim() || undefined;
  if (normalizedView === "compare") {
    const mode = params.get("mode");
    const layout = params.get("layout");
    const compareIds = params
      .get("versions")
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    return {
      view: "compare",
      sourceId,
      outputId,
      compareMode: isCompareMode(mode) ? mode : "grid",
      compareLayout: isCompareLayout(layout) ? layout : "auto",
      compareIds: compareIds && compareIds.length > 0 ? Array.from(new Set(compareIds)).slice(0, 4) : undefined
    };
  }

  return {
    view: normalizedView,
    sourceId,
    outputId
  };
}

export function buildAppRoute(route: AppRoute): string {
  const params = new URLSearchParams();
  params.set("view", route.view);
  if ("sourceId" in route) {
    params.set("source", route.sourceId);
    if (route.outputId) params.set("output", route.outputId);
    if (route.view === "compare") {
      if (route.compareMode) params.set("mode", route.compareMode);
      if (route.compareLayout) params.set("layout", route.compareLayout);
      if (route.compareIds?.length) params.set("versions", route.compareIds.join(","));
    }
  }
  return `/?${params.toString()}`;
}

export function sameAppRoute(left: AppRoute, right: AppRoute): boolean {
  return buildAppRoute(left) === buildAppRoute(right);
}

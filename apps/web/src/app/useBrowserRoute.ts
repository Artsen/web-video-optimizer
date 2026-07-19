import React from "react";
import { buildAppRoute, parseAppRoute, sameAppRoute, type AppRoute } from "./routes";

type NavigationMode = "push" | "replace";

export function useBrowserRoute() {
  const [route, setRoute] = React.useState<AppRoute>(() => parseAppRoute(window.location.href));

  React.useEffect(() => {
    const onPopState = () => setRoute(parseAppRoute(window.location.href));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = React.useCallback((nextRoute: AppRoute, mode: NavigationMode = "push") => {
    setRoute((current) => {
      const nextUrl = buildAppRoute(nextRoute);
      if (
        sameAppRoute(current, nextRoute) &&
        window.location.search === new URL(nextUrl, window.location.href).search
      ) {
        return current;
      }

      if (mode === "replace") window.history.replaceState(null, "", nextUrl);
      else window.history.pushState(null, "", nextUrl);
      return nextRoute;
    });
  }, []);

  const replace = React.useCallback((nextRoute: AppRoute) => navigate(nextRoute, "replace"), [navigate]);

  return { navigate, replace, route };
}

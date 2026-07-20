import React from "react";
import type { Capabilities, HistorySnapshot, StorageStatusDto } from "@local-video-optimizer/contracts";
import type { AppDependencies } from "./app-dependencies";

export type BootstrapRequestKey = "history" | "capabilities" | "storage";

export type BootstrapIssue = {
  key: BootstrapRequestKey;
  label: string;
};

export type BootstrapState = {
  isLoading: boolean;
  unreachable: boolean;
  issues: BootstrapIssue[];
};

const bootstrapRequests: Record<BootstrapRequestKey, string> = {
  history: "Library history",
  capabilities: "Media capabilities",
  storage: "Storage status"
};

export function useAppBootstrap({
  api,
  theme,
  setCapabilities,
  setHistory,
  setStorageStatus,
  setReady
}: {
  api: AppDependencies["api"];
  theme: "dark" | "light";
  setCapabilities: React.Dispatch<React.SetStateAction<Capabilities | null>>;
  setHistory: React.Dispatch<React.SetStateAction<HistorySnapshot>>;
  setStorageStatus: React.Dispatch<React.SetStateAction<StorageStatusDto | null>>;
  setReady?: React.Dispatch<React.SetStateAction<boolean>>;
}): { bootstrap: BootstrapState; retryBootstrap: () => void } {
  const [attempt, setAttempt] = React.useState(0);
  const [bootstrap, setBootstrap] = React.useState<BootstrapState>({
    isLoading: true,
    unreachable: false,
    issues: []
  });

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  React.useEffect(() => {
    let canceled = false;
    setReady?.(false);
    void Promise.allSettled([
      api.getHistory().then((value) => ({ key: "history" as const, value })),
      api.getCapabilities().then((value) => ({ key: "capabilities" as const, value })),
      api.getStorageStatus().then((value) => ({ key: "storage" as const, value }))
    ]).then((results) => {
      if (canceled) return;
      const issues: BootstrapIssue[] = [];
      for (const [index, result] of results.entries()) {
        if (result.status === "fulfilled") {
          if (result.value.key === "history") setHistory(result.value.value);
          if (result.value.key === "capabilities") setCapabilities(result.value.value);
          if (result.value.key === "storage") setStorageStatus(result.value.value);
          continue;
        }
        const key = (["history", "capabilities", "storage"] as const)[index];
        issues.push({ key, label: bootstrapRequests[key] });
      }
      const unreachable = issues.length === results.length;
      setBootstrap({ isLoading: false, unreachable, issues });
      setReady?.(!unreachable);
    });
    return () => {
      canceled = true;
    };
  }, [api, attempt, setCapabilities, setHistory, setReady, setStorageStatus]);

  return {
    bootstrap,
    retryBootstrap: () => {
      setReady?.(false);
      setBootstrap({ isLoading: true, unreachable: false, issues: [] });
      setAttempt((current) => current + 1);
    }
  };
}

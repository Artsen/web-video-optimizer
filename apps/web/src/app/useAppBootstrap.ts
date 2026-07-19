import React from "react";
import type { Capabilities, HistorySnapshot, StorageStatusDto } from "@local-video-optimizer/contracts";
import type { AppDependencies } from "./app-dependencies";

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
}) {
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  React.useEffect(() => {
    let canceled = false;
    setReady?.(false);
    void Promise.allSettled([
      api.getHistory().then(setHistory),
      api.getCapabilities().then(setCapabilities),
      api.getStorageStatus().then(setStorageStatus)
    ]).then(() => {
      if (!canceled) setReady?.(true);
    });
    return () => {
      canceled = true;
    };
  }, [api, setCapabilities, setHistory, setReady, setStorageStatus]);
}

import React from "react";
import type { Capabilities, HistorySnapshot, StorageStatusDto } from "@local-video-optimizer/contracts";
import type { AppDependencies } from "./app-dependencies";

export function useAppBootstrap({
  api,
  theme,
  setCapabilities,
  setHistory,
  setStorageStatus
}: {
  api: AppDependencies["api"];
  theme: "dark" | "light";
  setCapabilities: React.Dispatch<React.SetStateAction<Capabilities | null>>;
  setHistory: React.Dispatch<React.SetStateAction<HistorySnapshot>>;
  setStorageStatus: React.Dispatch<React.SetStateAction<StorageStatusDto | null>>;
}) {
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  React.useEffect(() => {
    void api
      .getHistory()
      .then(setHistory)
      .catch(() => undefined);
    void api
      .getCapabilities()
      .then(setCapabilities)
      .catch(() => undefined);
    void api
      .getStorageStatus()
      .then(setStorageStatus)
      .catch(() => undefined);
  }, [api, setCapabilities, setHistory, setStorageStatus]);
}

import { UploadCloud, Package, Settings2 } from "lucide-react";
import { useVideoOptimizerApp } from "./useVideoOptimizerApp";
import type { AppDependencies } from "./app-dependencies";
import { AppShell } from "../components/AppShell";
import { PrepareView } from "../features/prepare/PrepareView";
import { OutputsView } from "../features/outputs/OutputsView";
import { CustomView } from "../features/custom/CustomView";
import { CompareView } from "../features/compare/CompareView";
import { CaptionsView } from "../features/captions/CaptionsView";

export function App({ dependencies }: { dependencies: AppDependencies }) {
  const controller = useVideoOptimizerApp(dependencies);
  const { navigation, source } = controller;

  return (
    <AppShell controller={controller}>
      {navigation.activeTab === "workflow" && (
        <>
          {navigation.activeView === "prepare" && <PrepareView controller={controller} />}
          {source.video && navigation.activeView === "outputs" && <OutputsView controller={controller} />}
          {source.video && navigation.activeView === "custom" && <CustomView controller={controller} />}
          {source.video && navigation.activeView === "compare" && <CompareView controller={controller} />}
          {source.video && navigation.activeView === "captions" && <CaptionsView controller={controller} />}
        </>
      )}
      {navigation.activeTab === "workflow" && !source.video && navigation.activeView !== "prepare" && (
        <section className="workflow-section">
          <div className="panel empty-panel">
            <p className="muted">Choose or upload a video before using this workspace view.</p>
            <div className="actions">
              <button className="button primary" type="button" onClick={() => navigation.setActiveView("prepare")}>
                <UploadCloud size={18} />
                Prepare Video
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => navigation.setActiveView("outputs")}
                disabled
              >
                <Package size={18} />
                Jobs & Outputs
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => navigation.setActiveView("custom")}
                disabled
              >
                <Settings2 size={18} />
                Custom
              </button>
            </div>
          </div>
        </section>
      )}
    </AppShell>
  );
}

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
          {navigation.bootstrap.unreachable && <ApiUnavailableState controller={controller} />}
          {!navigation.bootstrap.unreachable && !navigation.isBootstrapped && <RouteLoadingState />}
          {navigation.missingSourceId && <MissingSourceState controller={controller} />}
          {!navigation.bootstrap.unreachable &&
            !navigation.missingSourceId &&
            (navigation.activeView === "prepare" || navigation.activeView === "results") && (
              <SourceWorkspace controller={controller} />
            )}
          {!navigation.bootstrap.unreachable && source.video && navigation.activeView === "custom" && (
            <CustomView controller={controller} />
          )}
          {!navigation.bootstrap.unreachable && source.video && navigation.activeView === "compare" && (
            <CompareView controller={controller} />
          )}
          {!navigation.bootstrap.unreachable && source.video && navigation.activeView === "captions" && (
            <CaptionsView controller={controller} />
          )}
        </>
      )}
    </AppShell>
  );
}

function SourceWorkspace({ controller }: { controller: ReturnType<typeof useVideoOptimizerApp> }) {
  const hasInlineResults = controller.source.video && controller.jobs.currentVideoJobs.length > 0;
  return (
    <>
      <PrepareView controller={controller} />
      {hasInlineResults && <OutputsView controller={controller} embedded />}
    </>
  );
}

function ApiUnavailableState({ controller }: { controller: ReturnType<typeof useVideoOptimizerApp> }) {
  const { apiBaseUrl, navigation } = controller;
  return (
    <section className="workflow-section route-state-panel startup-error-panel" role="alert" aria-live="assertive">
      <h2>Cannot reach the local API</h2>
      <p className="muted">
        Web Video Optimizer could not connect to the API at the configured local address. Keep the API running while
        using the web interface.
      </p>
      <dl className="startup-details">
        <div>
          <dt>Expected API URL</dt>
          <dd>{apiBaseUrl}</dd>
        </div>
        <div>
          <dt>Two-console fallback</dt>
          <dd>Run npm run dev:api, then npm run dev:web in another console.</dd>
        </div>
      </dl>
      <div className="actions">
        <button className="button primary" type="button" onClick={navigation.retryBootstrap}>
          Retry connection
        </button>
      </div>
    </section>
  );
}

function RouteLoadingState() {
  return (
    <section className="workflow-section route-state-panel" aria-live="polite">
      <h2>Loading workspace...</h2>
      <p className="muted">Restoring local history and the requested view.</p>
    </section>
  );
}

function MissingSourceState({ controller }: { controller: ReturnType<typeof useVideoOptimizerApp> }) {
  const { navigation } = controller;
  return (
    <section className="workflow-section route-state-panel" aria-live="polite">
      <h2>Source is no longer available</h2>
      <p className="muted">This URL points to a source ID that is not in the local library on this computer.</p>
      <div className="actions">
        <button className="button primary" type="button" onClick={navigation.openLibraryRoute}>
          Open Library
        </button>
        <button className="button secondary" type="button" onClick={navigation.startNewVideo}>
          Add New Video
        </button>
      </div>
    </section>
  );
}

import type { ReactNode } from "react";
import {
  FileVideo,
  HardDrive,
  History,
  Moon,
  Package,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  UploadCloud
} from "lucide-react";
import type { VideoOptimizerAppController } from "../app/useVideoOptimizerApp";
import { formatBytes, formatDuration } from "../domain/formatters";
import { SectionHeader } from "./ui/SectionHeader";
import { PosterLightbox } from "../features/poster/PosterLightbox";

export function AppShell({ controller, children }: { controller: VideoOptimizerAppController; children: ReactNode }) {
  const { apiBaseUrl, navigation, status, jobs, poster } = controller;

  return (
    <main className="app-shell">
      <LibrarySidebar controller={controller} />
      <section className="workspace">
        <WorkspaceHeader status={status.currentStatus} running={jobs.runningJobs.length > 0} />
        {status.error && <div className="notice error global-error">{status.error}</div>}
        {navigation.activeTab === "workflow" && <WorkflowNav controller={controller} />}
        {navigation.activeTab === "history" && <HistoryView controller={controller} />}
        {children}
      </section>
      {poster.activePosterPreview && poster.activePosterUrl && (
        <PosterLightbox
          apiBaseUrl={apiBaseUrl}
          poster={poster.activePosterPreview}
          posterUrl={poster.activePosterUrl}
          zoom={poster.posterZoom}
          pan={poster.posterPan}
          onClose={poster.closePosterLightbox}
          onZoom={poster.updatePosterZoom}
          onStartPan={poster.startPosterPan}
          onMovePan={poster.movePosterPan}
          onStopPan={poster.stopPosterPan}
        />
      )}
    </main>
  );
}

export function LibrarySidebar({ controller }: { controller: VideoOptimizerAppController }) {
  const { navigation, library, source } = controller;
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">
          <Sparkles size={18} />
        </div>
        <div>
          <strong>Web Video Optimizer</strong>
          <span>Local FFmpeg workspace</span>
        </div>
      </div>

      <button className="button primary wide new-upload" type="button" onClick={navigation.startNewVideo}>
        <UploadCloud size={18} />
        New Video
      </button>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <span>Library</span>
          <button className="mini-button" type="button" onClick={() => void library.refreshHistory()}>
            Refresh
          </button>
        </div>
        <div className="sidebar-list">
          {library.history.videos.length === 0 && <p className="sidebar-empty">No uploads yet.</p>}
          {library.history.videos.map((historyVideo) => (
            <button
              className={`sidebar-file ${source.video?.id === historyVideo.id ? "active" : ""}`}
              key={historyVideo.id}
              onClick={() => library.loadHistoryVideo(historyVideo)}
            >
              <FileVideo size={16} />
              <span>
                <strong>{historyVideo.originalName}</strong>
                <em>
                  {formatBytes(historyVideo.metadata.fileSize)} / {historyVideo.jobIds.length} outputs
                </em>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <button
          className="utility-button wide"
          type="button"
          onClick={() => {
            navigation.setActiveTab(navigation.activeTab === "history" ? "workflow" : "history");
            void library.refreshHistory();
          }}
        >
          <History size={18} />
          {navigation.activeTab === "history" ? "Workflow" : "Manage Library"}
        </button>
        <button className="utility-button wide" type="button" onClick={navigation.toggleTheme}>
          {navigation.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {navigation.theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
      </div>
    </aside>
  );
}

export function WorkspaceHeader({ status, running }: { status: string; running: boolean }) {
  return (
    <header className="topbar">
      <div className="brand">
        <div>
          <p className="eyebrow">Local-first FFmpeg workflow</p>
          <h1>Web Video Optimizer</h1>
          <p className="subtitle">
            Upload a video, let the app recommend a web package, then fine-tune only when you need to.
          </p>
        </div>
      </div>
      <div className="top-actions">
        <div className={`status-pill ${running ? "running" : ""}`}>{status}</div>
        <div className="privacy">
          <ShieldCheck size={17} />
          Local only
        </div>
      </div>
    </header>
  );
}

function WorkflowNav({ controller }: { controller: VideoOptimizerAppController }) {
  const { navigation, source, jobs } = controller;
  return (
    <nav className="workflow" aria-label="Workspace views">
      <button
        className={`workflow-step ${navigation.activeView === "prepare" ? "active" : ""}`}
        type="button"
        onClick={() => navigation.setActiveView("prepare")}
      >
        <UploadCloud size={17} />
        Prepare
      </button>
      <button
        className={`workflow-step ${navigation.activeView === "outputs" ? "active" : ""}`}
        type="button"
        onClick={() => navigation.setActiveView("outputs")}
        disabled={!source.video}
      >
        <Package size={17} />
        Jobs & Outputs
        {jobs.currentVideoJobs.length > 0 && <span>{jobs.currentVideoJobs.length}</span>}
      </button>
      <button
        className={`workflow-step ${navigation.activeView === "custom" ? "active" : ""}`}
        type="button"
        onClick={() => navigation.setActiveView("custom")}
        disabled={!source.video}
      >
        <Settings2 size={17} />
        Custom
      </button>
    </nav>
  );
}

function HistoryView({ controller }: { controller: VideoOptimizerAppController }) {
  const { library, jobs } = controller;
  return (
    <section className="workflow-section">
      <SectionHeader
        icon={<History size={21} />}
        title="History"
        kicker="Bring back previous uploads and outputs from this app session, or clean them up individually or in bulk."
      />
      <div className="history-actions">
        <button className="button secondary" type="button" onClick={() => void library.refreshHistory()}>
          Refresh
        </button>
        <button
          className="button secondary"
          type="button"
          disabled={library.selectedVideoIds.length + library.selectedJobIds.length === 0}
          onClick={() => void library.deleteHistoryItems()}
        >
          <Trash2 size={18} />
          Delete Selected
        </button>
      </div>
      <StoragePanel controller={controller} />
      <div className="history-layout">
        <div className="panel">
          <SectionHeader icon={<FileVideo size={20} />} title="Uploaded Files" />
          <div className="history-list">
            {library.history.videos.length === 0 && <p className="muted">No uploaded files yet.</p>}
            {library.history.videos.map((historyVideo) => (
              <div className="history-item" key={historyVideo.id}>
                <input
                  type="checkbox"
                  checked={library.selectedVideoIds.includes(historyVideo.id)}
                  onChange={() =>
                    library.setSelectedVideoIds((current) => library.toggleSelected(current, historyVideo.id))
                  }
                />
                <button className="history-main" type="button" onClick={() => library.loadHistoryVideo(historyVideo)}>
                  <strong>{historyVideo.originalName}</strong>
                  <span>
                    {formatBytes(historyVideo.metadata.fileSize)} /{" "}
                    {formatDuration(historyVideo.metadata.durationSeconds)} / {historyVideo.jobIds.length} jobs
                  </span>
                </button>
                <button
                  className="icon-button danger-button"
                  type="button"
                  onClick={() => void library.deleteHistoryItems([historyVideo.id], [])}
                  aria-label="Delete file"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <SectionHeader icon={<Package size={20} />} title="Jobs & Outputs" />
          <div className="history-list">
            {library.history.jobs.length === 0 && <p className="muted">No jobs yet.</p>}
            {library.history.jobs.map((historyJob) => (
              <div className="history-item" key={historyJob.id}>
                <input
                  type="checkbox"
                  checked={library.selectedJobIds.includes(historyJob.id)}
                  onChange={() =>
                    library.setSelectedJobIds((current) => library.toggleSelected(current, historyJob.id))
                  }
                />
                <button
                  className="history-main"
                  type="button"
                  onClick={() => {
                    const owningVideo = library.history.videos.find(
                      (historyVideo) => historyVideo.id === historyJob.videoId
                    );
                    if (owningVideo) library.loadHistoryVideo(owningVideo);
                    jobs.selectVariation(historyJob);
                  }}
                >
                  <strong>{historyJob.outputFileName ?? historyJob.id}</strong>
                  <span>
                    {historyJob.kind} / {historyJob.status} / {formatBytes(historyJob.outputSize)}
                  </span>
                </button>
                {historyJob.status === "running" && (
                  <button className="button secondary" type="button" onClick={() => void jobs.cancelJob(historyJob)}>
                    Cancel
                  </button>
                )}
                <button
                  className="icon-button danger-button"
                  type="button"
                  onClick={() => void library.deleteHistoryItems([], [historyJob.id])}
                  aria-label="Delete job"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StoragePanel({ controller }: { controller: VideoOptimizerAppController }) {
  const { library } = controller;
  const storage = library.storageStatus;
  if (!storage) {
    return (
      <div className="panel storage-panel">
        <SectionHeader icon={<HardDrive size={20} />} title="Storage" kicker="Checking local managed storage..." />
      </div>
    );
  }

  const pressureCopy =
    storage.pressure === "critical"
      ? "Storage is critically low. Delete old history items or free space before starting more work."
      : storage.pressure === "warning"
        ? "Storage is getting low. Existing history is preserved until you delete it."
        : "Storage looks healthy.";
  const hasCleanup = storage.cleanup.staleTemporaryFileCount > 0;

  return (
    <div className={`panel storage-panel pressure-${storage.pressure}`}>
      <SectionHeader icon={<HardDrive size={20} />} title="Storage" kicker={pressureCopy} />
      <div className="storage-grid">
        <span>
          <strong>{formatBytes(storage.managedBytes)}</strong>
          <em>managed by this app</em>
        </span>
        <span>
          <strong>{formatBytes(storage.reservedBytes)}</strong>
          <em>reserved for active work</em>
        </span>
        <span>
          <strong>{storage.availableBytes === undefined ? "Unknown" : formatBytes(storage.availableBytes)}</strong>
          <em>available on disk</em>
        </span>
        <span>
          <strong>
            {storage.configuredMaxBytes === undefined ? "Unlimited" : formatBytes(storage.configuredMaxBytes)}
          </strong>
          <em>managed quota</em>
        </span>
        <span>
          <strong>{formatBytes(storage.minimumFreeBytes)}</strong>
          <em>minimum reserve</em>
        </span>
      </div>
      <div className="storage-breakdown" aria-label="Storage usage by area">
        <span>Uploads {formatBytes(storage.areas.uploads.bytes)}</span>
        <span>Outputs {formatBytes(storage.areas.outputs.bytes)}</span>
        <span>Temporary {formatBytes(storage.areas.temporary.bytes)}</span>
        <span>Staging {formatBytes(storage.areas.staging.bytes)}</span>
      </div>
      <div className="storage-cleanup">
        <p className="muted">
          Reclaimable temporary data: {formatBytes(storage.cleanup.staleTemporaryBytes)} across{" "}
          {storage.cleanup.staleTemporaryFileCount} file(s).
        </p>
        <button
          className="button secondary"
          type="button"
          disabled={!hasCleanup || library.isCleaningStorage}
          onClick={() => void library.cleanupStorage()}
          aria-label="Clean temporary files only"
        >
          {library.isCleaningStorage ? "Cleaning..." : "Clean Temporary Files"}
        </button>
      </div>
      {library.storageCleanupStatus && <p className="success-text">{library.storageCleanupStatus}</p>}
    </div>
  );
}

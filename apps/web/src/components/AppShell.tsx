import type { ReactNode } from "react";
import {
  BadgeCheck,
  FileVideo,
  HardDrive,
  History,
  Moon,
  Package,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  UploadCloud
} from "lucide-react";
import type { VideoOptimizerAppController } from "../app/useVideoOptimizerApp";
import { formatBytes, formatDuration } from "../domain/formatters";
import { AppMark } from "./ui/AppMark";
import { ContextMenu } from "./ui/ContextMenu";
import { SectionHeader } from "./ui/SectionHeader";
import { StatusBadge } from "./ui/StatusBadge";
import { PosterLightbox } from "../features/poster/PosterLightbox";

export function AppShell({ controller, children }: { controller: VideoOptimizerAppController; children: ReactNode }) {
  const { apiBaseUrl, navigation, status, poster } = controller;

  return (
    <main className="app-shell">
      <MobileTopBar controller={controller} />
      <LibrarySidebar controller={controller} />
      <section className="workspace">
        <WorkspaceHeader controller={controller} />
        {status.error && <div className="notice error global-error">{status.error}</div>}
        {navigation.bootstrap.issues.length > 0 && !navigation.bootstrap.unreachable && (
          <div className="notice warning global-error" role="status">
            <span>
              Some startup information could not be loaded:{" "}
              {navigation.bootstrap.issues.map((issue) => issue.label).join(", ")}.
            </span>
            <button className="mini-button" type="button" onClick={navigation.retryBootstrap}>
              Retry connection
            </button>
          </div>
        )}
        {navigation.activeTab === "history" && <HistoryView controller={controller} />}
        {children}
      </section>
      <MobileBottomNav controller={controller} />
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
  const sourceWorkspaceActive =
    navigation.activeTab === "workflow" && (navigation.activeView === "prepare" || navigation.activeView === "results");
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <AppMark size="small" />
        <div>
          <strong>Web Video Optimizer</strong>
          <span>Local media utility</span>
        </div>
      </div>

      <button className="button primary wide new-upload" type="button" onClick={navigation.startNewVideo}>
        <UploadCloud size={18} />
        New Video
      </button>

      <nav className="sidebar-nav" aria-label="Primary">
        <button
          className={`sidebar-nav-item ${sourceWorkspaceActive ? "active" : ""}`}
          type="button"
          onClick={() => {
            navigation.setActiveView("prepare");
          }}
          aria-current={sourceWorkspaceActive ? "page" : undefined}
        >
          <UploadCloud size={17} />
          Prepare
        </button>
        <button
          className={`sidebar-nav-item ${navigation.activeTab === "history" ? "active" : ""}`}
          type="button"
          onClick={() => {
            navigation.openLibraryRoute();
            void library.refreshHistory();
          }}
          aria-current={navigation.activeTab === "history" ? "page" : undefined}
        >
          <History size={17} />
          Library
        </button>
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          <span>Recent sources</span>
          <button className="mini-button" type="button" onClick={() => void library.refreshHistory()}>
            Refresh
          </button>
        </div>
        <div className="sidebar-list">
          {library.history.videos.length === 0 && <p className="sidebar-empty">No uploads yet.</p>}
          {library.history.videos.map((historyVideo) => {
            const relatedOutputCount = library.history.jobs.filter(
              (historyJob) => historyJob.videoId === historyVideo.id
            ).length;

            return (
              <div
                className={`sidebar-file-row ${source.video?.id === historyVideo.id ? "active" : ""}`}
                key={historyVideo.id}
              >
                <button
                  className="sidebar-file"
                  type="button"
                  onClick={() => library.loadHistoryVideo(historyVideo)}
                  aria-current={source.video?.id === historyVideo.id ? "page" : undefined}
                >
                  <FileVideo size={16} />
                  <span>
                    <strong title={historyVideo.originalName}>{historyVideo.originalName}</strong>
                    <em>
                      {formatBytes(historyVideo.metadata.fileSize)} / {relatedOutputCount} outputs
                    </em>
                  </span>
                </button>
                <ContextMenu
                  label="More source actions"
                  items={[
                    {
                      label: "Open source",
                      icon: <FileVideo size={15} />,
                      onSelect: () => library.loadHistoryVideo(historyVideo)
                    },
                    {
                      label: "Delete source",
                      icon: <Trash2 size={15} />,
                      destructive: true,
                      onSelect: () => void library.deleteHistoryItems([historyVideo.id], [])
                    }
                  ]}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="sidebar-footer">
        <button className="utility-button wide" type="button" onClick={navigation.toggleTheme}>
          {navigation.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {navigation.theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
      </div>
    </aside>
  );
}

export function WorkspaceHeader({ controller }: { controller: VideoOptimizerAppController }) {
  const { source, navigation } = controller;
  const video = source.video;
  if (!video) {
    return (
      <header className="topbar">
        <div className="brand">
          <AppMark />
          <div>
            <p className="eyebrow">Local-first media utility</p>
            <h1>Web Video Optimizer</h1>
            <p className="subtitle">
              Turn one source video into a fast, compatible, accessible website package while keeping every file on this
              computer.
            </p>
          </div>
        </div>
        <div className="top-actions">
          <div className="privacy">
            <ShieldCheck size={17} />
            Local only
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="topbar source-topbar">
      <div className="brand">
        <AppMark />
        <div>
          <p className="eyebrow">Current source</p>
          <h1>{video.originalName}</h1>
          <p className="subtitle">
            {video.metadata.width ?? "Unknown"}&nbsp;x&nbsp;{video.metadata.height ?? "Unknown"} ·{" "}
            {formatDuration(video.metadata.durationSeconds)} · {formatBytes(video.metadata.fileSize)}
          </p>
        </div>
      </div>
      <div className="top-actions source-summary-actions">
        <StatusBadge tone={video.metadata.webFriendly ? "good" : "warn"}>
          <BadgeCheck size={15} />
          {video.metadata.webFriendly ? "Web-friendly source" : "Review compatibility"}
        </StatusBadge>
        <div className="privacy">
          <ShieldCheck size={17} />
          Local only
        </div>
        <ContextMenu
          label="Source options"
          items={[
            {
              label: "Prepare",
              icon: <UploadCloud size={15} />,
              onSelect: () => navigation.setActiveView("prepare")
            },
            ...(controller.jobs.finishedOutputJobs.length > 0
              ? [
                  {
                    label: "Jump to results",
                    icon: <Package size={15} />,
                    onSelect: () => navigation.setActiveView("results", controller.jobs.finishedOutputJobs[0]?.id)
                  }
                ]
              : []),
            {
              label: "Custom export",
              icon: <Settings2 size={15} />,
              onSelect: () => navigation.setActiveView("custom")
            },
            {
              label: "Download original",
              icon: <FileVideo size={15} />,
              onSelect: () => {
                window.location.href = source.sourceDownloadUrl;
              }
            }
          ]}
        />
      </div>
    </header>
  );
}

function MobileTopBar({ controller }: { controller: VideoOptimizerAppController }) {
  const { navigation, source, library } = controller;
  const video = source.video;
  return (
    <header className="mobile-topbar">
      <button className="mobile-brand-button" type="button" onClick={navigation.startNewVideo}>
        <AppMark size="small" />
        <span>
          <strong>Web Video Optimizer</strong>
          <em>{video ? video.originalName : "No source selected"}</em>
        </span>
      </button>
      <ContextMenu
        label="App options"
        items={[
          {
            label: "New video",
            icon: <UploadCloud size={15} />,
            onSelect: navigation.startNewVideo
          },
          {
            label: navigation.theme === "dark" ? "Light mode" : "Dark mode",
            icon: navigation.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />,
            onSelect: navigation.toggleTheme
          },
          {
            label: "Refresh library",
            icon: <History size={15} />,
            onSelect: () => void library.refreshHistory()
          }
        ]}
      />
    </header>
  );
}

function MobileBottomNav({ controller }: { controller: VideoOptimizerAppController }) {
  const { navigation, source } = controller;
  const sourceWorkspaceActive =
    navigation.activeTab === "workflow" && (navigation.activeView === "prepare" || navigation.activeView === "results");
  return (
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
      <button
        className={sourceWorkspaceActive ? "active" : ""}
        type="button"
        onClick={() => {
          navigation.setActiveView("prepare");
        }}
        aria-current={sourceWorkspaceActive ? "page" : undefined}
      >
        <UploadCloud size={17} />
        Prepare
      </button>
      <button
        className={navigation.activeTab === "history" ? "active" : ""}
        type="button"
        onClick={navigation.openLibraryRoute}
        aria-current={navigation.activeTab === "history" ? "page" : undefined}
      >
        <History size={17} />
        Library
      </button>
      <ContextMenu
        label="More navigation"
        items={[
          {
            label: "Custom export",
            icon: <Settings2 size={15} />,
            disabled: !source.video,
            onSelect: () => {
              navigation.setActiveView("custom");
            }
          },
          {
            label: "New video",
            icon: <UploadCloud size={15} />,
            onSelect: navigation.startNewVideo
          }
        ]}
      />
    </nav>
  );
}

function HistoryView({ controller }: { controller: VideoOptimizerAppController }) {
  const { library } = controller;
  const jobsByVideo = new Map<string, typeof library.history.jobs>();
  for (const historyJob of library.history.jobs) {
    const groupedJobs = jobsByVideo.get(historyJob.videoId) ?? [];
    groupedJobs.push(historyJob);
    jobsByVideo.set(historyJob.videoId, groupedJobs);
  }
  const orphanJobs = library.history.jobs.filter(
    (historyJob) => !library.history.videos.some((historyVideo) => historyVideo.id === historyJob.videoId)
  );

  return (
    <section className="workflow-section">
      <SectionHeader
        icon={<History size={21} />}
        title="Library"
        kicker="Review uploaded sources, their related outputs, and local storage in one calm cleanup workspace."
      />
      <div className="history-actions library-toolbar">
        <button className="button secondary" type="button" onClick={() => void library.refreshHistory()}>
          Refresh
        </button>
        {library.selectedVideoIds.length + library.selectedJobIds.length > 0 && (
          <div className="selection-toolbar">
            <span>{library.selectedVideoIds.length + library.selectedJobIds.length} selected</span>
            <button className="button secondary" type="button" onClick={() => void library.deleteHistoryItems()}>
              <Trash2 size={18} />
              Delete
            </button>
            <button
              className="button quiet"
              type="button"
              onClick={() => {
                library.setSelectedVideoIds([]);
                library.setSelectedJobIds([]);
              }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
      <StoragePanel controller={controller} />
      <div className="history-layout source-group-layout">
        <div className="library-list-section source-group-section">
          <SectionHeader icon={<FileVideo size={20} />} title="Sources and outputs" />
          <div className="history-list source-group-list">
            {library.history.videos.length === 0 && <p className="muted">No uploaded files yet.</p>}
            {library.history.videos.map((historyVideo) => {
              const relatedJobs = jobsByVideo.get(historyVideo.id) ?? [];
              return (
                <section
                  className="source-group"
                  aria-label={`Source ${historyVideo.originalName}`}
                  key={historyVideo.id}
                >
                  <div className="history-item source-history-item">
                    <input
                      type="checkbox"
                      checked={library.selectedVideoIds.includes(historyVideo.id)}
                      onChange={() =>
                        library.setSelectedVideoIds((current) => library.toggleSelected(current, historyVideo.id))
                      }
                      aria-label={`Select source ${historyVideo.originalName}`}
                    />
                    <button
                      className="history-main"
                      type="button"
                      onClick={() => library.loadHistoryVideo(historyVideo)}
                    >
                      <strong title={historyVideo.originalName}>{historyVideo.originalName}</strong>
                      <span>
                        {formatBytes(historyVideo.metadata.fileSize)} /{" "}
                        {formatDuration(historyVideo.metadata.durationSeconds)} / {relatedJobs.length} outputs
                      </span>
                    </button>
                    <ContextMenu
                      label="Source row actions"
                      items={[
                        {
                          label: "Open source",
                          icon: <FileVideo size={15} />,
                          onSelect: () => library.loadHistoryVideo(historyVideo)
                        },
                        {
                          label: "Delete source",
                          icon: <Trash2 size={15} />,
                          destructive: true,
                          onSelect: () => void library.deleteHistoryItems([historyVideo.id], [])
                        }
                      ]}
                    />
                  </div>
                  <div className="source-output-list" aria-label={`Outputs for ${historyVideo.originalName}`}>
                    {relatedJobs.length === 0 && <p className="muted">No related outputs yet.</p>}
                    {relatedJobs.map((historyJob) => (
                      <HistoryOutputRow controller={controller} historyJob={historyJob} key={historyJob.id} />
                    ))}
                  </div>
                </section>
              );
            })}
            {orphanJobs.length > 0 && (
              <section className="source-group" aria-label="Outputs without a local source">
                <div className="source-group-heading">
                  <strong>Outputs without a local source</strong>
                  <span>{orphanJobs.length} output(s)</span>
                </div>
                <div className="source-output-list">
                  {orphanJobs.map((historyJob) => (
                    <HistoryOutputRow controller={controller} historyJob={historyJob} key={historyJob.id} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function HistoryOutputRow({
  controller,
  historyJob
}: {
  controller: VideoOptimizerAppController;
  historyJob: VideoOptimizerAppController["library"]["history"]["jobs"][number];
}) {
  const { library, jobs } = controller;
  const owningVideo = library.history.videos.find((historyVideo) => historyVideo.id === historyJob.videoId);
  const filename = historyJob.outputFileName ?? historyJob.id;
  return (
    <div className="history-item output-history-item">
      <input
        type="checkbox"
        checked={library.selectedJobIds.includes(historyJob.id)}
        onChange={() => library.setSelectedJobIds((current) => library.toggleSelected(current, historyJob.id))}
        aria-label={`Select output ${filename}`}
      />
      <button
        className="history-main"
        type="button"
        onClick={() => {
          if (owningVideo) library.loadHistoryVideo(owningVideo);
          jobs.selectVariation(historyJob);
        }}
      >
        <strong title={filename}>{filename}</strong>
        <span>
          {historyJob.kind} / {historyJob.status} / {formatBytes(historyJob.outputSize)}
        </span>
      </button>
      {historyJob.status === "running" && (
        <button className="button secondary" type="button" onClick={() => void jobs.cancelJob(historyJob)}>
          Cancel
        </button>
      )}
      <ContextMenu
        label="Output row actions"
        items={[
          {
            label: "Open related source",
            icon: <FileVideo size={15} />,
            onSelect: () => {
              if (owningVideo) library.loadHistoryVideo(owningVideo);
              jobs.selectVariation(historyJob);
            }
          },
          {
            label: "Delete output",
            icon: <Trash2 size={15} />,
            destructive: true,
            onSelect: () => void library.deleteHistoryItems([], [historyJob.id])
          }
        ]}
      />
    </div>
  );
}

function StoragePanel({ controller }: { controller: VideoOptimizerAppController }) {
  const { library } = controller;
  const storage = library.storageStatus;
  if (!storage) {
    return (
      <div className="storage-panel storage-banner">
        <SectionHeader icon={<HardDrive size={20} />} title="Storage" kicker="Checking local managed storage..." />
      </div>
    );
  }

  const pressureCopy =
    storage.pressure === "critical"
      ? "Storage is critically low"
      : storage.pressure === "warning"
        ? "Storage is low"
        : "Storage looks healthy.";
  const hasCleanup = storage.cleanup.staleTemporaryFileCount > 0;

  return (
    <div className={`storage-panel storage-banner pressure-${storage.pressure}`}>
      <div className="storage-banner-main">
        <HardDrive size={18} />
        <div>
          <strong>{pressureCopy}</strong>
          <span>
            {formatBytes(storage.managedBytes)} used ·{" "}
            {storage.availableBytes === undefined ? "Unknown" : formatBytes(storage.availableBytes)} available
          </span>
        </div>
      </div>
      <details className="details-panel storage-details">
        <summary>Review storage</summary>
        <div className="storage-grid">
          <span>
            <strong>{formatBytes(storage.managedBytes)}</strong>
            <em>managed by this app</em>
          </span>
          <span>
            <strong>{storage.availableBytes === undefined ? "Unknown" : formatBytes(storage.availableBytes)}</strong>
            <em>available on disk</em>
          </span>
        </div>
        <div className="storage-grid">
          <span>
            <strong>{formatBytes(storage.reservedBytes)}</strong>
            <em>reserved for active work</em>
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
      </details>
      {library.storageCleanupStatus && <p className="success-text">{library.storageCleanupStatus}</p>}
    </div>
  );
}

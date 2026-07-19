import React from "react";
import {
  Download,
  Expand,
  Layers,
  Maximize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScanSearch,
  SplitSquareVertical,
  StepBack,
  StepForward,
  ToggleLeft,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import type { JobDto } from "@local-video-optimizer/contracts";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { jobDownloadUrl, jobOutputUrl } from "../../api/urls";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { formatBytes } from "../../domain/formatters";
import { buildSizeComparison, describeMediaError, jobTitle } from "../../domain/job-presenters";
import { formatMediaTime, isTextEntryElement } from "../media/media-time";
import { clampWipePosition, linkedViewTransform, nextFrameTime } from "./compare-inspection";

type ComparePane = {
  id: string;
  label: string;
  filename?: string;
  src: string;
  sizeLabel: string;
  outcomeLabel?: string;
  detailLabel?: string;
  job?: JobDto;
};

type CompareLayout = "auto" | "one" | "two" | "four";
type CompareMode = "grid" | "wipe" | "ab";
type ZoomLevel = 1 | 2 | 3;

export function CompareView({ controller }: { controller: VideoOptimizerAppController }) {
  const { apiBaseUrl, source, jobs, compare } = controller;
  const navigation = controller.navigation ?? {};
  const video = source.video;
  const workspaceRef = React.useRef<HTMLElement | null>(null);
  const videoOutputs = React.useMemo(
    () =>
      jobs.completedOutputJobs.filter(
        (output) => output.status === "completed" && (output.kind === "encode" || output.kind === "mux")
      ),
    [jobs.completedOutputJobs]
  );
  const panes = React.useMemo<ComparePane[]>(() => {
    if (!video) return [];
    const sourcePane: ComparePane = {
      id: "source",
      label: "Original",
      filename: video.originalName,
      src: source.sourceUrl,
      sizeLabel: formatBytes(video.metadata.fileSize)
    };
    return [
      sourcePane,
      ...videoOutputs.map((output) => {
        const comparison = buildSizeComparison(video.metadata.fileSize, output.outputSize);
        return {
          id: output.id,
          label: jobTitle(output),
          filename: output.outputFileName,
          src: jobOutputUrl(apiBaseUrl, output.id),
          sizeLabel: formatBytes(output.outputSize),
          outcomeLabel: comparison.changeLabel,
          detailLabel: comparison.detailLabel,
          job: output
        };
      })
    ];
  }, [apiBaseUrl, source.sourceUrl, video, videoOutputs]);

  const preferredJobId =
    jobs.job?.status === "completed" && (jobs.job.kind === "encode" || jobs.job.kind === "mux")
      ? jobs.job.id
      : videoOutputs[0]?.id;
  const defaultIds = React.useMemo(() => {
    if (compare.compareAllRequested) return panes.slice(0, 4).map((pane) => pane.id);
    return ["source", preferredJobId].filter((id): id is string => Boolean(id));
  }, [compare.compareAllRequested, panes, preferredJobId]);

  const currentRoute = React.useMemo(
    () => navigation.route ?? ({ view: "compare", sourceId: video?.id ?? "source" } as const),
    [navigation.route, video?.id]
  );
  const initialCompareRoute = currentRoute.view === "compare" ? currentRoute : undefined;
  const initialVisibleIds =
    initialCompareRoute?.compareIds?.filter((id) => id === "source" || panes.some((pane) => pane.id === id)) ??
    defaultIds;
  const [visibleIds, setVisibleIds] = React.useState<string[]>(
    initialVisibleIds.length > 0 ? initialVisibleIds : defaultIds
  );
  const [layoutState, setLayoutState] = React.useState<CompareLayout>(initialCompareRoute?.compareLayout ?? "auto");
  const [modeState, setModeState] = React.useState<CompareMode>(initialCompareRoute?.compareMode ?? "grid");
  const [focusedPaneId, setFocusedPaneId] = React.useState("source");
  const [selectedOutputIdState, setSelectedOutputIdState] = React.useState(
    initialCompareRoute?.outputId ?? preferredJobId ?? videoOutputs[0]?.id ?? ""
  );
  const [wipePosition, setWipePosition] = React.useState(50);
  const [abShowingOriginal, setAbShowingOriginal] = React.useState(false);
  const [zoom, setZoom] = React.useState<ZoomLevel>(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = React.useState<{ x: number; y: number; panX: number; panY: number } | null>(null);

  React.useEffect(() => {
    if (!visibleIds.includes(compare.audioSource) && compare.audioSource !== "muted") {
      compare.selectAudioSource(visibleIds.includes("source") ? "source" : (visibleIds[0] ?? "muted"));
    }
  }, [compare, visibleIds]);

  const routeCompareState = currentRoute.view === "compare" ? currentRoute : undefined;
  const mode = routeCompareState?.compareMode ?? modeState;
  const layout = routeCompareState?.compareLayout ?? layoutState;
  const selectedOutputId = routeCompareState?.outputId ?? selectedOutputIdState;

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (mode !== "ab" || isTextEntryElement(event.target) || event.repeat) return;
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        setAbShowingOriginal(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (mode !== "ab" || isTextEntryElement(event.target)) return;
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        setAbShowingOriginal(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [mode]);

  if (!video) return null;

  const visiblePanes = panes.filter((pane) => visibleIds.includes(pane.id));
  const selectedOutput = panes.find((pane) => pane.id === selectedOutputId && pane.id !== "source") ?? visiblePanes[1];
  const sourcePane = panes[0];
  const pairPanes = [sourcePane, selectedOutput].filter((pane): pane is ComparePane => Boolean(pane));
  const activePanes = mode === "grid" ? visiblePanes : pairPanes;
  const layoutClass = layout === "auto" ? `count-${visiblePanes.length}` : `layout-${layout}`;
  const focusedPane = visiblePanes.find((pane) => pane.id === focusedPaneId) ?? visiblePanes[0];
  const canAddPane = panes.some((pane) => !visibleIds.includes(pane.id));
  const duration = compare.compareDuration || video.metadata.durationSeconds || 0;
  const progressPercent = duration ? Math.min(100, (compare.compareCurrentTime / duration) * 100) : 0;
  const transformStyle = { transform: linkedViewTransform({ zoom, panX: pan.x, panY: pan.y }) } as React.CSSProperties;

  function addPane(id: string) {
    if (!id || visibleIds.includes(id)) return;
    const nextIds = [...visibleIds, id].slice(0, 4);
    setVisibleIds(nextIds);
    updateCompareRoute({ compareIds: nextIds });
  }

  function removePane(id: string) {
    const nextIds = visibleIds.length <= 1 ? visibleIds : visibleIds.filter((paneId) => paneId !== id);
    setVisibleIds(nextIds);
    updateCompareRoute({ compareIds: nextIds });
    if (focusedPaneId === id) setFocusedPaneId("source");
  }

  function updateCompareRoute(
    updates: Partial<{
      outputId: string;
      compareMode: CompareMode;
      compareLayout: CompareLayout;
      compareIds: string[];
    }>
  ) {
    if (!video) return;
    navigation.replaceActiveViewRoute?.({
      view: "compare",
      sourceId: video.id,
      outputId: updates.outputId ?? selectedOutput?.id,
      compareMode: updates.compareMode ?? mode,
      compareLayout: updates.compareLayout ?? layout,
      compareIds: updates.compareIds ?? visibleIds
    });
  }

  function selectMode(nextMode: CompareMode) {
    setModeState(nextMode);
    setAbShowingOriginal(nextMode !== "ab" ? false : abShowingOriginal);
    updateCompareRoute({ compareMode: nextMode });
    window.setTimeout(() => compare.seekAll(compare.compareCurrentTime), 0);
  }

  function selectLayout(nextLayout: CompareLayout) {
    setLayoutState(nextLayout);
    updateCompareRoute({ compareLayout: nextLayout });
  }

  function selectOutput(nextOutputId: string) {
    setSelectedOutputIdState(nextOutputId);
    updateCompareRoute({ outputId: nextOutputId });
  }

  function stepFrame(direction: -1 | 1) {
    if (compare.comparePlaying) return;
    compare.seekAll(nextFrameTime(compare.compareCurrentTime, direction));
  }

  function resetInspection() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setWipePosition(50);
  }

  async function requestFullscreen() {
    const target = workspaceRef.current;
    if (!target?.requestFullscreen) return;
    await target.requestFullscreen().catch(() => undefined);
  }

  function handleTransportKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (isTextEntryElement(event.target)) return;
    if (event.key === " " || event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (compare.comparePlaying) compare.pauseAll();
      else void compare.playAll();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      compare.seekAll(compare.compareCurrentTime - 5);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      compare.seekAll(compare.compareCurrentTime + 5);
    }
    if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      compare.selectAudioSource(compare.audioSource === "muted" ? "source" : "muted");
    }
    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      resetInspection();
    }
  }

  function handlePanStart(event: React.PointerEvent<HTMLElement>) {
    if (zoom === 1 || event.button !== 0 || isInteractiveCompareTarget(event.target)) {
      setDragStart(null);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({ x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y });
  }

  function handlePanMove(event: React.PointerEvent<HTMLElement>) {
    if (!dragStart) return;
    setPan({
      x: dragStart.panX + event.clientX - dragStart.x,
      y: dragStart.panY + event.clientY - dragStart.y
    });
  }

  function handlePanEnd() {
    setDragStart(null);
  }

  function handleCompareControlPointer(event: React.PointerEvent<HTMLElement>) {
    event.stopPropagation();
    setDragStart(null);
  }

  function isInteractiveCompareTarget(target: EventTarget) {
    return (
      target instanceof Element &&
      Boolean(
        target.closest(
          "button, a, input, select, textarea, label, .compare-pane-overlay, .compare-pane-footer, .ab-switcher"
        )
      )
    );
  }

  const renderPane = (pane: ComparePane, options: { layered?: boolean; clip?: string; hidden?: boolean } = {}) => {
    const error = compare.compareMediaErrors[pane.id];
    const isUnsupported = error?.toLowerCase().includes("cannot preview");
    return (
      <div
        className={`compare-pane ${focusedPane?.id === pane.id ? "focused" : ""} ${error ? "has-media-state" : ""}`}
        key={pane.id}
        style={options.clip ? ({ "--wipe-clip": options.clip } as React.CSSProperties) : undefined}
        data-layered={options.layered ? "true" : undefined}
        hidden={options.hidden}
      >
        <div className="compare-pane-overlay">
          <div>
            <strong>{pane.label}</strong>
            <span>{pane.outcomeLabel ? `${pane.sizeLabel} · ${pane.outcomeLabel}` : pane.sizeLabel}</span>
          </div>
          <div className="compare-pane-actions">
            <button
              type="button"
              className={`media-icon-button ${compare.audioSource === pane.id ? "active" : ""}`}
              onClick={() => compare.selectAudioSource(pane.id)}
              aria-label={`Use ${pane.label} audio`}
              title={`Use ${pane.label} audio`}
            >
              <Volume2 size={15} />
            </button>
            <button
              type="button"
              className="media-icon-button"
              onClick={() => setFocusedPaneId(pane.id)}
              aria-label={`Make ${pane.label} primary`}
            >
              <Maximize2 size={15} />
            </button>
            {mode === "grid" && visiblePanes.length > 1 && (
              <button
                type="button"
                className="media-icon-button"
                onClick={() => removePane(pane.id)}
                aria-label={`Remove ${pane.label} from comparison`}
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
        <div className="compare-media-stage" style={transformStyle}>
          <video
            ref={compare.registerCompareVideo(pane.id)}
            src={pane.src}
            preload="metadata"
            playsInline
            muted={compare.audioSource === "muted" || compare.audioSource !== pane.id}
            onLoadedMetadata={(event) => {
              if (compare.compareCurrentTime > 0) event.currentTarget.currentTime = compare.compareCurrentTime;
              compare.setCompareMediaErrors((current) => ({ ...current, [pane.id]: undefined }));
            }}
            onError={(event) =>
              compare.setCompareMediaErrors((current) => ({
                ...current,
                [pane.id]: describeMediaError(event.currentTarget)
              }))
            }
            onPlay={() => compare.syncVideoState(pane.id, "play")}
            onPause={() => compare.syncVideoState(pane.id, "pause")}
            onSeeked={() => compare.syncVideoState(pane.id, "seek")}
            onRateChange={() => compare.syncVideoState(pane.id, "rate")}
          />
        </div>
        {error && (
          <div className="compare-media-state" role="status">
            <strong>{isUnsupported ? "Preview unavailable in this browser" : "Media could not be loaded"}</strong>
            <span>
              {isUnsupported ? "This format cannot be decoded in this browser." : "The preview stream is unavailable."}
            </span>
            <div>
              {pane.job && <a href={jobDownloadUrl(apiBaseUrl, pane.job.id)}>Download</a>}
              {pane.id !== "source" && (
                <button type="button" onClick={() => removePane(pane.id)}>
                  Remove
                </button>
              )}
            </div>
          </div>
        )}
        <footer className="compare-pane-footer">
          <span>{pane.filename}</span>
          {pane.detailLabel && <span>{pane.detailLabel}</span>}
          {pane.job && (
            <a href={jobDownloadUrl(apiBaseUrl, pane.job.id)}>
              <Download size={14} />
              Download
            </a>
          )}
        </footer>
      </div>
    );
  };

  return (
    <section className="workflow-section compare-workspace" id="compare" ref={workspaceRef}>
      <SectionHeader
        icon={<Layers size={21} />}
        title="Compare"
        kicker="Inspect quality, size, and browser support at the same timestamp."
      />
      <div className="compare-toolbar">
        <div className="compare-mode-controls" aria-label="Comparison mode">
          {(["grid", "wipe", "ab"] as CompareMode[]).map((nextMode) => (
            <button
              className={mode === nextMode ? "active" : ""}
              type="button"
              onClick={() => selectMode(nextMode)}
              key={nextMode}
            >
              {nextMode === "grid" && <Layers size={15} />}
              {nextMode === "wipe" && <SplitSquareVertical size={15} />}
              {nextMode === "ab" && <ToggleLeft size={15} />}
              {nextMode === "grid" ? "Grid" : nextMode === "wipe" ? "Wipe" : "A/B"}
            </button>
          ))}
        </div>
        {mode === "grid" && (
          <div className="compare-layout-controls" aria-label="Comparison layout">
            {(["auto", "one", "two", "four"] as CompareLayout[]).map((nextLayout) => (
              <button
                className={layout === nextLayout ? "active" : ""}
                type="button"
                onClick={() => selectLayout(nextLayout)}
                key={nextLayout}
              >
                {nextLayout === "auto"
                  ? "Auto"
                  : nextLayout === "one"
                    ? "1-up"
                    : nextLayout === "two"
                      ? "2-up"
                      : "4-up"}
              </button>
            ))}
          </div>
        )}
        {mode !== "grid" && selectedOutput && (
          <label className="compare-add-pane">
            Version
            <select
              value={selectedOutput.id}
              onChange={(event) => {
                selectOutput(event.target.value);
                window.setTimeout(() => compare.seekAll(compare.compareCurrentTime), 0);
              }}
              aria-label="Selected compressed comparison version"
            >
              {panes
                .filter((pane) => pane.id !== "source")
                .map((pane) => (
                  <option value={pane.id} key={pane.id}>
                    {pane.label}
                  </option>
                ))}
            </select>
          </label>
        )}
        {mode === "grid" && canAddPane && (
          <label className="compare-add-pane">
            <Plus size={15} />
            Add version
            <select value="" onChange={(event) => addPane(event.target.value)} aria-label="Add comparison version">
              <option value="">Choose</option>
              {panes
                .filter((pane) => !visibleIds.includes(pane.id))
                .map((pane) => (
                  <option value={pane.id} key={pane.id}>
                    {pane.label}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>

      <div className="compare-narrow-selector" aria-label="Visible comparison version">
        {activePanes.map((pane) => (
          <button
            className={focusedPane?.id === pane.id ? "active" : ""}
            type="button"
            onClick={() => {
              setFocusedPaneId(pane.id);
              if (pane.id !== "source") selectOutput(pane.id);
              window.setTimeout(() => compare.seekAll(compare.compareCurrentTime), 0);
            }}
            key={pane.id}
          >
            {pane.label}
          </button>
        ))}
      </div>

      {mode === "grid" && (
        <div
          className={`compare-canvas compare-grid ${layoutClass}`}
          data-testid="compare-grid"
          onPointerDown={handlePanStart}
          onPointerMove={handlePanMove}
          onPointerUp={handlePanEnd}
          onPointerCancel={handlePanEnd}
        >
          {visiblePanes.map((pane) => renderPane(pane))}
        </div>
      )}

      {mode === "wipe" && sourcePane && selectedOutput && (
        <div
          className="compare-canvas compare-wipe"
          data-testid="compare-wipe"
          style={{ "--wipe-position": `${wipePosition}%` } as React.CSSProperties}
          onPointerDown={handlePanStart}
          onPointerMove={handlePanMove}
          onPointerUp={handlePanEnd}
          onPointerCancel={handlePanEnd}
        >
          <div className="wipe-layer wipe-after">{renderPane(selectedOutput, { layered: true })}</div>
          <div className="wipe-layer wipe-before">{renderPane(sourcePane, { layered: true })}</div>
          <div className="wipe-side-label left">Original</div>
          <div className="wipe-side-label right">{selectedOutput.label}</div>
          <button
            className="wipe-reset"
            type="button"
            onPointerDown={handleCompareControlPointer}
            onClick={() => setWipePosition(50)}
            aria-label="Reset wipe divider to center"
          >
            <RotateCcw size={14} />
            50%
          </button>
          <input
            className="wipe-divider"
            type="range"
            min={0}
            max={100}
            value={wipePosition}
            onPointerDown={handleCompareControlPointer}
            onPointerMove={handleCompareControlPointer}
            onPointerUp={handleCompareControlPointer}
            onPointerCancel={handleCompareControlPointer}
            onChange={(event) => setWipePosition(clampWipePosition(Number(event.target.value)))}
            aria-label="Wipe divider position"
            aria-valuetext={`${wipePosition}% original visible`}
          />
        </div>
      )}

      {mode === "ab" && sourcePane && selectedOutput && (
        <div
          className="compare-canvas compare-ab"
          data-testid="compare-ab"
          onPointerDown={handlePanStart}
          onPointerMove={handlePanMove}
          onPointerUp={handlePanEnd}
          onPointerCancel={handlePanEnd}
        >
          {renderPane(abShowingOriginal ? sourcePane : selectedOutput)}
          <div
            className="ab-switcher"
            aria-label="A/B visible version"
            onPointerDown={handleCompareControlPointer}
            onPointerMove={handleCompareControlPointer}
            onPointerUp={handleCompareControlPointer}
          >
            <button
              className={abShowingOriginal ? "active" : ""}
              type="button"
              onClick={() => setAbShowingOriginal(true)}
            >
              Original
            </button>
            <button
              className={!abShowingOriginal ? "active" : ""}
              type="button"
              onClick={() => setAbShowingOriginal(false)}
            >
              {selectedOutput.label}
            </button>
          </div>
          <p className="ab-shortcut">Hold O to temporarily show Original.</p>
        </div>
      )}

      <div
        className="compare-transport"
        role="group"
        aria-label="Synchronized comparison controls"
        onKeyDown={handleTransportKeyDown}
        tabIndex={0}
      >
        <button
          className="media-icon-button transport-play"
          type="button"
          onClick={() => (compare.comparePlaying ? compare.pauseAll() : void compare.playAll())}
          aria-label={compare.comparePlaying ? "Pause comparison" : "Play comparison"}
          title={compare.comparePlaying ? "Pause" : "Play"}
        >
          {compare.comparePlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <span className="media-time">
          {formatMediaTime(compare.compareCurrentTime)} / {formatMediaTime(duration)}
        </span>
        <input
          className="media-timeline compare-timeline"
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={Math.min(compare.compareCurrentTime, duration)}
          onChange={(event) => compare.seekAll(Number(event.target.value))}
          aria-label="Seek synchronized comparison"
          aria-valuetext={`${formatMediaTime(compare.compareCurrentTime)} of ${formatMediaTime(duration)}`}
          style={{ "--played": `${progressPercent}%`, "--buffered": `${progressPercent}%` } as React.CSSProperties}
        />
        <button
          className="media-icon-button"
          type="button"
          onClick={() => stepFrame(-1)}
          disabled={compare.comparePlaying}
          aria-label="Previous approximate frame"
          title="Previous frame while paused"
        >
          <StepBack size={16} />
        </button>
        <button
          className="media-icon-button"
          type="button"
          onClick={() => stepFrame(1)}
          disabled={compare.comparePlaying}
          aria-label="Next approximate frame"
          title="Next frame while paused"
        >
          <StepForward size={16} />
        </button>
        <button
          className="media-icon-button"
          type="button"
          onClick={() => compare.selectAudioSource(compare.audioSource === "muted" ? "source" : "muted")}
          aria-label={compare.audioSource === "muted" ? "Restore comparison audio" : "Mute all comparison audio"}
          title={compare.audioSource === "muted" ? "Restore audio" : "Mute all"}
        >
          {compare.audioSource === "muted" ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <select
          value={compare.audioSource}
          onChange={(event) => compare.selectAudioSource(event.target.value)}
          aria-label="Comparison audio source"
          title="Audio source"
        >
          {activePanes.map((pane) => (
            <option value={pane.id} key={pane.id}>
              {pane.label}
            </option>
          ))}
          <option value="muted">Mute all</option>
        </select>
        <select
          value={compare.comparePlaybackRate}
          onChange={(event) => compare.setAllPlaybackRate(Number(event.target.value))}
          aria-label="Comparison playback speed"
          title="Playback speed"
        >
          {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
            <option value={rate} key={rate}>
              {rate}x
            </option>
          ))}
        </select>
        <div className="compare-zoom-controls" aria-label="Linked zoom controls">
          {([1, 2, 3] as ZoomLevel[]).map((nextZoom) => (
            <button
              className={zoom === nextZoom ? "active" : ""}
              type="button"
              onClick={() => setZoom(nextZoom)}
              aria-label={nextZoom === 1 ? "Fit comparison view" : `Zoom comparison to ${nextZoom * 100}%`}
              title={nextZoom === 1 ? "Fit" : `${nextZoom * 100}%`}
              key={nextZoom}
            >
              {nextZoom === 1 ? "Fit" : `${nextZoom}x`}
            </button>
          ))}
        </div>
        <button
          className={`media-icon-button ${compare.compareLoop ? "active" : ""}`}
          type="button"
          onClick={() => compare.setAllLoop(!compare.compareLoop)}
          aria-label={compare.compareLoop ? "Disable comparison loop" : "Enable comparison loop"}
          title="Loop"
        >
          <RotateCcw size={16} />
        </button>
        <button
          className="media-icon-button"
          type="button"
          onClick={resetInspection}
          aria-label="Reset comparison view"
        >
          <ScanSearch size={16} />
        </button>
        <button
          className="media-icon-button"
          type="button"
          onClick={() => void requestFullscreen()}
          aria-label="Fullscreen comparison"
        >
          <Expand size={16} />
        </button>
      </div>
      <p className="compare-sync-note">
        Frame stepping and synchronization are best-effort by timestamp; browser decoding can vary slightly across
        codecs.
      </p>
    </section>
  );
}

import { BadgeCheck, Copy, Download, Layers } from "lucide-react";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { jobDownloadUrl } from "../../api/urls";
import { formatBytes } from "../../domain/formatters";
import {
  codecLabel,
  describeMediaError,
  fileSizeDelta,
  nextExportSuggestion,
  variationLabel
} from "../../domain/job-presenters";
import { Field } from "../../components/ui/Field";
import { SectionHeader } from "../../components/ui/SectionHeader";

export function CompareView({ controller }: { controller: VideoOptimizerAppController }) {
  const { apiBaseUrl, source, jobs, poster, compare: compareState } = controller;
  const {
    compareMediaErrors,
    completedReduction,
    downloadUrl,
    optimizedCompareRef,
    originalCompareRef,
    outputUrl,
    setCompareMediaErrors,
    setSyncPlayback,
    syncPlayback,
    syncVideoState,
    videoMarkup
  } = compareState;
  const video = source.video;
  const job = jobs.job;
  if (!video) return null;

  return (
    <section className="workflow-section" id="compare">
      <SectionHeader
        icon={<Layers size={21} />}
        title="Compare & Download"
        kicker={
          job?.status === "completed" && job.kind === "encode"
            ? `Reviewing ${job.outputFileName ?? variationLabel(job)}.`
            : "Your completed export will appear here after processing."
        }
      />
      {job?.status === "completed" && job.kind === "encode" ? (
        <div className="compare-theater">
          <div className="theater-toolbar">
            <div>
              <strong>{job.outputFileName ?? "Optimized video"}</strong>
              <span>
                {completedReduction === undefined ? "Optimized output" : `${completedReduction}% smaller than source`}
              </span>
            </div>
            <label className="sync-toggle">
              <input
                type="checkbox"
                checked={syncPlayback}
                onChange={(event) => setSyncPlayback(event.target.checked)}
              />
              Sync playback
            </label>
          </div>
          <div className="theater-canvas">
            <div className="theater-pane">
              <span className="theater-label">Original</span>
              <video
                controls
                ref={originalCompareRef}
                src={source.sourceUrl}
                onLoadedData={() => setCompareMediaErrors((current) => ({ ...current, original: undefined }))}
                onError={(event) =>
                  setCompareMediaErrors((current) => ({
                    ...current,
                    original: describeMediaError(event.currentTarget)
                  }))
                }
                onPlay={() => syncVideoState("original", "play")}
                onPause={() => syncVideoState("original", "pause")}
                onSeeked={() => syncVideoState("original", "seek")}
                onRateChange={() => syncVideoState("original", "rate")}
              />
            </div>
            <div className="theater-divider" />
            <div className="theater-pane">
              <span className="theater-label optimized">Optimized</span>
              <video
                controls
                ref={optimizedCompareRef}
                src={outputUrl}
                onLoadedData={() => setCompareMediaErrors((current) => ({ ...current, optimized: undefined }))}
                onError={(event) =>
                  setCompareMediaErrors((current) => ({
                    ...current,
                    optimized: describeMediaError(event.currentTarget)
                  }))
                }
                onPlay={() => syncVideoState("optimized", "play")}
                onPause={() => syncVideoState("optimized", "pause")}
                onSeeked={() => syncVideoState("optimized", "seek")}
                onRateChange={() => syncVideoState("optimized", "rate")}
              />
            </div>
          </div>
          {(compareMediaErrors.original || compareMediaErrors.optimized) && (
            <div className="notice warn compare-media-error">
              <strong>Preview issue</strong>
              {compareMediaErrors.original && <span>Original: {compareMediaErrors.original}</span>}
              {compareMediaErrors.optimized && <span>Optimized: {compareMediaErrors.optimized}</span>}
              {compareMediaErrors.optimized && (
                <a className="button secondary" href={downloadUrl}>
                  <Download size={17} />
                  Download Instead
                </a>
              )}
            </div>
          )}
          <div className="theater-footer">
            <div className="theater-stats">
              <Field label="Original" value={formatBytes(video.metadata.fileSize)} />
              <Field label="Optimized" value={formatBytes(job.outputSize)} />
              <Field
                label="Format"
                value={`${job.settings.outputContainer.toUpperCase()} / ${codecLabel(job.settings.videoCodec)}`}
              />
              <Field label="Savings" value={fileSizeDelta(job.outputSize, video.metadata.fileSize)} />
            </div>
            <div className="actions">
              <a className="button primary" href={downloadUrl}>
                <Download size={18} />
                Download Video
              </a>
              {poster.posterUrl && (
                <a
                  className="button secondary"
                  href={jobs.posterJob ? jobDownloadUrl(apiBaseUrl, jobs.posterJob.id) : ""}
                >
                  <Download size={18} />
                  Poster
                </a>
              )}
              <button
                className="button secondary"
                type="button"
                onClick={() => navigator.clipboard.writeText(job.ffmpegCommand)}
              >
                <Copy size={18} />
                FFmpeg
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => navigator.clipboard.writeText(videoMarkup)}
              >
                <Copy size={18} />
                HTML
              </button>
            </div>
          </div>
          <details className="details-panel compare-details">
            <summary>Command and website markup</summary>
            <h3>FFmpeg Command</h3>
            <pre>{job.ffmpegCommand}</pre>
            <h3>Website Markup</h3>
            <pre>{videoMarkup}</pre>
            <div className="notice info">{nextExportSuggestion(job.settings)}</div>
          </details>
        </div>
      ) : (
        <div className="panel empty-panel">
          <SectionHeader icon={<BadgeCheck size={20} />} title="No Export Yet" />
          <p className="muted">
            Choose a preset, review the export summary, and process the video. The comparison view will open up here.
          </p>
        </div>
      )}
    </section>
  );
}

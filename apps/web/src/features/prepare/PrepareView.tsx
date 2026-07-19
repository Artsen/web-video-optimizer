import { FileVideo, Settings2, UploadCloud, Wand2, Package } from "lucide-react";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { formatBytes } from "../../domain/formatters";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { UploadPanel } from "./UploadPanel";
import { SourceDetails } from "./SourceDetails";

export function PrepareView({ controller }: { controller: VideoOptimizerAppController }) {
  const { navigation, source } = controller;
  const video = source.video;
  const isResultsState = navigation.activeView === "results" && Boolean(video);

  if (isResultsState && video) {
    return (
      <section className="workflow-section source-workspace-summary" id="upload" aria-label="Source preparation">
        <div className="compact-source-summary">
          <div>
            <span className="summary-kicker">Current source</span>
            <h2>Source</h2>
            <p>
              <strong>{video.originalName}</strong>
              <span>
                {video.metadata.width ?? "Unknown"} x {video.metadata.height ?? "Unknown"} /{" "}
                {formatBytes(video.metadata.fileSize)}
              </span>
            </p>
          </div>
          <div className="actions">
            <button className="button quiet" type="button" onClick={() => navigation.setActiveView("prepare")}>
              <UploadCloud size={18} />
              Full prepare view
            </button>
            <button className="button quiet" type="button" onClick={() => navigation.setActiveView("custom")}>
              <Settings2 size={18} />
              Custom Export
            </button>
          </div>
        </div>
        <details className="details-panel compact-prepare-details">
          <summary>
            <FileVideo size={17} />
            Edit source / preparation options
          </summary>
          <div className="upload-layout compact-prepare-body">
            <UploadPanel controller={controller} />
            <div className="prepare-side">
              <RecommendationActions controller={controller} />
              <SourceDetails controller={controller} />
            </div>
          </div>
        </details>
      </section>
    );
  }

  return (
    <section className="workflow-section" id="upload">
      <SectionHeader
        icon={<UploadCloud size={21} />}
        title={video ? "Prepare" : "Ready for a source video"}
        kicker={
          video
            ? "Review the source, then create the recommended MP4, WebM, poster, and caption-ready package."
            : "Create a fast, compatible website video package while keeping every file on this computer."
        }
      />
      <div className="upload-layout">
        <UploadPanel controller={controller} />
        {video ? (
          <div className="prepare-side">
            <RecommendationActions controller={controller} />
            <SourceDetails controller={controller} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RecommendationActions({ controller }: { controller: VideoOptimizerAppController }) {
  const { navigation, source, jobs } = controller;
  const video = source.video;
  if (!video) return null;
  const hasResults = jobs.finishedOutputJobs.length > 0;

  return (
    <div className="recommendation-hero">
      <div className="recommendation-copy">
        <span className="recommendation-kicker">Recommended outcome</span>
        <h2>Optimize for website</h2>
        <p>
          Expected result: approximately <strong>625 KB-1.2 MB</strong>. Likely <strong>87-94% smaller</strong> than
          this {formatBytes(video.metadata.fileSize)} source.
        </p>
        <div className="actions">
          <button
            className="button primary"
            type="button"
            onClick={jobs.optimizeForWebsite}
            disabled={!video || jobs.job?.status === "running" || jobs.posterJob?.status === "running"}
          >
            <Wand2 size={18} />
            Optimize For Website
          </button>
          <button className="button quiet" type="button" onClick={() => navigation.setActiveView("custom")}>
            <Settings2 size={18} />
            Custom Export
          </button>
          {hasResults && (
            <button
              className="button quiet"
              type="button"
              onClick={() => navigation.setActiveView("results", jobs.finishedOutputJobs[0]?.id)}
            >
              <Package size={18} />
              Jump to results
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

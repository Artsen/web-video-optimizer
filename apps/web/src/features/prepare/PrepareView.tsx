import { Settings2, UploadCloud, Wand2, Package, Sparkles } from "lucide-react";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { formatBytes, formatDuration } from "../../domain/formatters";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { UploadPanel } from "./UploadPanel";
import { SourceDetails } from "./SourceDetails";

export function PrepareView({ controller }: { controller: VideoOptimizerAppController }) {
  const { navigation, source, jobs } = controller;
  const video = source.video;

  return (
    <section className="workflow-section" id="upload">
      <SectionHeader
        icon={<UploadCloud size={21} />}
        title="Upload & Inspect"
        kicker="Start with a local source file. The app analyzes it with FFprobe and keeps everything on this machine."
      />
      <div className="assistant-card">
        <div className="assistant-avatar">
          <Sparkles size={19} />
        </div>
        <div className="assistant-message">
          <strong>
            {video ? `I inspected ${video.originalName}.` : "Drop in a video and I will prep it for the web."}
          </strong>
          <p>
            {video
              ? `Source is ${formatBytes(video.metadata.fileSize)}, ${formatDuration(video.metadata.durationSeconds)}, ${video.metadata.width ?? "unknown"} x ${video.metadata.height ?? "unknown"}. Recommended path: create an MP4 fallback, a modern WebM source, and a WebP poster image.`
              : "The simplest path is one button: upload, optimize for website delivery, compare, then download a package."}
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
            <button
              className="button secondary"
              type="button"
              onClick={() => navigation.setActiveView("custom")}
              disabled={!video}
            >
              <Settings2 size={18} />
              Choose Custom Export
            </button>
            {video && (
              <button className="button secondary" type="button" onClick={() => navigation.setActiveView("outputs")}>
                <Package size={18} />
                View Jobs & Outputs
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="upload-layout">
        <UploadPanel controller={controller} />
        <SourceDetails controller={controller} />
      </div>
    </section>
  );
}

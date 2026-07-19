import { Captions, Check, Copy, Download, Edit3, FolderOpen, Image, Layers, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { JobDto } from "@local-video-optimizer/contracts";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { jobDownloadUrl, jobOutputUrl, jobSidecarUrl } from "../../api/urls";
import { formatBytes } from "../../domain/formatters";
import { buildSizeComparison, codecLabel, jobTitle, variationDetails } from "../../domain/job-presenters";
import { ContextMenu } from "../../components/ui/ContextMenu";

export function OutputCard({
  controller,
  output,
  selected = false,
  onSelect
}: {
  controller: VideoOptimizerAppController;
  output: JobDto;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { apiBaseUrl, jobs, packagePanel, poster, source } = controller;
  const [editingName, setEditingName] = useState(false);
  const canInclude = output.status === "completed" && ["encode", "mux", "poster", "subtitle"].includes(output.kind);
  const packageChecked =
    canInclude &&
    packagePanel.packageCandidateJobs.length > 0 &&
    (packagePanel.selectedPackageJobIds.length === 0 ? true : packagePanel.selectedPackageJobIds.includes(output.id));
  const failed = output.status === "failed" || output.status === "canceled";
  const activeIds = [jobs.job?.id, jobs.posterJob?.id, jobs.packageJob?.id, jobs.subtitleJob?.id, jobs.muxJob?.id];
  const isVideoArtifact = output.kind === "encode" || output.kind === "mux";
  const canDownload = output.status === "completed";
  const sizeComparison = isVideoArtifact
    ? buildSizeComparison(source.video?.metadata.fileSize, output.outputSize)
    : undefined;
  const filename = output.outputFileName ?? output.id;
  const details = failed ? (output.message ?? output.status) : variationDetails(output);
  const technicalLabel = isVideoArtifact
    ? `${output.settings.outputContainer.toUpperCase()} / ${codecLabel(output.settings.videoCodec)}`
    : output.kind === "poster"
      ? "WebP poster"
      : output.kind === "subtitle"
        ? "VTT/SRT"
        : output.kind;

  return (
    <article
      className={`artifact-row artifact-list-row output-card ${failed ? "failed" : ""} ${activeIds.includes(output.id) ? "active" : ""} ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      {canInclude && (
        <button
          className={`package-indicator ${packageChecked ? "included" : ""}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            packagePanel.togglePackageJob(output.id);
          }}
          aria-label={packageChecked ? "Remove from package" : "Include in package"}
          title={packageChecked ? "Included in package" : "Not included in package"}
        >
          <Check size={14} />
        </button>
      )}
      <div className="artifact-main">
        <div className="artifact-title-row">
          <span className="output-kind">{jobTitle(output)}</span>
        </div>
        {editingName && output.outputFileName ? (
          <div className="name-editor output-name-editor inline-editor">
            <input
              value={jobs.jobNameDrafts[output.id] ?? output.outputFileName}
              onChange={(event) =>
                jobs.setJobNameDrafts((current) => ({ ...current, [output.id]: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void jobs.renameJobOutput(output);
                  setEditingName(false);
                }
                if (event.key === "Escape") setEditingName(false);
              }}
              aria-label={`Filename for ${output.outputFileName}`}
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => {
                void jobs.renameJobOutput(output);
                setEditingName(false);
              }}
              disabled={
                jobs.renamingJobId === output.id ||
                (jobs.jobNameDrafts[output.id] ?? output.outputFileName).trim() === output.outputFileName
              }
              aria-label="Save output filename"
            >
              <Check size={15} />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => setEditingName(false)}
              aria-label="Cancel rename"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <strong className="artifact-filename" title={filename}>
            {filename}
          </strong>
        )}
        <p>
          {isVideoArtifact
            ? `${codecLabel(output.settings.videoCodec)} · ${output.settings.width ?? "source"}px`
            : details}
        </p>
        {output.status === "completed" && output.kind === "poster" && (
          <button
            className="poster-thumb compact-poster-thumb"
            type="button"
            onClick={() => poster.openPosterLightbox(output)}
          >
            <img
              src={jobOutputUrl(apiBaseUrl, output.id)}
              alt={`${output.outputFileName ?? "Generated poster"} preview`}
            />
            <span>Preview poster</span>
          </button>
        )}
      </div>

      <div className={`artifact-savings ${sizeComparison?.tone ?? "neutral"}`}>
        <strong>{sizeComparison?.sizeLabel ?? formatBytes(output.outputSize)}</strong>
        {sizeComparison ? (
          <>
            <span>{sizeComparison.changeLabel}</span>
            <span>{sizeComparison.detailLabel}</span>
          </>
        ) : (
          <span>{technicalLabel}</span>
        )}
      </div>

      <div className="artifact-actions" onClick={(event) => event.stopPropagation()}>
        {canDownload && (
          <a className="button primary artifact-download" href={jobDownloadUrl(apiBaseUrl, output.id)}>
            <Download size={16} />
            {output.kind === "subtitle" ? "VTT" : "Download"}
          </a>
        )}
        {canDownload && isVideoArtifact && (
          <button
            className="button secondary compact-action"
            type="button"
            onClick={() => jobs.selectVariation(output)}
          >
            <Layers size={16} />
            Compare
          </button>
        )}
        {canDownload && output.kind === "poster" && (
          <button
            className="button secondary compact-action"
            type="button"
            onClick={() => poster.openPosterLightbox(output)}
          >
            <Image size={16} />
            Preview
          </button>
        )}
        {canDownload && output.kind === "subtitle" && (
          <button
            className="button secondary compact-action"
            type="button"
            onClick={() => void jobs.openSubtitleEditor(output)}
          >
            <Edit3 size={16} />
            Edit
          </button>
        )}
        <ContextMenu
          label="More output actions"
          items={[
            {
              label: "Rename",
              icon: <Edit3 size={15} />,
              disabled: !output.outputFileName,
              onSelect: () => setEditingName(true)
            },
            ...(canDownload && output.kind === "subtitle" && output.sidecarFileName
              ? [
                  {
                    label: "Download SRT",
                    icon: <Download size={15} />,
                    onSelect: () => {
                      window.location.href = jobSidecarUrl(apiBaseUrl, output.id);
                    }
                  }
                ]
              : []),
            ...(canDownload && isVideoArtifact && packagePanel.hasCaptions
              ? [
                  {
                    label: "Embed captions",
                    icon: <Captions size={15} />,
                    onSelect: () => void jobs.muxSubtitlesIntoVideo(output)
                  }
                ]
              : []),
            {
              label: packageChecked ? "Remove from package" : "Include in package",
              icon: <Check size={15} />,
              disabled: !canInclude,
              onSelect: () => packagePanel.togglePackageJob(output.id)
            },
            {
              label: "Reveal in folder",
              icon: <FolderOpen size={15} />,
              disabled: !canDownload,
              onSelect: () => void jobs.revealJobOutput(output)
            },
            ...(failed && output.ffmpegCommand
              ? [
                  {
                    label: "Copy command",
                    icon: <Copy size={15} />,
                    onSelect: () => void navigator.clipboard.writeText(output.ffmpegCommand ?? "")
                  }
                ]
              : []),
            {
              label: "Delete",
              icon: <Trash2 size={15} />,
              destructive: true,
              onSelect: () => void jobs.deleteHistoryItems([], [output.id])
            }
          ]}
        />
      </div>
    </article>
  );
}

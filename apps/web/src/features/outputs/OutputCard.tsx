import { Captions, Copy, Download, Edit3, FolderOpen, Image, Layers, Save, Trash2 } from "lucide-react";
import type { JobDto } from "@local-video-optimizer/contracts";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { jobDownloadUrl, jobOutputUrl, jobSidecarUrl } from "../../api/urls";
import { formatBytes } from "../../domain/formatters";
import { jobTitle, variationBadges, variationDetails } from "../../domain/job-presenters";
import { Field } from "../../components/ui/Field";

export function OutputCard({ controller, output }: { controller: VideoOptimizerAppController; output: JobDto }) {
  const { apiBaseUrl, jobs, packagePanel, poster } = controller;
  const canInclude = output.status === "completed" && ["encode", "mux", "poster", "subtitle"].includes(output.kind);
  const packageChecked =
    canInclude &&
    packagePanel.packageCandidateJobs.length > 0 &&
    (packagePanel.selectedPackageJobIds.length === 0 ? true : packagePanel.selectedPackageJobIds.includes(output.id));
  const failed = output.status === "failed" || output.status === "canceled";
  const activeIds = [jobs.job?.id, jobs.posterJob?.id, jobs.packageJob?.id, jobs.subtitleJob?.id, jobs.muxJob?.id];

  return (
    <article className={`output-card ${failed ? "failed" : ""} ${activeIds.includes(output.id) ? "active" : ""}`}>
      <div className="output-card-main">
        <span className="output-kind">{jobTitle(output)}</span>
        {output.outputFileName ? (
          <div className="name-editor output-name-editor">
            <input
              value={jobs.jobNameDrafts[output.id] ?? output.outputFileName}
              onChange={(event) =>
                jobs.setJobNameDrafts((current) => ({ ...current, [output.id]: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") void jobs.renameJobOutput(output);
              }}
              aria-label={`Filename for ${output.outputFileName}`}
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => void jobs.renameJobOutput(output)}
              disabled={
                jobs.renamingJobId === output.id ||
                (jobs.jobNameDrafts[output.id] ?? output.outputFileName).trim() === output.outputFileName
              }
              aria-label="Save output filename"
            >
              <Save size={15} />
            </button>
          </div>
        ) : (
          <h3>{output.id}</h3>
        )}
        <p>{failed ? (output.message ?? output.status) : variationDetails(output)}</p>
        {output.status === "completed" && output.kind === "poster" && (
          <button className="poster-thumb" type="button" onClick={() => poster.openPosterLightbox(output)}>
            <img
              src={jobOutputUrl(apiBaseUrl, output.id)}
              alt={`${output.outputFileName ?? "Generated poster"} preview`}
            />
            <span>Preview poster</span>
          </button>
        )}
        <div className="badge-row">
          {failed ? (
            <b>{output.status}</b>
          ) : (
            variationBadges(output, jobs.bestSavingsJob?.id).map((badge) => <b key={badge}>{badge}</b>)
          )}
        </div>
      </div>
      <div className="output-card-stats">
        <Field label="Status" value={output.status} />
        <Field label="Size" value={formatBytes(output.outputSize)} />
      </div>
      <div className="output-card-actions">
        {canInclude && (
          <label className="package-check">
            <input type="checkbox" checked={packageChecked} onChange={() => packagePanel.togglePackageJob(output.id)} />
            Use in package
          </label>
        )}
        {output.status === "completed" && (output.kind === "encode" || output.kind === "mux") && (
          <button className="button secondary" type="button" onClick={() => jobs.selectVariation(output)}>
            <Layers size={17} />
            Compare
          </button>
        )}
        {output.status === "completed" &&
          (output.kind === "encode" || output.kind === "mux") &&
          packagePanel.hasCaptions && (
            <button className="button secondary" type="button" onClick={() => void jobs.muxSubtitlesIntoVideo(output)}>
              <Captions size={17} />
              Embed Captions
            </button>
          )}
        {output.status === "completed" && (
          <>
            {output.kind === "poster" && (
              <button className="button secondary" type="button" onClick={() => poster.openPosterLightbox(output)}>
                <Image size={17} />
                Preview
              </button>
            )}
            {output.kind === "subtitle" && (
              <button className="button secondary" type="button" onClick={() => void jobs.openSubtitleEditor(output)}>
                <Edit3 size={17} />
                Edit
              </button>
            )}
            <a className="button secondary" href={jobDownloadUrl(apiBaseUrl, output.id)}>
              <Download size={17} />
              {output.kind === "subtitle" ? "VTT" : "Download"}
            </a>
            {output.kind === "subtitle" && output.sidecarFileName && (
              <a className="button secondary" href={jobSidecarUrl(apiBaseUrl, output.id)}>
                <Download size={17} />
                SRT
              </a>
            )}
            <button className="button secondary" type="button" onClick={() => void jobs.revealJobOutput(output)}>
              <FolderOpen size={17} />
              Folder
            </button>
          </>
        )}
        {failed && output.ffmpegCommand && (
          <button
            className="button secondary"
            type="button"
            onClick={() => navigator.clipboard.writeText(output.ffmpegCommand)}
          >
            <Copy size={17} />
            Copy Command
          </button>
        )}
        <button
          className="icon-button danger-button"
          type="button"
          onClick={() => void jobs.deleteHistoryItems([], [output.id])}
          aria-label="Delete output"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

import { CheckCircle2, Download, FolderOpen, Package } from "lucide-react";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { jobDownloadUrl } from "../../api/urls";
import { formatBytes, slugify } from "../../domain/formatters";
import { packageItemClass } from "../../domain/job-presenters";
import { SectionHeader } from "../../components/ui/SectionHeader";

export function PackagePanel({ controller }: { controller: VideoOptimizerAppController }) {
  const { apiBaseUrl, source, jobs, packagePanel, poster } = controller;
  const video = source.video;
  if (!video) return null;

  return (
    <aside className="panel package-panel">
      <SectionHeader
        icon={<CheckCircle2 size={20} />}
        title="Website Package"
        kicker="Everything needed to drop the video into a site."
      />
      <div className="package-checklist">
        <div className={packageItemClass(packagePanel.hasFallbackExport)}>
          <CheckCircle2 size={17} />
          <span>MP4 fallback</span>
        </div>
        <div className={packageItemClass(packagePanel.hasModernExport)}>
          <CheckCircle2 size={17} />
          <span>Modern WebM/AV1</span>
        </div>
        <div className={packageItemClass(packagePanel.hasPoster)}>
          <CheckCircle2 size={17} />
          <span>Poster image</span>
        </div>
        <div className={packageItemClass(packagePanel.hasCaptions)}>
          <CheckCircle2 size={17} />
          <span>Captions VTT/SRT</span>
        </div>
        <div className={packageItemClass(packagePanel.hasCaptions)}>
          <CheckCircle2 size={17} />
          <span>Transcript</span>
        </div>
        <div className={packageItemClass(packagePanel.packageMetadataReady)}>
          <CheckCircle2 size={17} />
          <span>SEO metadata</span>
        </div>
        <div className={packageItemClass(jobs.packageJob?.status === "completed")}>
          <CheckCircle2 size={17} />
          <span>Package ZIP</span>
        </div>
      </div>
      {poster.posterUrl && (
        <div className="poster-preview">
          <div>
            <strong>Poster preview</strong>
            <span>{jobs.posterJob?.outputFileName ?? "Generated WebP poster"}</span>
          </div>
          <img src={poster.posterUrl} alt={jobs.posterJob?.outputFileName ?? "Generated poster preview"} />
        </div>
      )}
      <div className="package-meta-form">
        <label>
          <span>Video title</span>
          <input
            value={packagePanel.packageMetadata.title}
            onChange={(event) =>
              packagePanel.setPackageMetadata({ ...packagePanel.packageMetadata, title: event.target.value })
            }
          />
        </label>
        <label>
          <span>SEO description</span>
          <textarea
            value={packagePanel.packageMetadata.description}
            onChange={(event) =>
              packagePanel.setPackageMetadata({ ...packagePanel.packageMetadata, description: event.target.value })
            }
          />
        </label>
        <div className="package-meta-row">
          <label>
            <span>Language</span>
            <input
              value={packagePanel.packageMetadata.language}
              onChange={(event) =>
                packagePanel.setPackageMetadata({ ...packagePanel.packageMetadata, language: event.target.value })
              }
            />
          </label>
          <label>
            <span>Filename prefix</span>
            <input
              value={packagePanel.packageMetadata.filenamePrefix}
              onChange={(event) =>
                packagePanel.setPackageMetadata({
                  ...packagePanel.packageMetadata,
                  filenamePrefix: slugify(event.target.value)
                })
              }
            />
          </label>
        </div>
      </div>
      <div className="package-files">
        <strong>
          {packagePanel.packageJobIds.length} selected output{packagePanel.packageJobIds.length === 1 ? "" : "s"}
        </strong>
        <span>
          Original {formatBytes(video.metadata.fileSize)} / package media {formatBytes(packagePanel.packagePreviewSize)}
          {packagePanel.packageSavings !== undefined ? ` / ${packagePanel.packageSavings}% smaller` : ""}. Includes
          selected videos, poster, captions, transcript, embed markup, and notes.
        </span>
        {packagePanel.selectedPackageJobs.length > 0 && (
          <ul className="package-preview-list">
            {packagePanel.selectedPackageJobs.map((selectedJob) => (
              <li key={selectedJob.id}>{selectedJob.outputFileName ?? selectedJob.id}</li>
            ))}
            <li>embed.html</li>
            <li>README.txt</li>
          </ul>
        )}
      </div>
      <button
        className="button primary wide"
        type="button"
        onClick={packagePanel.createWebPackage}
        disabled={packagePanel.packageJobIds.length === 0 || !packagePanel.packageMetadataReady}
      >
        <Package size={18} />
        Build Download Package
      </button>
      {jobs.packageJob?.status === "completed" && (
        <div className="package-actions">
          <a className="button secondary wide" href={jobDownloadUrl(apiBaseUrl, jobs.packageJob.id)}>
            <Download size={18} />
            Download ZIP
          </a>
          <button
            className="button secondary wide"
            type="button"
            onClick={() => void jobs.revealJobOutput(jobs.packageJob!)}
          >
            <FolderOpen size={18} />
            Show In Folder
          </button>
        </div>
      )}
    </aside>
  );
}

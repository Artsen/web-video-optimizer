import { CheckCircle2, Download, FolderOpen, Package } from "lucide-react";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { jobDownloadUrl } from "../../api/urls";
import { formatBytes, slugify } from "../../domain/formatters";
import { SectionHeader } from "../../components/ui/SectionHeader";

export function PackagePanel({ controller }: { controller: VideoOptimizerAppController }) {
  const { apiBaseUrl, source, jobs, packagePanel, poster } = controller;
  const video = source.video;
  if (!video) return null;

  const selectedCount = packagePanel.packageJobIds.length;
  const selectedVideoSizes = packagePanel.selectedPackageJobs
    .filter((selectedJob) => selectedJob.kind === "encode" || selectedJob.kind === "mux")
    .map((selectedJob) => selectedJob.outputSize)
    .filter((size): size is number => Boolean(size))
    .sort((a, b) => a - b);
  const visitorTransfer =
    selectedVideoSizes.length === 0
      ? "Pending"
      : selectedVideoSizes.length === 1
        ? formatBytes(selectedVideoSizes[0])
        : `${formatBytes(selectedVideoSizes[0])} to ${formatBytes(selectedVideoSizes[selectedVideoSizes.length - 1])}`;

  return (
    <aside className="panel package-panel">
      <SectionHeader icon={<CheckCircle2 size={20} />} title="Website Package" />

      <section className="package-section">
        <strong>{selectedCount} assets selected</strong>
        <p>{visitorTransfer} typical visitor transfer</p>
        <p>Package ZIP: {formatBytes(packagePanel.packagePreviewSize)}</p>
      </section>

      <p className="package-quiet-note">
        Visitor transfer is one selected browser video. ZIP size is the handoff bundle.
      </p>

      <details className="details-panel package-disclosure">
        <summary>Included assets</summary>
        <p>
          Original {formatBytes(video.metadata.fileSize)} / selected package{" "}
          {formatBytes(packagePanel.packagePreviewSize)}
          {packagePanel.packageSavings !== undefined ? ` / ${packagePanel.packageSavings}% smaller` : ""}.
        </p>
      </details>

      <details className="details-panel package-disclosure">
        <summary>Package metadata</summary>
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
      </details>

      <details className="details-panel package-disclosure">
        <summary>Supporting files</summary>
        <div className="package-files">
          {poster.posterUrl && (
            <div className="poster-preview compact-package-poster">
              <div>
                <strong>Poster preview</strong>
                <span>{jobs.posterJob?.outputFileName ?? "Generated WebP poster"}</span>
              </div>
              <img src={poster.posterUrl} alt={jobs.posterJob?.outputFileName ?? "Generated poster preview"} />
            </div>
          )}
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
      </details>

      <button
        className="button primary wide"
        type="button"
        onClick={packagePanel.createWebPackage}
        disabled={selectedCount === 0 || !packagePanel.packageMetadataReady}
      >
        <Package size={18} />
        Build Package
      </button>
      {jobs.packageJob?.status === "completed" && (
        <div className="package-actions">
          <a className="button primary wide" href={jobDownloadUrl(apiBaseUrl, jobs.packageJob.id)}>
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
      <div className="package-bottom-bar">
        <span>
          {selectedCount} assets / {formatBytes(packagePanel.packagePreviewSize)} package
        </span>
        <button
          className="button primary"
          type="button"
          onClick={packagePanel.createWebPackage}
          disabled={selectedCount === 0 || !packagePanel.packageMetadataReady}
        >
          Build
        </button>
      </div>
    </aside>
  );
}

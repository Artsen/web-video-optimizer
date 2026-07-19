import { Check, Download, FolderOpen, Layers, Package, Settings2, Trash2, Wand2 } from "lucide-react";
import React from "react";
import type { JobDto } from "@local-video-optimizer/contracts";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { jobDownloadUrl } from "../../api/urls";
import { formatBytes } from "../../domain/formatters";
import { buildSizeComparison, codecLabel, jobTitle, variationDetails } from "../../domain/job-presenters";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { ContextMenu } from "../../components/ui/ContextMenu";
import { CurrentJobs } from "./CurrentJobs";
import { OutputCard } from "./OutputCard";
import { PackagePanel } from "./PackagePanel";

export function OutputsView({
  controller,
  embedded = false
}: {
  controller: VideoOptimizerAppController;
  embedded?: boolean;
}) {
  const { jobs, navigation, source, packagePanel } = controller;
  const selectedOutput =
    jobs.finishedOutputJobs.find((output) => output.id === jobs.selectedOutputId) ?? jobs.finishedOutputJobs[0];
  const resultsRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (navigation.activeView !== "results") return;
    const target = resultsRef.current;
    if (!target) return;
    target.focus({ preventScroll: true });
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView?.({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  }, [navigation.activeView, jobs.currentVideoJobs.length]);

  if (jobs.currentVideoJobs.length === 0) return null;

  return (
    <section
      className={`workflow-section results-section ${embedded ? "inline-results-section" : ""}`}
      id="results"
      ref={resultsRef}
      tabIndex={-1}
      aria-labelledby="results-heading"
    >
      <SectionHeader
        icon={<Package size={21} />}
        title="Results"
        headingId="results-heading"
        kicker="The goal: a much smaller website-ready video, with support files available when you need them."
      />
      <div className="outputs-layout">
        <div className="outputs-main">
          {jobs.runningJobs.length > 0 && <CurrentJobs jobs={jobs.runningJobs} onCancel={jobs.cancelJob} />}
          {jobs.finishedOutputJobs.length > 0 && source.video && (
            <ResultsSummary
              originalBytes={source.video.metadata.fileSize}
              outputs={jobs.finishedOutputJobs}
              packageBytes={packagePanel.packagePreviewSize}
              onCompareAll={jobs.compareAllVersions}
            />
          )}
          <section className="output-cards">
            {jobs.finishedOutputJobs.length === 0 ? (
              <div className="panel empty-panel">
                <SectionHeader icon={<Package size={20} />} title="No Outputs Yet" />
                <p className="muted">
                  Use Optimize For Website to create an MP4 fallback, modern WebM, and poster, or switch to Custom for a
                  one-off variation.
                </p>
                <div className="actions">
                  <button className="button primary" type="button" onClick={jobs.optimizeForWebsite}>
                    <Wand2 size={18} />
                    Optimize For Website
                  </button>
                  <button className="button secondary" type="button" onClick={() => navigation.setActiveView("custom")}>
                    <Settings2 size={18} />
                    Custom Export
                  </button>
                </div>
              </div>
            ) : (
              jobs.finishedOutputJobs.map((output) => (
                <OutputCard
                  controller={controller}
                  output={output}
                  selected={selectedOutput?.id === output.id}
                  onSelect={() => jobs.setSelectedOutputId(output.id)}
                  key={output.id}
                />
              ))
            )}
          </section>
        </div>
        <div className="results-inspector-stack">
          {selectedOutput && source.video && (
            <OutputInspector
              controller={controller}
              output={selectedOutput}
              originalBytes={source.video.metadata.fileSize}
            />
          )}
          <PackagePanel controller={controller} />
        </div>
      </div>
    </section>
  );
}

function OutputInspector({
  controller,
  output,
  originalBytes
}: {
  controller: VideoOptimizerAppController;
  output: JobDto;
  originalBytes: number;
}) {
  const { apiBaseUrl, jobs, packagePanel } = controller;
  const isVideoArtifact = output.kind === "encode" || output.kind === "mux";
  const sizeComparison = isVideoArtifact ? buildSizeComparison(originalBytes, output.outputSize) : undefined;
  const packageIncluded = packagePanel.selectedPackageJobIds.includes(output.id);
  const filename = output.outputFileName ?? output.id;
  return (
    <aside className="panel artifact-inspector" aria-label="Selected output">
      <SectionHeader icon={<Layers size={19} />} title="Selected output" />
      <div className="artifact-inspector-hero">
        <span>{jobTitle(output)}</span>
        <strong title={filename}>{filename}</strong>
        <p>{variationDetails(output)}</p>
      </div>
      <dl className="artifact-inspector-metrics">
        <div>
          <dt>Final size</dt>
          <dd>{formatBytes(output.outputSize)}</dd>
        </div>
        {sizeComparison && (
          <div>
            <dt>Savings</dt>
            <dd>{sizeComparison.changeLabel}</dd>
          </div>
        )}
        {isVideoArtifact && (
          <div>
            <dt>Codec</dt>
            <dd>{codecLabel(output.settings.videoCodec)}</dd>
          </div>
        )}
        <div>
          <dt>Package</dt>
          <dd>{packageIncluded || packagePanel.selectedPackageJobIds.length === 0 ? "Included" : "Not included"}</dd>
        </div>
      </dl>
      <div className="artifact-inspector-actions">
        {output.status === "completed" && (
          <a className="button primary" href={jobDownloadUrl(apiBaseUrl, output.id)}>
            <Download size={16} />
            Download
          </a>
        )}
        {isVideoArtifact && output.status === "completed" && (
          <button className="button secondary" type="button" onClick={() => jobs.selectVariation(output)}>
            <Layers size={16} />
            Compare
          </button>
        )}
        <ContextMenu
          label="More selected output actions"
          items={[
            {
              label: packageIncluded ? "Remove from package" : "Include in package",
              icon: <Check size={15} />,
              disabled: !["completed"].includes(output.status),
              onSelect: () => packagePanel.togglePackageJob(output.id)
            },
            {
              label: "Reveal in folder",
              icon: <FolderOpen size={15} />,
              disabled: output.status !== "completed",
              onSelect: () => void jobs.revealJobOutput(output)
            },
            {
              label: "Delete",
              icon: <Trash2 size={15} />,
              destructive: true,
              onSelect: () => void jobs.deleteHistoryItems([], [output.id])
            }
          ]}
        />
      </div>
    </aside>
  );
}

function ResultsSummary({
  originalBytes,
  outputs,
  packageBytes,
  onCompareAll
}: {
  originalBytes: number;
  outputs: JobDto[];
  packageBytes: number;
  onCompareAll: () => void;
}) {
  const videoOutputs = outputs.filter(
    (output) =>
      output.status === "completed" && (output.kind === "encode" || output.kind === "mux") && output.outputSize
  );
  const smallest = videoOutputs.reduce<JobDto | undefined>(
    (best, output) => (!best || (output.outputSize ?? Infinity) < (best.outputSize ?? Infinity) ? output : best),
    undefined
  );
  const bestReduction = smallest ? buildSizeComparison(originalBytes, smallest.outputSize) : undefined;
  const transferSizes = videoOutputs
    .map((output) => output.outputSize)
    .filter((size): size is number => Boolean(size))
    .sort((a, b) => a - b);
  const transferRange =
    transferSizes.length === 0
      ? "Pending"
      : transferSizes.length === 1
        ? formatBytes(transferSizes[0])
        : `${formatBytes(transferSizes[0])} to ${formatBytes(transferSizes[transferSizes.length - 1])}`;

  return (
    <section className="results-summary transformation-summary" aria-label="Optimization summary">
      <div className="transform-header">
        <div className="transform-line">
          <div className="transform-primary" aria-label="Smallest output size comparison">
            <span className="transform-label">Smallest output</span>
            <span className="transform-size">{formatBytes(originalBytes)}</span>
            <span className="transform-arrow" aria-hidden="true">
              -&gt;
            </span>
            <span className="transform-size result">
              {smallest?.outputSize ? formatBytes(smallest.outputSize) : "Pending"}
            </span>
          </div>
          <div className={`transform-saving ${bestReduction?.tone ?? "neutral"}`}>
            <strong>{bestReduction ? bestReduction.changeLabel : "Pending"}</strong>
            <span>{bestReduction ? bestReduction.detailLabel : "Waiting for completed video output"}</span>
          </div>
        </div>
        {videoOutputs.length >= 2 && (
          <button className="button secondary compare-all-button" type="button" onClick={onCompareAll}>
            <Layers size={16} />
            Compare all versions
          </button>
        )}
      </div>
      {smallest?.outputSize && (
        <div className="compression-bars" aria-hidden="true">
          <div className="compression-bar-row">
            <span>Original</span>
            <div className="compression-bar-track">
              <span className="compression-bar original" />
            </div>
            <em>{formatBytes(originalBytes)}</em>
          </div>
          <div className="compression-bar-row">
            <span>{jobLabel(smallest)}</span>
            <div className="compression-bar-track">
              <span
                className="compression-bar optimized"
                style={{ width: `${Math.max(6, Math.min(100, (smallest.outputSize / originalBytes) * 100))}%` }}
              />
            </div>
            <em>{formatBytes(smallest.outputSize)}</em>
          </div>
        </div>
      )}
      <p>
        Typical visitor transfer: {transferRange} / Package ZIP: {formatBytes(packageBytes)}. Visitors download one
        matching video source; the ZIP is the handoff bundle.
      </p>
    </section>
  );
}

function jobLabel(job: JobDto): string {
  if (job.settings.videoCodec === "libaom-av1") return "Modern AV1";
  if (job.settings.outputContainer === "mp4") return "MP4 fallback";
  return "Optimized";
}

import { CheckCircle2, Gauge, Package, Play, Settings2, Wand2 } from "lucide-react";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { formatBytes } from "../../domain/formatters";
import { codecLabel, nextExportSuggestion, qualityLabel } from "../../domain/job-presenters";
import { Field } from "../../components/ui/Field";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { OptimizationSettingsForm } from "./OptimizationSettingsForm";

export function CustomView({ controller }: { controller: VideoOptimizerAppController }) {
  const { custom, source, jobs, status } = controller;
  const video = source.video;
  if (!video) return null;

  return (
    <section className="workflow-section custom-view" id="export">
      <SectionHeader
        icon={<Settings2 size={21} />}
        title="Custom Export"
        kicker="Manual presets and FFmpeg-style settings for one-off variations."
      />
      <div className="export-layout">
        <div className="export-main">
          <div className="panel preset-panel">
            <SectionHeader
              icon={<Wand2 size={20} />}
              title="Choose Intent"
              kicker="Start from a sensible export goal, then adjust details below."
            />
            <div className="preset-cards">
              {Object.entries(custom.presetInfo).map(([name, info]) => (
                <button
                  className={`preset-card ${custom.activePreset === name ? "active" : ""}`}
                  key={name}
                  type="button"
                  onClick={() => custom.applyPreset(name)}
                >
                  <span className="preset-icon">{info.icon}</span>
                  <span>
                    <strong>{name}</strong>
                    <em>{info.label}</em>
                  </span>
                  <p>{info.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="panel target-size-panel">
            <SectionHeader
              icon={<Gauge size={20} />}
              title="Target Size"
              kicker="Pick a rough web budget and the app will adjust width, frame rate, CRF, and audio."
            />
            <div className="target-size-grid">
              {[2, 5, 10].map((targetMb) => (
                <button
                  className="target-size-button"
                  key={targetMb}
                  type="button"
                  onClick={() => custom.applyTargetSize(targetMb)}
                >
                  <strong>Under {targetMb} MB</strong>
                  <span>{targetMb === 2 ? "Tiny embeds" : targetMb === 5 ? "Marketing pages" : "Higher quality"}</span>
                </button>
              ))}
            </div>
          </div>

          <OptimizationSettingsForm controller={controller} />
        </div>

        <aside className="panel summary-panel">
          <SectionHeader icon={<Gauge size={20} />} title="Custom Estimate" />
          <div className="summary-hero">
            <span>{custom.estimate?.reduction === undefined ? "Estimate" : `${custom.estimate.reduction}%`}</span>
            <strong>{formatBytes(custom.estimate?.bytes)}</strong>
            <em>{qualityLabel(custom.settings)}</em>
          </div>
          <div className="fields single">
            <Field
              label="Format"
              value={`${custom.settings.outputContainer.toUpperCase()} / ${codecLabel(custom.settings.videoCodec)}`}
            />
            <Field label="Original" value={formatBytes(video.metadata.fileSize)} />
            <Field
              label="Audio"
              value={
                custom.settings.audioMode === "remove"
                  ? "Removed"
                  : `${custom.settings.audioCodec === "aac" ? "AAC" : "Opus"} ${custom.settings.audioBitrateKbps} kbps`
              }
            />
          </div>
          <p className="muted">{custom.estimate?.note}</p>
          <div className="recommendations">
            {custom.recommendations.slice(0, 3).map((item) => (
              <div className={`recommendation ${item.tone}`} key={item.text}>
                <CheckCircle2 size={16} />
                <span>{item.text}</span>
              </div>
            ))}
          </div>
          <div className="notice info">{nextExportSuggestion(custom.settings)}</div>
          {status.capabilities &&
            (!status.capabilities.libx264 ||
              !status.capabilities.libaomAv1 ||
              !status.capabilities.aac ||
              !status.capabilities.libopus) && (
              <div className="notice warn">
                FFmpeg capability check:{" "}
                {[
                  !status.capabilities.libx264 && "H.264 unavailable",
                  !status.capabilities.libaomAv1 && "AV1 unavailable",
                  !status.capabilities.aac && "AAC unavailable",
                  !status.capabilities.libopus && "Opus unavailable"
                ]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            )}
          <div className="summary-actions">
            <button
              className="button primary"
              type="button"
              onClick={custom.startJob}
              disabled={jobs.job?.status === "running"}
            >
              <Play size={18} />
              {jobs.job?.status === "running" ? "Processing..." : "Export Current Settings"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={custom.startSampleJob}
              disabled={jobs.sampleJob?.status === "running"}
            >
              <Gauge size={18} />
              Test 5-Second Sample
            </button>
            <button className="button secondary" type="button" onClick={custom.startPairJobs}>
              <Package size={18} />
              Create Default Website Pair
            </button>
          </div>
          <p className="muted">
            Use Export Current Settings for the exact controls above. Default Website Pair creates the standard MP4
            fallback and AV1/WebM recipe.
          </p>
          {status.error && <div className="notice error">{status.error}</div>}
        </aside>
      </div>
    </section>
  );
}

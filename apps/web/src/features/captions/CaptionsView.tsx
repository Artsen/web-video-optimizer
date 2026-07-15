import { Captions, Download, Package, Save, Sparkles } from "lucide-react";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { jobDownloadUrl, jobOutputUrl, jobSidecarUrl } from "../../api/urls";
import { cleanSubtitleDraft } from "../../domain/formatters";
import { Help } from "../../components/ui/Help";
import { SectionHeader } from "../../components/ui/SectionHeader";

export function CaptionsView({ controller }: { controller: VideoOptimizerAppController }) {
  const { apiBaseUrl, source, captions, navigation } = controller;
  const video = source.video;
  if (!video) return null;

  return (
    <section className="workflow-section" id="captions">
      <SectionHeader
        icon={<Captions size={21} />}
        title="Subtitle Theatre"
        kicker="Preview captions like a browser text track, then clean up the WebVTT source."
      />
      {captions.editingSubtitleJob ? (
        <div className="caption-theater">
          <div className="subtitle-editor-header">
            <div>
              <strong>{captions.editingSubtitleJob.outputFileName ?? "Generated captions"}</strong>
              <span>Save updates the VTT file and regenerates the SRT sidecar.</span>
            </div>
            <div className="actions">
              <button className="button secondary" type="button" onClick={() => navigation.setActiveView("outputs")}>
                <Package size={17} />
                Back To Outputs
              </button>
              <button
                className="button primary"
                type="button"
                onClick={() => void captions.saveSubtitleEdits()}
                disabled={captions.isSavingSubtitles}
              >
                <Save size={17} />
                {captions.isSavingSubtitles ? "Saving..." : "Save Captions"}
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => captions.setSubtitleDraft((current) => cleanSubtitleDraft(current))}
              >
                <Sparkles size={17} />
                Clean Transcript
              </button>
              <a className="button secondary" href={jobDownloadUrl(apiBaseUrl, captions.editingSubtitleJob.id)}>
                <Download size={17} />
                VTT
              </a>
              {captions.editingSubtitleJob.sidecarFileName && (
                <a className="button secondary" href={jobSidecarUrl(apiBaseUrl, captions.editingSubtitleJob.id)}>
                  <Download size={17} />
                  SRT
                </a>
              )}
            </div>
          </div>
          <div className="subtitle-stage">
            <video
              key={`${captions.editingSubtitleJob.id}-${captions.subtitlePreviewKey}`}
              controls
              crossOrigin="anonymous"
              preload="metadata"
              src={source.sourceUrl}
              onLoadedMetadata={(event) => {
                const [track] = Array.from(event.currentTarget.textTracks);
                if (track) track.mode = "showing";
              }}
            >
              <track
                src={jobOutputUrl(
                  apiBaseUrl,
                  captions.editingSubtitleJob.id,
                  `?preview=${captions.subtitlePreviewKey}`
                )}
                kind="subtitles"
                srcLang="en"
                label="English"
                default
              />
            </video>
            <div className="subtitle-stage-label">
              <Captions size={17} />
              Browser subtitle preview
            </div>
          </div>
          <div className="subtitle-editor-drawer">
            <div className="subtitle-editor-copy">
              <label className="label-row" htmlFor="subtitle-draft">
                WebVTT captions{" "}
                <Help text="Keep the WEBVTT header and cue timings. Save updates the VTT and regenerates SRT automatically." />
              </label>
              <p className="muted">
                Preview uses the last saved file. After editing, save captions and replay this theatre preview to check
                timing and wording.
              </p>
            </div>
            <textarea
              id="subtitle-draft"
              value={captions.subtitleDraft}
              spellCheck
              onChange={(event) => captions.setSubtitleDraft(event.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="panel empty-panel">
          <SectionHeader icon={<Captions size={20} />} title="No Captions Selected" />
          <p className="muted">Open a completed caption output from Jobs & Outputs to review and edit it here.</p>
          <button className="button secondary" type="button" onClick={() => navigation.setActiveView("outputs")}>
            Back To Outputs
          </button>
        </div>
      )}
    </section>
  );
}

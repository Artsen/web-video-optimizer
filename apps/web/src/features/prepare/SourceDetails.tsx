import { Captions, FileVideo, Gauge } from "lucide-react";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { formatBitrate, formatBytes, formatDuration } from "../../domain/formatters";
import { Field } from "../../components/ui/Field";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";

export function SourceDetails({ controller }: { controller: VideoOptimizerAppController }) {
  const { source, status, jobs } = controller;
  const video = source.video;

  if (!video) {
    return (
      <div className="panel empty-panel">
        <SectionHeader icon={<Gauge size={20} />} title="Source details" />
        <p className="muted">
          After upload, this inspector shows the essential web-readiness details first, with deeper codec metadata kept
          available when you need it.
        </p>
      </div>
    );
  }

  const subtitleStatus =
    video.metadata.trackCounts.subtitle > 0
      ? `${video.metadata.trackCounts.subtitle} embedded subtitle track${video.metadata.trackCounts.subtitle === 1 ? "" : "s"} found`
      : video.metadata.trackCounts.audio === 0
        ? "No audio track found"
        : status.capabilities?.whisperCpp && status.capabilities?.whisperModel
          ? "No embedded subtitles. Ready to generate captions locally."
          : "No embedded subtitles. Configure whisper.cpp to generate captions.";

  return (
    <div className="panel source-inspector">
      <SectionHeader
        icon={<FileVideo size={20} />}
        title="Source Details"
        kicker="The useful bits before the codec weeds."
      />
      <div className="metric-strip">
        <div>
          <span>Resolution</span>
          <strong className="nowrap-value">
            {video.metadata.width && video.metadata.height
              ? `${video.metadata.width}\u00a0x\u00a0${video.metadata.height}`
              : "Unknown"}
          </strong>
        </div>
        <div>
          <span>File size</span>
          <strong>{formatBytes(video.metadata.fileSize)}</strong>
        </div>
        <div>
          <span>Duration</span>
          <strong>{formatDuration(video.metadata.durationSeconds)}</strong>
        </div>
        <div>
          <span>Format</span>
          <strong>{video.metadata.videoCodec ?? video.metadata.container ?? "Unknown"}</strong>
        </div>
      </div>
      <div className="source-status-row">
        <StatusBadge tone={video.metadata.webFriendly ? "good" : "warn"}>
          {video.metadata.webFriendly ? "Source can play on the web" : "Compatibility review recommended"}
        </StatusBadge>
        <StatusBadge tone="info">{formatBitrate(video.metadata.overallBitrate)} source bitrate</StatusBadge>
      </div>
      {video.metadata.warnings.map((warning) => (
        <div className="notice warn" key={warning}>
          {warning}
        </div>
      ))}
      <details className="details-panel">
        <summary>Captions</summary>
        <div className="subtitle-status">
          <div>
            <Captions size={20} />
            <span>
              <strong>Subtitles</strong>
              <em>{subtitleStatus}</em>
            </span>
          </div>
          <button
            className="button secondary"
            type="button"
            onClick={source.startSubtitleJob}
            disabled={
              video.metadata.trackCounts.audio === 0 ||
              jobs.subtitleJob?.status === "running" ||
              !status.capabilities?.whisperCpp ||
              !status.capabilities?.whisperModel
            }
          >
            <Captions size={18} />
            {jobs.subtitleJob?.status === "running" ? "Generating..." : "Generate Subtitles"}
          </button>
        </div>
        {status.capabilities &&
          (!status.capabilities.whisperCpp || !status.capabilities.whisperModel) &&
          video.metadata.trackCounts.audio > 0 && (
            <div className="notice info">
              Subtitle generation needs whisper.cpp and a model. Set WHISPER_CPP_BIN and WHISPER_CPP_MODEL in the API
              environment.
            </div>
          )}
      </details>
      <details className="details-panel">
        <summary>Source actions</summary>
        <a className="button secondary wide" href={source.sourceDownloadUrl}>
          Download Original Source
        </a>
      </details>
      <details className="details-panel">
        <summary>Technical metadata</summary>
        <div className="fields">
          <Field label="Container" value={video.metadata.container} />
          <Field label="Video codec" value={video.metadata.videoCodec} />
          <Field label="Audio codec" value={video.metadata.audioCodec} />
          <Field
            label="Dimensions"
            value={
              video.metadata.width && video.metadata.height
                ? `${video.metadata.width}\u00a0x\u00a0${video.metadata.height}`
                : undefined
            }
          />
          <Field label="Frame rate" value={video.metadata.frameRate ? `${video.metadata.frameRate} fps` : undefined} />
          <Field label="Video bitrate" value={formatBitrate(video.metadata.videoBitrate)} />
          <Field label="Audio bitrate" value={formatBitrate(video.metadata.audioBitrate)} />
          <Field label="Pixel format" value={video.metadata.pixelFormat} />
          <Field
            label="Audio sample rate"
            value={video.metadata.audioSampleRate ? `${video.metadata.audioSampleRate} Hz` : undefined}
          />
          <Field
            label="Tracks"
            value={`${video.metadata.trackCounts.video} video, ${video.metadata.trackCounts.audio} audio, ${video.metadata.trackCounts.subtitle} subtitle`}
          />
        </div>
      </details>
    </div>
  );
}

import { Download, Image, UploadCloud } from "lucide-react";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { formatBytes, formatDuration } from "../../domain/formatters";

export function UploadPanel({ controller }: { controller: VideoOptimizerAppController }) {
  const { source: sourceState, status, jobs } = controller;
  const {
    importVideoUrl,
    posterTimestamp,
    renameSource,
    renamingSource,
    setPosterTimestamp,
    setSourceNameDraft,
    setVideoUrl,
    sourceDownloadUrl,
    sourceNameDraft,
    sourcePreviewRef,
    sourceUrl,
    startPosterJob,
    uploadFile,
    useCurrentPreviewFrame,
    video,
    videoUrl
  } = sourceState;

  return (
    <div
      className="dropzone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void uploadFile(file);
      }}
    >
      {video ? (
        <div className="upload-preview">
          <video
            controls
            ref={sourcePreviewRef}
            src={sourceUrl}
            onTimeUpdate={(event) => setPosterTimestamp(Math.round(event.currentTarget.currentTime * 10) / 10)}
          />
          <div className="preview-meta">
            <div className="name-editor source-name-editor">
              <input
                value={sourceNameDraft}
                onChange={(event) => setSourceNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void renameSource();
                }}
                aria-label="Source filename"
              />
              <button
                className="button secondary"
                type="button"
                onClick={() => void renameSource()}
                disabled={renamingSource || sourceNameDraft.trim() === video.originalName}
              >
                Save
              </button>
            </div>
            <p>
              {formatBytes(video.metadata.fileSize)} / {formatDuration(video.metadata.durationSeconds)} /{" "}
              {video.metadata.width} x {video.metadata.height}
            </p>
          </div>
          <div className="poster-picker">
            <div>
              <strong>Poster frame</strong>
              <span>{formatDuration(posterTimestamp)} selected</span>
            </div>
            <a className="button secondary" href={sourceDownloadUrl}>
              <Download size={18} />
              Source
            </a>
            <button className="button secondary" type="button" onClick={useCurrentPreviewFrame}>
              <Image size={18} />
              Use Current Frame
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={startPosterJob}
              disabled={jobs.posterJob?.status === "running"}
            >
              Generate Poster
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="upload-icon">
            <UploadCloud size={34} />
          </div>
          <h2>Drop a video file</h2>
          <p>
            {status.isUploading
              ? status.importStatus || "Importing and analyzing video..."
              : "Choose a file, drag one here, or import a permitted YouTube video."}
          </p>
        </>
      )}
      <label className="button secondary">
        {video ? "Replace Video" : "Select Video"}
        <input
          type="file"
          accept="video/*"
          onChange={(event) => event.target.files?.[0] && void uploadFile(event.target.files[0])}
        />
      </label>
      <div className="url-import">
        <span>Import from YouTube</span>
        <div>
          <input
            type="url"
            value={videoUrl}
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={status.isUploading || status.capabilities?.ytDlp === false}
            onChange={(event) => setVideoUrl(event.target.value)}
          />
          <button
            className="button secondary"
            type="button"
            onClick={() => void importVideoUrl()}
            disabled={status.isUploading || !videoUrl.trim() || status.capabilities?.ytDlp === false}
          >
            Import URL
          </button>
        </div>
        <em>
          {status.isUploading && status.importStatus
            ? status.importStatus
            : status.capabilities?.ytDlp === false
              ? "Install yt-dlp or set YT_DLP_BIN to enable URL imports."
              : "Use this only for videos you own or have permission to download."}
        </em>
      </div>
    </div>
  );
}

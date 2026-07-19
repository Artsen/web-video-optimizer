import { useState } from "react";
import { Check, Edit3, Image, Link, ShieldCheck, UploadCloud, X } from "lucide-react";
import type { VideoOptimizerAppController } from "../../app/useVideoOptimizerApp";
import { formatBytes, formatDuration } from "../../domain/formatters";
import { MediaPlayer } from "../media/MediaPlayer";

export function UploadPanel({ controller }: { controller: VideoOptimizerAppController }) {
  const [dragActive, setDragActive] = useState(false);
  const [editingSourceName, setEditingSourceName] = useState(false);
  const { source: sourceState, status, jobs } = controller;
  const {
    importVideoUrl,
    posterTimestamp,
    renameSource,
    renamingSource,
    setPosterTimestamp,
    setSourceNameDraft,
    setVideoUrl,
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
      className={`dropzone ${video ? "" : "dropzone-empty"} ${dragActive ? "drag-ready" : ""}`}
      onDragEnter={() => setDragActive(true)}
      onDragLeave={() => setDragActive(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        const file = event.dataTransfer.files[0];
        if (file) void uploadFile(file);
      }}
    >
      {video ? (
        <div className="upload-preview">
          <MediaPlayer
            label="Source preview"
            ref={sourcePreviewRef}
            src={sourceUrl}
            knownDurationSeconds={video.metadata.durationSeconds}
            onTimeUpdate={(seconds) => setPosterTimestamp(Math.round(seconds * 10) / 10)}
          />
          <div className="preview-meta">
            {editingSourceName ? (
              <div className="name-editor source-name-editor">
                <input
                  value={sourceNameDraft}
                  onChange={(event) => setSourceNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void renameSource();
                      setEditingSourceName(false);
                    }
                    if (event.key === "Escape") {
                      setSourceNameDraft(video.originalName);
                      setEditingSourceName(false);
                    }
                  }}
                  aria-label="Source filename"
                />
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    void renameSource();
                    setEditingSourceName(false);
                  }}
                  disabled={renamingSource || sourceNameDraft.trim() === video.originalName}
                  aria-label="Save source filename"
                >
                  <Check size={15} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setSourceNameDraft(video.originalName);
                    setEditingSourceName(false);
                  }}
                  aria-label="Cancel source rename"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button className="source-title-button" type="button" onClick={() => setEditingSourceName(true)}>
                <span>{video.originalName}</span>
                <Edit3 size={14} />
              </button>
            )}
            <p>
              {formatBytes(video.metadata.fileSize)} / {formatDuration(video.metadata.durationSeconds)} /{" "}
              {video.metadata.width} x {video.metadata.height}
            </p>
          </div>
          <div className="poster-picker compact-poster-picker">
            <div>
              <strong>Poster frame:</strong>
              <span>{posterTimestamp > 0 ? `${formatDuration(posterTimestamp)} selected` : "Not selected"}</span>
            </div>
            <button
              className="button secondary"
              type="button"
              onClick={useCurrentPreviewFrame}
              aria-label="Use Current Frame"
            >
              <Image size={18} />
              Choose frame
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={startPosterJob}
              disabled={jobs.posterJob?.status === "running"}
            >
              Generate
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="upload-icon">
            <UploadCloud size={34} />
          </div>
          <h2>{dragActive ? "Release to add this video" : "Add a source video"}</h2>
          <p>
            {status.isUploading
              ? status.importStatus || "Importing and analyzing video..."
              : "Drop a file here or browse from this computer. The app will inspect it locally before any optimization work starts."}
          </p>
          <div className="local-trust">
            <ShieldCheck size={16} />
            Local processing / no cloud upload
          </div>
        </>
      )}
      {video ? (
        <details className="details-panel source-inline-actions">
          <summary>Source actions</summary>
          <div className="source-inline-action-grid">
            <label className="button quiet replace-video-button">
              Replace Video
              <input
                type="file"
                accept="video/*"
                onChange={(event) => event.target.files?.[0] && void uploadFile(event.target.files[0])}
              />
            </label>
            <details className="url-import">
              <summary>
                <Link size={14} />
                Import from URL
              </summary>
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
            </details>
          </div>
        </details>
      ) : (
        <>
          <label className="button primary">
            Choose Video
            <input
              type="file"
              accept="video/*"
              onChange={(event) => event.target.files?.[0] && void uploadFile(event.target.files[0])}
            />
          </label>
          <details className="url-import">
            <summary>
              <Link size={14} />
              Import from URL
            </summary>
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
          </details>
        </>
      )}
    </div>
  );
}

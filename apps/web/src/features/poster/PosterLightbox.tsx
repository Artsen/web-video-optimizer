import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { JobDto } from "@local-video-optimizer/contracts";
import { Download, X, ZoomIn, ZoomOut } from "lucide-react";
import { jobDownloadUrl } from "../../api/urls";

export type PosterLightboxProps = {
  apiBaseUrl: string;
  poster: JobDto;
  posterUrl: string;
  zoom: number;
  pan: { x: number; y: number };
  onClose(): void;
  onZoom(nextZoom: number): void;
  onStartPan(event: PointerEvent<HTMLDivElement>): void;
  onMovePan(event: PointerEvent<HTMLDivElement>): void;
  onStopPan(): void;
};

export function PosterLightbox({
  apiBaseUrl,
  poster,
  posterUrl,
  zoom,
  pan,
  onClose,
  onZoom,
  onStartPan,
  onMovePan,
  onStopPan
}: PosterLightboxProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  function trapDialogFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Poster preview"
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={trapDialogFocus}
      onWheel={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="poster-lightbox">
        <div className="lightbox-toolbar">
          <div>
            <strong>{poster.outputFileName ?? "Generated poster"}</strong>
            <span>
              {Math.round(zoom * 100)}% zoom{zoom > 1 ? " / drag to pan" : ""}
            </span>
          </div>
          <div className="lightbox-actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => onZoom(zoom - 0.25)}
              disabled={zoom <= 1}
              aria-label="Zoom out"
            >
              <ZoomOut size={18} />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => onZoom(1)}
              disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
              aria-label="Reset poster zoom"
            >
              1x
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => onZoom(zoom + 0.25)}
              disabled={zoom >= 4}
              aria-label="Zoom in"
            >
              <ZoomIn size={18} />
            </button>
            <a className="button secondary" href={jobDownloadUrl(apiBaseUrl, poster.id)}>
              <Download size={17} />
              Download
            </a>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Close poster preview">
              <X size={19} />
            </button>
          </div>
        </div>
        <div
          className={`lightbox-stage ${zoom > 1 ? "zoomed" : ""}`}
          onPointerDown={onStartPan}
          onPointerMove={onMovePan}
          onPointerUp={onStopPan}
          onPointerCancel={onStopPan}
          onWheel={(event) => {
            event.preventDefault();
            onZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
          }}
        >
          <img
            src={posterUrl}
            alt={poster.outputFileName ?? "Generated poster preview"}
            draggable={false}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          />
        </div>
      </div>
    </div>
  );
}

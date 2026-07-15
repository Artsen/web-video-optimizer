import React from "react";
import type { JobDto } from "@local-video-optimizer/contracts";

type Job = JobDto;

export function usePosterLightbox(setPosterJob: (job: Job) => void) {
  const [activePosterPreview, setActivePosterPreview] = React.useState<Job | null>(null);
  const [posterZoom, setPosterZoom] = React.useState(1);
  const [posterPan, setPosterPan] = React.useState({ x: 0, y: 0 });
  const [posterDragStart, setPosterDragStart] = React.useState<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);

  const closePosterLightbox = React.useCallback(() => {
    setActivePosterPreview(null);
    setPosterZoom(1);
    setPosterPan({ x: 0, y: 0 });
    setPosterDragStart(null);
  }, []);

  React.useEffect(() => {
    if (!activePosterPreview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePosterLightbox();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePosterPreview, closePosterLightbox]);

  function openPosterLightbox(nextJob: Job) {
    setPosterJob(nextJob);
    setActivePosterPreview(nextJob);
    setPosterZoom(1);
    setPosterPan({ x: 0, y: 0 });
    setPosterDragStart(null);
  }

  function updatePosterZoom(nextZoom: number) {
    const zoom = Math.max(1, Math.min(4, Math.round(nextZoom * 10) / 10));
    setPosterZoom(zoom);
    if (zoom === 1) setPosterPan({ x: 0, y: 0 });
  }

  function startPosterPan(event: React.PointerEvent<HTMLDivElement>) {
    if (posterZoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPosterDragStart({ x: event.clientX, y: event.clientY, panX: posterPan.x, panY: posterPan.y });
  }

  function movePosterPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!posterDragStart || posterZoom <= 1) return;
    setPosterPan({
      x: posterDragStart.panX + event.clientX - posterDragStart.x,
      y: posterDragStart.panY + event.clientY - posterDragStart.y
    });
  }

  function stopPosterPan() {
    setPosterDragStart(null);
  }

  return {
    activePosterPreview,
    posterZoom,
    posterPan,
    closePosterLightbox,
    openPosterLightbox,
    updatePosterZoom,
    startPosterPan,
    movePosterPan,
    stopPosterPan
  };
}

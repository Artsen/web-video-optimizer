export type CompareMode = "grid" | "wipe" | "ab";
export type ZoomLevel = 1 | 2 | 3;

export function clampWipePosition(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function adjustWipePosition(current: number, delta: number): number {
  return clampWipePosition(current + delta);
}

export function nextFrameTime(currentTime: number, direction: -1 | 1, frameRate = 24): number {
  const frameStep = 1 / Math.max(1, frameRate);
  return Math.max(0, currentTime + direction * frameStep);
}

export function linkedViewTransform({ zoom, panX, panY }: { zoom: ZoomLevel; panX: number; panY: number }): string {
  return `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
}

export function shouldShowOriginalForAb({
  mode,
  holdOriginal,
  toggledOriginal
}: {
  mode: CompareMode;
  holdOriginal: boolean;
  toggledOriginal: boolean;
}): boolean {
  return mode === "ab" && (holdOriginal || toggledOriginal);
}

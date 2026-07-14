export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function cleanSubtitleDraft(vtt: string): string {
  const seen = new Set<string>();
  return vtt
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !/^\[(?:BLANK_AUDIO|MUSIC|SILENCE|NOISE|APPLAUSE|LAUGHTER)\]$/i.test(line.trim()))
    .filter((line) => {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.includes("-->") ||
        /^WEBVTT\b/i.test(trimmed) ||
        /^NOTE\b/i.test(trimmed) ||
        /^\d+$/.test(trimmed)
      )
        return true;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatBitrate(bits?: number): string {
  if (!bits) return "Unknown";
  return bits >= 1_000_000 ? `${(bits / 1_000_000).toFixed(2)} Mbps` : `${Math.round(bits / 1000)} kbps`;
}

export function formatDuration(seconds?: number): string {
  if (!seconds) return "Unknown";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${rest}`;
}

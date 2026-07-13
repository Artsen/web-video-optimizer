export function parseCaptionTimestamp(timestamp: string): number | undefined {
  const match = timestamp.trim().match(/^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{3})$/);
  if (!match) return undefined;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

export function formatCaptionTimestamp(totalSeconds: number, separator: "." | "," = "."): string {
  const totalMilliseconds = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return (
    [String(hours).padStart(2, "0"), String(minutes).padStart(2, "0"), String(seconds).padStart(2, "0")].join(":") +
    `${separator}${String(milliseconds).padStart(3, "0")}`
  );
}

export function shiftCaptionTimings(captionText: string, offsetSeconds: number): string {
  if (offsetSeconds <= 0) return captionText;
  return captionText.replace(
    /(\d{2,}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3})(\s+-->\s+)(\d{2,}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}[.,]\d{3})/g,
    (line, start, arrow, end) => {
      const startSeconds = parseCaptionTimestamp(start);
      const endSeconds = parseCaptionTimestamp(end);
      if (startSeconds === undefined || endSeconds === undefined) return line;
      const separator = start.includes(",") ? "," : ".";
      const endSeparator = end.includes(",") ? "," : separator;
      return `${formatCaptionTimestamp(startSeconds + offsetSeconds, separator)}${arrow}${formatCaptionTimestamp(endSeconds + offsetSeconds, endSeparator)}`;
    }
  );
}

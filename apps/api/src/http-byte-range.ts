export type ParsedByteRange = {
  start: number;
  end: number;
};

export function parseByteRange(rangeHeader: string, fileSize: number): ParsedByteRange | undefined {
  if (fileSize <= 0) return undefined;

  const match = rangeHeader.trim().match(/^bytes=([^,]+)$/);
  if (!match) return undefined;

  const range = match[1]?.trim();
  if (!range) return undefined;

  const separatorIndex = range.indexOf("-");
  if (separatorIndex === -1 || range.indexOf("-", separatorIndex + 1) !== -1) return undefined;

  const startText = range.slice(0, separatorIndex).trim();
  const endText = range.slice(separatorIndex + 1).trim();

  if (!startText) {
    if (!/^\d+$/.test(endText)) return undefined;
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return undefined;
    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1
    };
  }

  if (!/^\d+$/.test(startText)) return undefined;
  const start = Number(startText);
  if (!Number.isSafeInteger(start) || start >= fileSize) return undefined;

  if (!endText) {
    return { start, end: fileSize - 1 };
  }

  if (!/^\d+$/.test(endText)) return undefined;
  const requestedEnd = Number(endText);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) return undefined;

  return {
    start,
    end: Math.min(requestedEnd, fileSize - 1)
  };
}

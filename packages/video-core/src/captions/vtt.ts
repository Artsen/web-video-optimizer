export function vttToSrt(vtt: string): string {
  const normalized = vtt.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !/^WEBVTT\b/i.test(block) && !/^NOTE\b/i.test(block));
  const cues: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    const timeIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeIndex === -1) continue;
    const timing = lines[timeIndex]
      .replace(/\./g, ",")
      .replace(/\s+align:\S+|\s+position:\S+|\s+line:\S+|\s+size:\S+/g, "");
    const text = lines
      .slice(timeIndex + 1)
      .join("\n")
      .trim();
    if (!text) continue;
    cues.push(`${cues.length + 1}\n${timing}\n${text}`);
  }

  return `${cues.join("\n\n")}\n`;
}

export function assertLooksLikeVtt(vtt: string): void {
  if (!vtt.includes("-->")) {
    throw new Error("Caption text must contain at least one WebVTT cue with a timing arrow.");
  }
}

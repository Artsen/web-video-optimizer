export function commandPreview(args: string[]): string {
  return ["ffmpeg", ...args].map((part) => (part.includes(" ") ? `"${part}"` : part)).join(" ");
}

export function commandPreviewFor(command: string, args: string[]): string {
  return [command, ...args].map((part) => (part.includes(" ") ? `"${part}"` : part)).join(" ");
}

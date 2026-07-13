export function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-z0-9._-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/-+(\.[^.]+)$/g, "$1")
    .replace(/^-|-$/g, "");
}

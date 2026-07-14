import { Buffer } from "node:buffer";
import path from "node:path";
import { uploadErrors } from "./upload-errors.js";

export function validateUploadOriginalName(originalName: string): string {
  if (typeof originalName !== "string") throw uploadErrors.invalidFilename();
  const name = originalName.trim();
  if (!name || Buffer.byteLength(name, "utf8") > 255) throw uploadErrors.invalidFilename();
  if (name === "." || name === "..") throw uploadErrors.invalidFilename();
  if (name.includes("\0") || hasControlCharacter(name)) throw uploadErrors.invalidFilename();
  if (name.includes("/") || name.includes("\\")) throw uploadErrors.invalidFilename();
  if (path.isAbsolute(name) || /^[A-Za-z]:/.test(name) || name.startsWith("\\\\")) throw uploadErrors.invalidFilename();
  if (name.split(/[\\/]/).some((part) => part === "..")) throw uploadErrors.invalidFilename();
  return name;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

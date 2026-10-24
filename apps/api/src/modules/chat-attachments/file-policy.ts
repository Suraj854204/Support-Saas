import path from "node:path";

export type FileKind = "image" | "video" | "audio" | "document" | "archive";

export interface AcceptedFile {
  kind: FileKind;
  mime: string;
  /** Extension (with dot) the stored/displayed file name will carry. */
  ext: string;
  /** Safe to show inside the page (img/video/audio). Everything else is download-only. */
  inlineSafe: boolean;
}

/** Never accepted, whatever the content claims to be: programs, scripts and active web content. */
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".scr", ".msi", ".msp", ".dll", ".sys", ".cpl", ".pif", ".lnk", ".reg",
  ".vbs", ".vbe", ".js", ".jse", ".mjs", ".wsf", ".wsh", ".ps1", ".psm1", ".sh", ".bash", ".zsh", ".command",
  ".jar", ".apk", ".ipa", ".app", ".dmg", ".pkg", ".deb", ".rpm", ".iso", ".img",
  ".html", ".htm", ".xhtml", ".shtml", ".svg", ".xml", ".hta", ".php", ".asp", ".aspx", ".jsp", ".py", ".rb", ".pl",
  ".docm", ".xlsm", ".pptm", ".dotm", ".xlsb", ".swf", ".crx", ".xpi",
]);

const TEXT_EXTENSIONS = new Set([".txt", ".csv", ".log", ".md", ".json", ".tsv"]);
const TEXT_MIME: Record<string, string> = { ".txt": "text/plain", ".csv": "text/csv", ".log": "text/plain", ".md": "text/plain", ".json": "application/json", ".tsv": "text/tab-separated-values" };

const OFFICE_ZIP: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
};
const OLE: Record<string, string> = { ".doc": "application/msword", ".xls": "application/vnd.ms-excel", ".ppt": "application/vnd.ms-powerpoint" };

const startsWith = (b: Buffer, sig: number[], offset = 0) => b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Buffer, start: number, end: number) => b.subarray(start, end).toString("latin1");

/** Cleans a client-supplied file name: no path, no control characters, bounded length. */
export function sanitizeFilename(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/"));
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|?*:]/g, "_").replace(/\s+/g, " ").trim();
  const ext = path.extname(cleaned).slice(0, 12);
  const stem = cleaned.slice(0, cleaned.length - path.extname(cleaned).length).replace(/^\.+/, "").slice(0, 120);
  return `${stem || "file"}${ext}`;
}

/** All extensions in a name ("invoice.pdf.exe" has .pdf and .exe): any blocked one rejects the file. */
function allExtensions(name: string): string[] {
  return name.toLowerCase().split(".").slice(1).map((e) => `.${e.trim()}`);
}

function looksLikeText(b: Buffer): boolean {
  const sample = b.subarray(0, 8192);
  if (sample.length === 0) return false;
  for (const byte of sample) if (byte === 0 || (byte < 9) || (byte > 13 && byte < 32 && byte !== 27)) return false;
  return true;
}

/**
 * Decides what an uploaded file really is from its CONTENT (magic bytes), not from the browser-reported type,
 * and rejects anything dangerous. Returns null when the file is not an accepted type.
 */
export function classifyUpload(buffer: Buffer, originalName: string): AcceptedFile | null {
  if (buffer.length === 0) return null;
  const name = sanitizeFilename(originalName);
  const exts = allExtensions(name);
  if (exts.some((e) => BLOCKED_EXTENSIONS.has(e))) return null;
  const ext = (path.extname(name) || "").toLowerCase();

  // Programs and scripts are refused by content too, so renaming "setup.exe" to "photo.png" does not help.
  if (startsWith(buffer, [0x4d, 0x5a]) || startsWith(buffer, [0x7f, 0x45, 0x4c, 0x46]) || startsWith(buffer, [0x23, 0x21]) ||
      startsWith(buffer, [0xca, 0xfe, 0xba, 0xbe]) || startsWith(buffer, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(buffer, [0xfe, 0xed, 0xfa, 0xce])) {
    return null;
  }

  // Images (never SVG: it can carry script)
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mime: "image/png", ext: ".png", inlineSafe: true };
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg", ext: ".jpg", inlineSafe: true };
  if (ascii(buffer, 0, 4) === "GIF8") return { kind: "image", mime: "image/gif", ext: ".gif", inlineSafe: true };
  if (ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 12) === "WEBP") return { kind: "image", mime: "image/webp", ext: ".webp", inlineSafe: true };

  // Video / audio containers
  if (ascii(buffer, 4, 8) === "ftyp") {
    const brand = ascii(buffer, 8, 12);
    if (brand.startsWith("M4A")) return { kind: "audio", mime: "audio/mp4", ext: ".m4a", inlineSafe: true };
    if (brand.startsWith("qt")) return { kind: "video", mime: "video/quicktime", ext: ".mov", inlineSafe: true };
    if (/^(heic|heix|mif1|avif)/.test(brand)) return null; // image formats we do not serve
    return { kind: "video", mime: "video/mp4", ext: ".mp4", inlineSafe: true };
  }
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    const isAudioOnly = ext === ".weba";
    return isAudioOnly ? { kind: "audio", mime: "audio/webm", ext: ".weba", inlineSafe: true } : { kind: "video", mime: "video/webm", ext: ".webm", inlineSafe: true };
  }
  if (ascii(buffer, 0, 3) === "ID3" || (buffer[0] === 0xff && ((buffer[1] ?? 0) & 0xe0) === 0xe0)) return { kind: "audio", mime: "audio/mpeg", ext: ".mp3", inlineSafe: true };
  if (ascii(buffer, 0, 4) === "OggS") return { kind: "audio", mime: "audio/ogg", ext: ".ogg", inlineSafe: true };
  if (ascii(buffer, 0, 4) === "RIFF" && ascii(buffer, 8, 12) === "WAVE") return { kind: "audio", mime: "audio/wav", ext: ".wav", inlineSafe: true };

  // Documents
  if (ascii(buffer, 0, 5) === "%PDF-") return { kind: "document", mime: "application/pdf", ext: ".pdf", inlineSafe: false };
  if (ascii(buffer, 0, 5) === "{\\rtf") return { kind: "document", mime: "application/rtf", ext: ".rtf", inlineSafe: false };
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    const mime = OLE[ext];
    return mime ? { kind: "document", mime, ext, inlineSafe: false } : null;
  }
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    if (OFFICE_ZIP[ext]) return { kind: "document", mime: OFFICE_ZIP[ext]!, ext, inlineSafe: false };
    if (ext === ".zip") return { kind: "archive", mime: "application/zip", ext: ".zip", inlineSafe: false };
    return null;
  }

  if (TEXT_EXTENSIONS.has(ext) && looksLikeText(buffer)) return { kind: "document", mime: TEXT_MIME[ext]!, ext, inlineSafe: false };
  return null;
}

/** Maximum size in bytes for a kind, from configuration (MB). */
export function maxBytesFor(kind: FileKind, limits: { fileMb: number; videoMb: number }): number {
  return (kind === "video" ? limits.videoMb : limits.fileMb) * 1024 * 1024;
}

export const ALLOWED_TYPES_HINT = "Images (PNG, JPG, GIF, WebP), videos (MP4, MOV, WebM), audio, PDF, Word/Excel/PowerPoint, text/CSV and ZIP";

import { describe, expect, it } from "vitest";

import { classifyUpload, sanitizeFilename } from "../file-policy";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const pdf = Buffer.from("%PDF-1.7\n...");
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const exe = Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0]);
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(8)]);
const mov = Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from("ftypqt  "), Buffer.alloc(8)]);
const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f]);

describe("classifyUpload: identifies files by content", () => {
  it("accepts screenshots, photos, videos, audio and documents", () => {
    expect(classifyUpload(png, "Screenshot 2026.png")).toMatchObject({ kind: "image", mime: "image/png", inlineSafe: true });
    expect(classifyUpload(jpg, "IMG_1.jpeg")).toMatchObject({ kind: "image", mime: "image/jpeg", ext: ".jpg" });
    expect(classifyUpload(mp4, "clip.mp4")).toMatchObject({ kind: "video", mime: "video/mp4" });
    expect(classifyUpload(mov, "clip.mov")).toMatchObject({ kind: "video", mime: "video/quicktime" });
    expect(classifyUpload(webm, "screen.webm")).toMatchObject({ kind: "video", mime: "video/webm" });
    expect(classifyUpload(Buffer.from("OggS\0\0"), "a.ogg")).toMatchObject({ kind: "audio" });
    expect(classifyUpload(pdf, "invoice.pdf")).toMatchObject({ kind: "document", mime: "application/pdf", inlineSafe: false });
    expect(classifyUpload(zip, "report.docx")).toMatchObject({ kind: "document", ext: ".docx" });
    expect(classifyUpload(zip, "files.zip")).toMatchObject({ kind: "archive" });
    expect(classifyUpload(Buffer.from("a,b\n1,2\n"), "data.csv")).toMatchObject({ kind: "document", mime: "text/csv" });
  });
  it("trusts the content, not the file name", () => {
    expect(classifyUpload(png, "photo.pdf")).toMatchObject({ kind: "image", ext: ".png" });
    expect(classifyUpload(exe, "photo.png")).toBeNull(); // a program renamed to .png
    expect(classifyUpload(Buffer.from("#!/bin/sh\nrm -rf /"), "notes.txt")).toBeNull();
    expect(classifyUpload(Buffer.from("plain"), "mystery.bin")).toBeNull();
  });
  it("blocks programs, scripts, active web content and macro documents by name, even with a harmless first extension", () => {
    for (const n of ["setup.exe", "run.bat", "x.js", "page.html", "logo.svg", "invoice.pdf.exe", "a.PS1", "macro.docm", "tool.jar", "data.xml"]) {
      expect(classifyUpload(pdf, n), n).toBeNull();
    }
  });
  it("rejects empty files and binary data posing as text", () => {
    expect(classifyUpload(Buffer.alloc(0), "a.png")).toBeNull();
    expect(classifyUpload(Buffer.from([1, 2, 0, 4]), "a.txt")).toBeNull();
  });
  it("does not serve SVG or unknown zip contents", () => {
    expect(classifyUpload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "x.png")).toBeNull();
    expect(classifyUpload(zip, "unknown.bin")).toBeNull();
  });
});

describe("sanitizeFilename", () => {
  it("removes paths, control characters and leading dots", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\me\\a\"b<c>.png")).toBe("a_b_c_.png");
    expect(sanitizeFilename(".hidden.txt")).toBe("hidden.txt");
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("a\r\nb.png")).not.toMatch(/[\r\n]/);
  });
});

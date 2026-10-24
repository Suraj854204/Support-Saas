import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { v2 as cloudinary } from "cloudinary";

import { env } from "@/config/env";

export type Provider = "local" | "cloudinary";
export type ResourceType = "image" | "video" | "raw";

export interface StoredObject {
  provider: Provider;
  key: string;
  resourceType: ResourceType;
}

export interface OpenedObject {
  stream: Readable;
  /** Total size of the object. */
  size: number;
  /** Present when only part of the object is returned (HTTP 206). */
  range?: { start: number; end: number };
}

export function cloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

let configured = false;
function client() {
  if (!configured) {
    cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
    configured = true;
  }
  return cloudinary;
}

const resourceTypeFor = (kind: string): ResourceType => (kind === "image" ? "image" : kind === "video" || kind === "audio" ? "video" : "raw");

function localPath(key: string): string {
  const root = path.resolve(env.ATTACHMENT_STORAGE_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

/** Parses a single `bytes=a-b` range. Returns null for anything else (the caller then sends the whole file). */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

export const chatStorage = {
  provider(): Provider {
    return cloudinaryConfigured() ? "cloudinary" : "local";
  },

  async put(orgId: string, buffer: Buffer, meta: { kind: string; ext: string }): Promise<StoredObject> {
    const id = crypto.randomUUID();
    if (cloudinaryConfigured()) {
      const resourceType = resourceTypeFor(meta.kind);
      // Raw files need the extension inside the public id; images and videos keep their own format.
      const publicId = `${env.CLOUDINARY_FOLDER}/${orgId}/${id}${resourceType === "raw" ? meta.ext : ""}`;
      await new Promise<void>((resolve, reject) => {
        const up = client().uploader.upload_stream(
          { resource_type: resourceType, type: "authenticated", public_id: publicId, overwrite: false, unique_filename: false, use_filename: false },
          (err) => (err ? reject(err) : resolve())
        );
        up.end(buffer);
      });
      return { provider: "cloudinary", key: publicId, resourceType };
    }
    const key = `chat/${orgId}/${id}.bin`;
    const full = localPath(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, buffer);
    return { provider: "local", key, resourceType: "raw" };
  },

  async open(obj: StoredObject & { size: number }, rangeHeader?: string): Promise<OpenedObject> {
    const range = parseRange(rangeHeader, obj.size);
    if (obj.provider === "local") {
      const full = localPath(obj.key);
      return { stream: fs.createReadStream(full, range ? { start: range.start, end: range.end } : undefined), size: obj.size, ...(range && { range }) };
    }
    // The signed URL is built and used on the server only; it is never given to a browser.
    const url = client().url(obj.key, { resource_type: obj.resourceType, type: "authenticated", sign_url: true, secure: true });
    const res = await fetch(url, { headers: range ? { Range: `bytes=${range.start}-${range.end}` } : {} });
    if (!res.ok || !res.body) throw new Error(`Storage fetch failed (${res.status})`);
    return { stream: Readable.fromWeb(res.body as never), size: obj.size, ...(range && { range }) };
  },

  async remove(obj: StoredObject): Promise<void> {
    if (obj.provider === "local") {
      await fsp.rm(localPath(obj.key), { force: true });
      return;
    }
    await client().uploader.destroy(obj.key, { resource_type: obj.resourceType, type: "authenticated", invalidate: true });
  },
};

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { env } from "@/config/env";

export interface StorageDriver {
  /** Persists a buffer under a generated key and returns that key. */
  save(orgId: string, buffer: Buffer): Promise<string>;
  /** Reads back a previously-saved buffer by key. */
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/**
 * Local-disk driver. Keys look like "<orgId>/<random>.bin" — org-scoped
 * directories so a future migration to per-org buckets/prefixes (S3) is a
 * straight lift of this same key shape, not a redesign.
 */
class LocalDiskStorageDriver implements StorageDriver {
  private async resolvePath(key: string): Promise<string> {
    // Reject any key that could escape the storage root via path traversal.
    const resolved = path.resolve(env.ATTACHMENT_STORAGE_DIR, key);
    const root = path.resolve(env.ATTACHMENT_STORAGE_DIR);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      throw new Error("Invalid storage key");
    }
    return resolved;
  }

  async save(orgId: string, buffer: Buffer): Promise<string> {
    const key = `${orgId}/${crypto.randomUUID()}.bin`;
    const fullPath = await this.resolvePath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return key;
  }

  async read(key: string): Promise<Buffer> {
    const fullPath = await this.resolvePath(key);
    return fs.readFile(fullPath);
  }

  async delete(key: string): Promise<void> {
    const fullPath = await this.resolvePath(key);
    await fs.rm(fullPath, { force: true });
  }
}

export const storage: StorageDriver = new LocalDiskStorageDriver();

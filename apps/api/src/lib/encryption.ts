import crypto from "node:crypto";

import { env } from "@/config/env";

/**
 * Reversible, authenticated encryption for secrets that must be decrypted
 * later — currently just Gmail OAuth access/refresh tokens. Everything in
 * lib/security.ts is one-way (hashes); this is the one place we need to get
 * a plaintext back out.
 *
 * Format written to the DB: "v1:<ivBase64>:<authTagBase64>:<ciphertextBase64>"
 * — self-contained, so a single String column holds everything needed to
 * decrypt without extra IV/tag columns.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96-bit IV is the GCM-recommended size
const FORMAT_VERSION = "v1";

function getKey(): Buffer {
  const key = Buffer.from(env.ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must decode (base64) to exactly 32 bytes for AES-256-GCM, got ${key.length}`
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [FORMAT_VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    ":"
  );
}

export function decryptSecret(encoded: string): string {
  const parts = encoded.split(":");
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error("Malformed or unsupported encrypted-secret format");
  }
  const [, ivB64, authTagB64, ciphertextB64] = parts;

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

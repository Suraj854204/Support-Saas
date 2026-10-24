import { describe, expect, it } from "vitest";

import { env, productionProblems } from "../env";

const good = {
  ...env,
  NODE_ENV: "production" as const,
  SECURITY_HASH_SECRET: "h".repeat(40),
  AI_SERVICE_TOKEN: "t".repeat(32),
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  WIDGET_JWT_SECRET: "c".repeat(32),
  MAIL_DEV_LOG_ONLY: false,
  SMTP_USER: "u",
  SMTP_PASS: "p",
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
};

describe("productionProblems", () => {
  it("accepts a properly configured production environment", () => {
    expect(productionProblems(good)).toEqual([]);
  });
  it("needs all three Cloudinary values together (or none)", () => {
    expect(productionProblems({ ...good, CLOUDINARY_CLOUD_NAME: "demo" }).join(" ")).toMatch(/CLOUDINARY/);
    expect(productionProblems({ ...good, CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s" })).toEqual([]);
  });
  it("does nothing outside production", () => {
    expect(productionProblems({ ...good, NODE_ENV: "development", AI_SERVICE_TOKEN: "" })).toEqual([]);
  });
  it("refuses the built-in insecure hash secret", () => {
    expect(productionProblems({ ...good, SECURITY_HASH_SECRET: "dev-only-insecure-security-hash-secret-change-me" }).join()).toMatch(/SECURITY_HASH_SECRET/);
  });
  it("requires a strong AI service token", () => {
    expect(productionProblems({ ...good, AI_SERVICE_TOKEN: "" }).join()).toMatch(/AI_SERVICE_TOKEN/);
    expect(productionProblems({ ...good, AI_SERVICE_TOKEN: "short" }).join()).toMatch(/AI_SERVICE_TOKEN/);
  });
  it("requires distinct JWT secrets (a widget token must never be valid as a staff token)", () => {
    expect(productionProblems({ ...good, WIDGET_JWT_SECRET: good.JWT_ACCESS_SECRET }).join()).toMatch(/must all be different/);
  });
  it("rejects placeholder secrets and log-only mail", () => {
    expect(productionProblems({ ...good, JWT_ACCESS_SECRET: "change-me-change-me-change-me" }).join()).toMatch(/placeholders/);
    expect(productionProblems({ ...good, MAIL_DEV_LOG_ONLY: true }).join()).toMatch(/MAIL_DEV_LOG_ONLY/);
    expect(productionProblems({ ...good, SMTP_PASS: "" }).join()).toMatch(/SMTP_USER and SMTP_PASS/);
  });
  it("refuses the public placeholder encryption key", () => {
    expect(productionProblems({ ...good, ENCRYPTION_KEY: "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=" }).join()).toMatch(/ENCRYPTION_KEY/);
  });
});

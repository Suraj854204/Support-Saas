import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  MONGO_URL: z.string().min(1, "MONGO_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  ELASTICSEARCH_URL: z.string().default("http://localhost:9200"),
  QDRANT_URL: z.string().default("http://localhost:6333"),
  KAFKA_BROKERS: z.string().default("localhost:9092"),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 chars"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 chars"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  WIDGET_JWT_SECRET: z.string().min(16, "WIDGET_JWT_SECRET must be at least 16 chars"),
  WIDGET_JWT_TTL: z.string().default("90d"),

  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  AI_SERVICE_URL: z.string().default("http://localhost:8000"),
  // Shared secret the AI service requires on every call (X-Internal-Token). Required in production.
  AI_SERVICE_TOKEN: z.string().default(""),
  AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().min(500).default(20000),

  KAFKA_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  // Used to derive HMAC hashes for OTPs, email-verification tokens,
  // trusted-device tokens, invitation tokens, etc. Never log or expose.
  SECURITY_HASH_SECRET: z
    .string()
    .min(32, "SECURITY_HASH_SECRET must be at least 32 chars")
    .default("dev-only-insecure-security-hash-secret-change-me"),

  // Outbound mail (used for OTP codes, verification links, invitations,
  // ticket notifications). Works with any SMTP provider, including Gmail
  // SMTP + an App Password for local development.
  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  MAIL_FROM: z.string().default("SupportFlow <no-reply@supportflow.local>"),
  // When true and SMTP creds are empty, mail is logged instead of sent —
  // keeps local dev/CI working without real credentials.
  MAIL_DEV_LOG_ONLY: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  LOGIN_OTP_TTL_SECONDS: z.coerce.number().default(300),
  LOGIN_OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  LOGIN_OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().default(60),

  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().default(24),

  TRUSTED_DEVICE_TTL_DAYS: z.coerce.number().default(30),
  TRUSTED_DEVICE_COOKIE_NAME: z.string().default("td"),

  INVITATION_TTL_DAYS: z.coerce.number().default(7),

  // Reversible encryption for Gmail OAuth tokens at rest. Must decode
  // (base64) to exactly 32 bytes — generate a real one with: openssl rand -base64 32
  // This default is a valid-length placeholder for local dev ONLY.
  ENCRYPTION_KEY: z.string().default("YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE="),

  // Google OAuth (Gmail inbox connection). The client secret must never
  // reach the frontend — it's only ever read here, server-side.
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default("http://localhost:4000/api/integrations/gmail/callback"),
  GMAIL_OAUTH_STATE_TTL_SECONDS: z.coerce.number().default(600),
  // Bounded first-sync fetch when a connection has no history checkpoint
  // yet (brand new connection, or one whose checkpoint expired past
  // Gmail's ~7 day history retention window). Every sync after that is
  // history-based, not a rescan.
  GMAIL_INITIAL_SYNC_LIMIT: z.coerce.number().default(20),
  // Background poller interval (Feature 5's "scheduled polling" — designed
  // so Gmail push notifications/webhooks can replace this loop later
  // without changing gmailSyncService itself).
  GMAIL_SYNC_POLL_INTERVAL_SECONDS: z.coerce.number().default(120),

  // Feature 15/16: how often the SLA breach/escalation/approaching sweep
  // and ticket_inactive automation check run, and how far ahead
  // "approaching" looks.
  SLA_SWEEP_INTERVAL_SECONDS: z.coerce.number().default(300),
  SLA_APPROACHING_WINDOW_MINUTES: z.coerce.number().default(30),

  // Feature 5 attachment storage (Phase 10). Local-disk by default — swap
  // in an S3-backed StorageDriver later without touching call sites; see
  // lib/storage.ts.
  ATTACHMENT_STORAGE_DIR: z.string().default("./storage/attachments"),

  // Chat file sharing (customers and staff). With all three Cloudinary values set, files go to Cloudinary as
  // private ("authenticated") assets; otherwise to local disk, which is lost when a container is replaced.
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
  CLOUDINARY_FOLDER: z.string().default("support-desk"),
  CHAT_UPLOAD_MAX_MB: z.coerce.number().min(1).max(100).default(10),
  CHAT_UPLOAD_VIDEO_MAX_MB: z.coerce.number().min(1).max(200).default(50),
  // Public base URL of this API, used only to build file links returned to clients (relative paths if empty).
  API_PUBLIC_URL: z.string().default(""),

  // Billing (Stripe). All optional: without STRIPE_SECRET_KEY the app runs on the free plan limits and
  // the billing endpoints answer 503. Price ids come from your Stripe dashboard (Products > Prices).
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  STRIPE_PRICE_STARTER: z.string().default(""),
  STRIPE_PRICE_GROWTH: z.string().default(""),
  STRIPE_PRICE_ENTERPRISE: z.string().default(""),
  // Metered (per AI reply over the allowance) prices, one per plan. Created by `npm run stripe:setup`.
  STRIPE_PRICE_OVERAGE_STARTER: z.string().default(""),
  STRIPE_PRICE_OVERAGE_GROWTH: z.string().default(""),
  STRIPE_PRICE_OVERAGE_ENTERPRISE: z.string().default(""),
  STRIPE_METER_EVENT_NAME: z.string().default("ai_reply_overage"),
  // One-time introductory discount on the Starter plan's first month (a Stripe coupon id).
  STRIPE_COUPON_INTRO: z.string().default(""),
  // GST. Stripe Tax cannot calculate domestic Indian GST for a seller based in India, so fixed Stripe Tax Rate
  // objects (txr_..., comma separated, e.g. one 18% IGST rate, or CGST 9% + SGST 9%) are applied to every line.
  STRIPE_TAX_RATE_IDS: z.string().default(""),
  // Your GSTIN as a Stripe account tax id (taxid_..., comma separated), shown on every invoice.

  // SemantiCache (apps/semantic-cache). The gateway only talks to it for
  // admin stats/invalidation — the AI service owns the hot path. The shared
  // token authenticates service-to-service calls; leave empty to disable
  // the header (the Java service then runs unauthenticated, dev only).
  SEMANTIC_CACHE_URL: z.string().default("http://localhost:8081"),
  SEMANTIC_CACHE_SERVICE_TOKEN: z.string().default(""),
  SEMANTIC_CACHE_TIMEOUT_MS: z.coerce.number().default(3000),
});

const PLACEHOLDER_ENCRYPTION_KEY = "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=";
const INSECURE_HASH_SECRET = "dev-only-insecure-security-hash-secret-change-me";

/** Settings that are tolerable on a laptop but unsafe in production: refuse to start instead of running weakly. */
export function productionProblems(e: z.infer<typeof envSchema>): string[] {
  if (e.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if (e.SECURITY_HASH_SECRET === INSECURE_HASH_SECRET) problems.push("SECURITY_HASH_SECRET must be set to a unique random value");
  if (!e.AI_SERVICE_TOKEN || e.AI_SERVICE_TOKEN.length < 24) problems.push("AI_SERVICE_TOKEN must be set (at least 24 chars)");
  const secrets = [e.JWT_ACCESS_SECRET, e.JWT_REFRESH_SECRET, e.WIDGET_JWT_SECRET];
  if (new Set(secrets).size !== secrets.length) problems.push("JWT_ACCESS_SECRET, JWT_REFRESH_SECRET and WIDGET_JWT_SECRET must all be different");
  if (secrets.some((s) => /change[-_ ]?me|placeholder|example/i.test(s))) problems.push("JWT secrets look like placeholders");
  const cloudinary = [e.CLOUDINARY_CLOUD_NAME, e.CLOUDINARY_API_KEY, e.CLOUDINARY_API_SECRET].filter(Boolean).length;
  if (cloudinary > 0 && cloudinary < 3) problems.push("CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET must all be set together");
  if (e.STRIPE_SECRET_KEY && !e.STRIPE_WEBHOOK_SECRET) problems.push("STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set (paid plans are applied by the webhook)");
  if (e.STRIPE_SECRET_KEY && !e.STRIPE_PRICE_STARTER && !e.STRIPE_PRICE_GROWTH && !e.STRIPE_PRICE_ENTERPRISE) problems.push("Set STRIPE_PRICE_STARTER and/or STRIPE_PRICE_GROWTH when Stripe is enabled");
  if (e.ENCRYPTION_KEY === PLACEHOLDER_ENCRYPTION_KEY) problems.push("ENCRYPTION_KEY must be a real key (openssl rand -base64 32); the default is public");
  if (e.MAIL_DEV_LOG_ONLY) problems.push("MAIL_DEV_LOG_ONLY must be false in production");
  else if (!e.SMTP_USER || !e.SMTP_PASS) problems.push("SMTP_USER and SMTP_PASS are required when mail is enabled");
  return problems;
}

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("❌ Invalid environment configuration:");
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  const problems = productionProblems(parsed.data);
  if (problems.length > 0) {
    // eslint-disable-next-line no-console
    console.error("❌ Unsafe production configuration:\n - " + problems.join("\n - "));
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;

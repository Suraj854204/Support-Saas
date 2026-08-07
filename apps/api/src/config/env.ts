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
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("❌ Invalid environment configuration:");
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;

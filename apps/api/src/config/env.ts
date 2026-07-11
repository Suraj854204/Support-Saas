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

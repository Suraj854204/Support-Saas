import path from "path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      MONGO_URL: "mongodb://test:test@localhost:27017/test",
      REDIS_URL: "redis://localhost:6379",
      JWT_ACCESS_SECRET: "test_access_secret_at_least_16_chars",
      JWT_REFRESH_SECRET: "test_refresh_secret_at_least_16_chars",
      WIDGET_JWT_SECRET: "test_widget_secret_at_least_16_chars",
      KAFKA_ENABLED: "false",
    },
  },
});

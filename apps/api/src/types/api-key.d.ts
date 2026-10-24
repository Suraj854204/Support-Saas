import type { AuthenticatedApiKey } from "@/modules/api-keys/api-keys.service";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireApiKey() on the public API only. */
      apiKey?: AuthenticatedApiKey;
    }
  }
}

export {};

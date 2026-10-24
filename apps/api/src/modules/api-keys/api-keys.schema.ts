import { z } from "zod";

export const API_KEY_SCOPES = ["tickets:read", "tickets:write"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(API_KEY_SCOPES.length),
  // Optional expiry; omit for a non-expiring key.
  expiresInDays: z.number().int().min(1).max(730).optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const apiKeyIdParamSchema = z.object({ id: z.string().uuid() });

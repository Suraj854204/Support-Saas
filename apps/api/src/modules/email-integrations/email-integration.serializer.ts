import type { EmailConnection as PrismaEmailConnection } from "@prisma/client";

import { DEFAULT_EMAIL_CONNECTION_SETTINGS, type EmailConnectionSettings } from "./email-integration.types";

export interface PublicEmailConnection {
  id: string;
  orgId: string;
  provider: PrismaEmailConnection["provider"];
  email: string;
  scopes: string[];
  syncStatus: PrismaEmailConnection["syncStatus"];
  lastSyncedAt: string | null;
  lastError: string | null;
  isActive: boolean;
  settings: EmailConnectionSettings;
  connectedById: string;
  createdAt: string;
  updatedAt: string;
}

export function toPublicEmailConnection(connection: PrismaEmailConnection): PublicEmailConnection {
  return {
    id: connection.id,
    orgId: connection.orgId,
    provider: connection.provider,
    email: connection.email,
    scopes: connection.scopes,
    syncStatus: connection.syncStatus,
    lastSyncedAt: connection.lastSyncedAt ? connection.lastSyncedAt.toISOString() : null,
    lastError: connection.lastError,
    isActive: connection.isActive,
    settings: {
      ...DEFAULT_EMAIL_CONNECTION_SETTINGS,
      ...((connection.settings as Partial<EmailConnectionSettings> | null) ?? {}),
    },
    connectedById: connection.connectedById,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

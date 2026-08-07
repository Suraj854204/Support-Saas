import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export interface AuditEntry {
  orgId: string;
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes an audit-log row. Never throws — a failed audit write shouldn't
 * roll back or block the action it's describing, just get logged locally
 * so it isn't silently lost.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: entry.orgId,
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata,
      },
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, "Failed to write audit log entry");
  }
}

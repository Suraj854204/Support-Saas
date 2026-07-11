import type { User as PrismaUser } from "@prisma/client";
import type { User } from "@support-saas/shared-types";

export function toPublicUser(user: PrismaUser): User {
  return {
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    isActive: user.isActive,
    lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

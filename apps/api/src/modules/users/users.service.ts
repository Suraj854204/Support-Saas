import type { UserRole } from "@support-saas/shared-types";


import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";

export const usersService = {
  async listForOrg(orgId: string) {
    return prisma.user.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  },

  async getById(orgId: string, userId: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, orgId } });
    if (!user) throw AppError.notFound("User not found");
    return user;
  },

  async updateRole(orgId: string, userId: string, role: UserRole) {
    const target = await this.getById(orgId, userId); // 404s if cross-tenant or missing

    if (target.role === "owner" && role !== "owner") {
      await assertNotLastOwner(orgId, "demote");
    }

    return prisma.user.update({ where: { id: userId }, data: { role } });
  },

  async setActive(orgId: string, userId: string, isActive: boolean) {
    const target = await this.getById(orgId, userId);

    if (target.role === "owner" && !isActive) {
      await assertNotLastOwner(orgId, "deactivate");
    }

    return prisma.user.update({ where: { id: userId }, data: { isActive } });
  },

  /** Feature 14: "set agent capacity" / lightweight working-hours-adjacent settings. */
  async updateCapacity(orgId: string, userId: string, input: { weeklyCapacity?: number | null; timezone?: string | null }) {
    await this.getById(orgId, userId);
    return prisma.user.update({ where: { id: userId }, data: input });
  },

  /** Feature 14: "view workloads" — each org member's current open-ticket count. */
  async getWorkloads(orgId: string) {
    const users = await prisma.user.findMany({
      where: { orgId, isActive: true },
      select: { id: true, name: true, avatarUrl: true, role: true, weeklyCapacity: true, lastSeenAt: true },
    });

    const openCounts = await prisma.ticket.groupBy({
      by: ["assigneeId"],
      where: { orgId, assigneeId: { not: null }, status: { notIn: ["solved", "closed"] } },
      _count: { _all: true },
    });
    const countByUser = new Map(openCounts.map((c) => [c.assigneeId, c._count._all]));

    return users.map((u) => ({ ...u, openTicketCount: countByUser.get(u.id) ?? 0 }));
  },
};

/** Throws if `orgId` would be left with zero active owners after this action. */
async function assertNotLastOwner(orgId: string, action: "demote" | "deactivate") {
  const activeOwnerCount = await prisma.user.count({ where: { orgId, role: "owner", isActive: true } });
  if (activeOwnerCount <= 1) {
    throw AppError.validation(
      `Cannot ${action} this account — every organization must have at least one active owner`
    );
  }
}

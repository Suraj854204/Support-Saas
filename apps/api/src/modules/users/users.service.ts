import type { UserRole } from "@support-saas/shared-types";
import bcrypt from "bcryptjs";


import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";

const BCRYPT_ROUNDS = 12;

export const usersService = {
  async listForOrg(orgId: string) {
    return prisma.user.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  },

  async getById(orgId: string, userId: string) {
    const user = await prisma.user.findFirst({ where: { id: userId, orgId } });
    if (!user) throw AppError.notFound("User not found");
    return user;
  },

  async invite(
    orgId: string,
    input: { email: string; name: string; role: UserRole; password: string }
  ) {
    // Emails are only unique per-org (see the Prisma schema's @@unique([orgId, email])),
    // so the same person can legitimately be a member of multiple orgs with
    // different accounts — but never two accounts in the same org.
    const existing = await prisma.user.findFirst({ where: { orgId, email: input.email } });
    if (existing) {
      throw AppError.conflict("A member with this email already exists in your organization");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    return prisma.user.create({
      data: { orgId, email: input.email, name: input.name, role: input.role, passwordHash },
    });
  },

  async updateRole(orgId: string, userId: string, role: UserRole) {
    await this.getById(orgId, userId); // 404s if cross-tenant or missing
    return prisma.user.update({ where: { id: userId }, data: { role } });
  },

  async setActive(orgId: string, userId: string, isActive: boolean) {
    await this.getById(orgId, userId);
    return prisma.user.update({ where: { id: userId }, data: { isActive } });
  },
};

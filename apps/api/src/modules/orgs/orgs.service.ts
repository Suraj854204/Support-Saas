import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";

export const orgsService = {
  async getById(orgId: string) {
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw AppError.notFound("Organization not found");
    return org;
  },

  async update(orgId: string, data: { name?: string; logoUrl?: string | null; domain?: string | null }) {
    await this.getById(orgId);
    return prisma.organization.update({ where: { id: orgId }, data });
  },
};

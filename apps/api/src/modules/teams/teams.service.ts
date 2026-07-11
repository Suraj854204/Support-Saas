import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";

export const teamsService = {
  async list(orgId: string) {
    return prisma.team.findMany({
      where: { orgId },
      include: { members: { include: { user: true } } },
      orderBy: { createdAt: "asc" },
    });
  },

  async create(orgId: string, name: string) {
    return prisma.team.create({ data: { orgId, name } });
  },

  async getById(orgId: string, teamId: string) {
    const team = await prisma.team.findFirst({
      where: { id: teamId, orgId },
      include: { members: { include: { user: true } } },
    });
    if (!team) throw AppError.notFound("Team not found");
    return team;
  },

  async addMember(orgId: string, teamId: string, userId: string) {
    await this.getById(orgId, teamId);
    const user = await prisma.user.findFirst({ where: { id: userId, orgId } });
    if (!user) throw AppError.notFound("User not found in this organization");

    return prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: { teamId, userId },
      update: {},
    });
  },

  async removeMember(orgId: string, teamId: string, userId: string) {
    await this.getById(orgId, teamId);
    await prisma.teamMember.deleteMany({ where: { teamId, userId } });
  },

  async delete(orgId: string, teamId: string) {
    await this.getById(orgId, teamId);
    await prisma.team.delete({ where: { id: teamId } });
  },
};

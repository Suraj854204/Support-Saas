import type { CreateCannedResponseInput, UpdateCannedResponseInput } from "./canned-responses.schema";

import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";

export const cannedResponsesService = {
  async list(orgId: string) {
    return prisma.cannedResponse.findMany({ where: { orgId }, orderBy: { name: "asc" } });
  },

  async create(orgId: string, createdById: string, input: CreateCannedResponseInput) {
    return prisma.cannedResponse.create({ data: { orgId, createdById, ...input } });
  },

  async update(orgId: string, id: string, input: UpdateCannedResponseInput) {
    const existing = await prisma.cannedResponse.findFirst({ where: { id, orgId } });
    if (!existing) throw AppError.notFound("Canned response not found");
    return prisma.cannedResponse.update({ where: { id }, data: input });
  },

  async remove(orgId: string, id: string) {
    const existing = await prisma.cannedResponse.findFirst({ where: { id, orgId } });
    if (!existing) throw AppError.notFound("Canned response not found");
    await prisma.cannedResponse.delete({ where: { id } });
  },

  /** Used by the automation engine's send_email action when it references a template by id — org-scoped, returns null rather than throwing so callers can fall back gracefully. */
  async getById(orgId: string, id: string) {
    return prisma.cannedResponse.findFirst({ where: { id, orgId } });
  },
};

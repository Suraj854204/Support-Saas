import type { CreateCustomerInput } from "./customers.schema";

import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";


export const customersService = {
  async list(orgId: string, search?: string) {
    return prisma.customer.findMany({
      where: {
        orgId,
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }),
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  },

  async create(orgId: string, input: CreateCustomerInput) {
    if (!input.name && !input.email) {
      throw AppError.validation("Provide at least a name or an email for the customer");
    }
    return prisma.customer.create({ data: { orgId, name: input.name ?? null, email: input.email ?? null } });
  },
};

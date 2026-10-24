import bcrypt from "bcryptjs";

import { prisma } from "../src/lib/prisma";

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const org = await prisma.organization.upsert({
    where: { slug: "acme-demo" },
    update: {},
    create: { name: "Acme Demo Inc.", slug: "acme-demo", planTier: "growth" },
  });

  const owner = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: "owner@acme-demo.test" } },
    update: {},
    create: {
      orgId: org.id,
      email: "owner@acme-demo.test",
      passwordHash,
      name: "Ava Owner",
      role: "owner",
    },
  });

  const agent = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: "agent@acme-demo.test" } },
    update: {},
    create: {
      orgId: org.id,
      email: "agent@acme-demo.test",
      passwordHash,
      name: "Alex Agent",
      role: "agent",
    },
  });

  const customer = await prisma.customer.create({
    data: {
      orgId: org.id,
      email: "customer@example.com",
      name: "Casey Customer",
    },
  });

  const org2 = await prisma.organization.update({
    where: { id: org.id },
    data: { nextTicketNumber: { increment: 1 } },
  });

  await prisma.ticket.create({
    data: {
      orgId: org.id,
      number: org2.nextTicketNumber - 1,
      subject: "Cannot reset my password",
      customerId: customer.id,
      assigneeId: agent.id,
      priority: "high",
      messages: {
        create: [
          { authorType: "customer", body: "I never received the password reset email." },
        ],
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log("Seeded:", { org: org.slug, owner: owner.email, agent: agent.email });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

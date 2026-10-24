import { overageService } from "./overage.service";
import { planFor, type PlanLimits } from "./plans";
import { usageService } from "./usage.service";

import { AppError } from "@/lib/app-error";
import { prisma } from "@/lib/prisma";

type Countable = "seats" | "articles" | "forms";

const LABEL: Record<Countable | "aiRepliesPerMonth", string> = {
  seats: "team members",
  articles: "knowledge articles",
  forms: "forms and assistants",
  aiRepliesPerMonth: "AI replies this month",
};

async function limitsFor(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { planTier: true } });
  const plan = planFor(org?.planTier);
  return { plan, limits: plan.limits };
}

function reached(metric: keyof PlanLimits, limit: number, planName: string) {
  return AppError.planLimit(
    `Your ${planName} plan includes ${limit} ${LABEL[metric]}. Upgrade your plan to add more.`,
    { metric, limit, plan: planName.toLowerCase() }
  );
}

/**
 * Plan enforcement. Limits only block ADDING more: lowering a plan never deletes or disables
 * existing data. The check is a count at request time, which is fine for human-paced actions
 * (inviting, creating an article); the high-volume metric (AI replies) uses the atomic counter instead.
 */
export const entitlementsService = {
  limitsFor,

  async countFor(orgId: string, what: Countable, opts: { includePendingInvites?: boolean } = {}): Promise<number> {
    if (what === "seats") {
      const [users, invites] = await Promise.all([
        prisma.user.count({ where: { orgId, isActive: true } }),
        opts.includePendingInvites === false
          ? Promise.resolve(0)
          : prisma.invitation.count({ where: { orgId, status: "pending", expiresAt: { gt: new Date() } } }),
      ]);
      return users + invites;
    }
    if (what === "articles") return prisma.knowledgeArticle.count({ where: { orgId } });
    return prisma.intakeForm.count({ where: { orgId } });
  },

  async assertCanAdd(orgId: string, what: Countable, opts: { includePendingInvites?: boolean } = {}) {
    const { plan, limits } = await limitsFor(orgId);
    const limit = what === "seats" ? limits.seats : what === "articles" ? limits.articles : limits.forms;
    if (limit === null) return;
    const used = await this.countFor(orgId, what, opts);
    if (used >= limit) throw reached(what, limit, plan.name);
  },

  /** Takes one AI reply from the month's allowance. Returns false (never throws) when it is used up. */
  async consumeAiReply(orgId: string): Promise<boolean> {
    const { plan, limits } = await limitsFor(orgId);
    const { allowed } = await usageService.consume(orgId, "ai_replies", limits.aiRepliesPerMonth);
    if (allowed) return true;
    // Allowance used up: pay-per-use continues only if the org opted in, has an active paid subscription, and is under the cap.
    return overageService.tryConsume(orgId, plan.tier);
  },

  /** Same, but as an error, for actions a staff member started (e.g. "suggest a reply"). */
  async assertAiReply(orgId: string) {
    if (!(await this.consumeAiReply(orgId))) {
      const { plan, limits } = await limitsFor(orgId);
      throw reached("aiRepliesPerMonth", limits.aiRepliesPerMonth ?? 0, plan.name);
    }
  },
};

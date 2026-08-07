import type { UserRole } from "@support-saas/shared-types";
import bcrypt from "bcryptjs";

import type { AcceptInvitationInput, CreateInvitationInput } from "./invitations.schema";

import { env } from "@/config/env";
import { AppError } from "@/lib/app-error";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { generateRawToken, hashToken } from "@/lib/security";
import { issueTokenPair, type DeviceContext } from "@/modules/auth/auth.service";
import { invitationTemplate } from "@/services/email-templates/invitation.template";
import { mailService } from "@/services/mail.service";

const BCRYPT_ROUNDS = 12;

// Only an owner may hand out the owner role; an admin can invite anyone up
// to (and including) another admin, but not an owner — otherwise any admin
// could silently mint themselves a co-owner.
function assertCanGrantRole(inviterRole: UserRole, targetRole: UserRole) {
  if (targetRole === "owner" && inviterRole !== "owner") {
    throw AppError.forbidden("Only an owner can invite another owner");
  }
}

export const invitationsService = {
  async create(
    orgId: string,
    inviter: { id: string; name: string; role: UserRole },
    input: CreateInvitationInput
  ) {
    assertCanGrantRole(inviter.role, input.role);

    const existingMember = await prisma.user.findFirst({ where: { orgId, email: input.email } });
    if (existingMember) {
      throw AppError.conflict("This person is already a member of your organization");
    }

    const existingPending = await prisma.invitation.findFirst({
      where: { orgId, email: input.email, status: "pending" },
    });

    if (existingPending) {
      if (existingPending.expiresAt > new Date()) {
        throw AppError.conflict("An active invitation already exists for this email");
      }
      // Stale pending row past its TTL — clean it up so a new one can issue.
      await prisma.invitation.update({ where: { id: existingPending.id }, data: { status: "expired" } });
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw AppError.notFound("Organization not found");

    const rawToken = generateRawToken(32);
    const expiresAt = new Date(Date.now() + env.INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        orgId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(rawToken),
        invitedById: inviter.id,
        expiresAt,
      },
    });

    const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invitation?token=${rawToken}`;
    const { subject, html, text } = invitationTemplate({
      organizationName: org.name,
      inviterName: inviter.name,
      role: input.role,
      acceptUrl,
      expiresInDays: env.INVITATION_TTL_DAYS,
    });
    await mailService.send({ to: input.email, subject, html, text });

    await recordAudit({
      orgId,
      actorId: inviter.id,
      action: "invitation.created",
      targetType: "invitation",
      targetId: invitation.id,
      metadata: { email: input.email, role: input.role },
    });

    return invitation;
  },

  async list(orgId: string) {
    return prisma.invitation.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
  },

  async revoke(orgId: string, invitationId: string, actorId: string) {
    const invitation = await prisma.invitation.findFirst({ where: { id: invitationId, orgId } });
    if (!invitation) throw AppError.notFound("Invitation not found");

    if (invitation.status !== "pending") {
      throw AppError.validation("Only pending invitations can be revoked");
    }

    const updated = await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "revoked", revokedAt: new Date() },
    });

    await recordAudit({
      orgId,
      actorId,
      action: "invitation.revoked",
      targetType: "invitation",
      targetId: invitationId,
    });

    return updated;
  },

  async accept(input: AcceptInvitationInput, ctx: DeviceContext = {}) {
    const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(input.token) } });

    if (!invitation || invitation.status !== "pending") {
      throw AppError.validation("This invitation link is invalid or has already been used.");
    }

    if (invitation.expiresAt < new Date()) {
      await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "expired" } });
      throw AppError.validation("This invitation has expired. Ask your organization admin to send a new one.");
    }

    // Defensive re-check: someone could theoretically have joined with this
    // email through another path between invite and accept.
    const existingMember = await prisma.user.findFirst({
      where: { orgId: invitation.orgId, email: invitation.email },
    });
    if (existingMember) {
      throw AppError.conflict("An account with this email already belongs to this organization");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          orgId: invitation.orgId,
          email: invitation.email,
          name: input.name,
          role: invitation.role,
          passwordHash,
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: "accepted", acceptedAt: new Date() },
      });
      return created;
    });

    await recordAudit({
      orgId: invitation.orgId,
      actorId: user.id,
      action: "invitation.accepted",
      targetType: "invitation",
      targetId: invitation.id,
    });

    const tokens = await issueTokenPair(user, ctx);
    return { user, tokens };
  },
};

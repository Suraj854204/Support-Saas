import type { Invitation as PrismaInvitation } from "@prisma/client";

export interface PublicInvitation {
  id: string;
  orgId: string;
  email: string;
  role: PrismaInvitation["role"];
  status: PrismaInvitation["status"];
  invitedById: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function toPublicInvitation(invitation: PrismaInvitation): PublicInvitation {
  return {
    id: invitation.id,
    orgId: invitation.orgId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    invitedById: invitation.invitedById,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt ? invitation.acceptedAt.toISOString() : null,
    revokedAt: invitation.revokedAt ? invitation.revokedAt.toISOString() : null,
    createdAt: invitation.createdAt.toISOString(),
  };
}

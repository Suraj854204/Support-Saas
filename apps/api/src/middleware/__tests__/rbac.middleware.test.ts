import type { UserRole } from "@support-saas/shared-types";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { requireAnyRole, requireRole } from "@/middleware/rbac.middleware";

function makeReq(role?: UserRole): Request {
  return { auth: role ? { userId: "u1", orgId: "o1", role } : undefined } as unknown as Request;
}

describe("requireRole (hierarchy)", () => {
  it.each([
    ["owner", "viewer", true],
    ["admin", "viewer", true],
    ["agent", "viewer", true],
    ["viewer", "viewer", true],
    ["viewer", "agent", false],
    ["agent", "admin", false],
    ["admin", "owner", false],
    ["owner", "owner", true],
  ] as const)("role=%s requiring min=%s -> allowed=%s", (userRole, minRole, allowed) => {
    const req = makeReq(userRole);
    const next = vi.fn();
    requireRole(minRole)(req, {} as Response, next);

    if (allowed) {
      expect(next).toHaveBeenCalledWith(); // called with no error
    } else {
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    }
  });

  it("rejects when there is no auth context at all", () => {
    const req = makeReq(undefined);
    const next = vi.fn();
    requireRole("viewer")(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});

describe("requireAnyRole (allow-list)", () => {
  it("allows a role explicitly in the list", () => {
    const req = makeReq("viewer");
    const next = vi.fn();
    requireAnyRole("owner", "viewer")(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a role not in the list even if it would satisfy a hierarchy check", () => {
    const req = makeReq("admin");
    const next = vi.fn();
    requireAnyRole("owner", "viewer")(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});

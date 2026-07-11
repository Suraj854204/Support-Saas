import { describe, expect, it } from "vitest";

import {
  signAccessToken,
  signRefreshToken,
  signWidgetToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyWidgetToken,
} from "@/lib/jwt";

describe("jwt", () => {
  it("round-trips an access token", () => {
    const token = signAccessToken({ sub: "user-1", orgId: "org-1", role: "agent" });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.orgId).toBe("org-1");
    expect(payload.role).toBe("agent");
    expect(payload.type).toBe("access");
  });

  it("round-trips a refresh token", () => {
    const token = signRefreshToken({ sub: "user-1", orgId: "org-1", tokenId: "tok-abc" });
    const payload = verifyRefreshToken(token);
    expect(payload.tokenId).toBe("tok-abc");
    expect(payload.type).toBe("refresh");
  });

  it("round-trips a widget token", () => {
    const token = signWidgetToken({ sub: "customer-1", orgId: "org-1" });
    const payload = verifyWidgetToken(token);
    expect(payload.sub).toBe("customer-1");
    expect(payload.type).toBe("widget");
  });

  it("rejects a refresh token when verified as an access token", () => {
    const token = signRefreshToken({ sub: "user-1", orgId: "org-1", tokenId: "tok-abc" });
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it("rejects an access token when verified as a widget token", () => {
    const token = signAccessToken({ sub: "user-1", orgId: "org-1", role: "owner" });
    expect(() => verifyWidgetToken(token)).toThrow();
  });

  it("rejects a widget token when verified as an access token — the critical isolation boundary", () => {
    // A widget token is issued to anonymous website visitors. If this ever
    // passed as a valid access token, any visitor could forge staff access.
    const token = signWidgetToken({ sub: "customer-1", orgId: "org-1" });
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it("rejects a garbage token", () => {
    expect(() => verifyAccessToken("not.a.jwt")).toThrow();
  });
});

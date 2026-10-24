import { describe, expect, it } from "vitest";

import { createdCounterKey, resolvedCounterKey } from "@/worker/analytics-consumer";

describe("analytics counter keys", () => {
  it("builds a stable, org+date-scoped key for created tickets", () => {
    expect(createdCounterKey("org-1", "2026-07-05")).toBe("analytics:created:org-1:2026-07-05");
  });

  it("builds a stable, org+date-scoped key for resolved tickets", () => {
    expect(resolvedCounterKey("org-1", "2026-07-05")).toBe("analytics:resolved:org-1:2026-07-05");
  });

  it("never collides created vs resolved keys for the same org/date", () => {
    expect(createdCounterKey("org-1", "2026-07-05")).not.toBe(resolvedCounterKey("org-1", "2026-07-05"));
  });

  it("scopes keys per-org so tenants can never read each other's counts", () => {
    expect(createdCounterKey("org-1", "2026-07-05")).not.toBe(createdCounterKey("org-2", "2026-07-05"));
  });
});

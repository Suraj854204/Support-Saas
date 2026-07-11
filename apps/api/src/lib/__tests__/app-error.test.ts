import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/app-error";

describe("AppError", () => {
  it.each([
    ["unauthorized", 401, "UNAUTHORIZED"],
    ["forbidden", 403, "FORBIDDEN"],
    ["notFound", 404, "NOT_FOUND"],
    ["conflict", 409, "CONFLICT"],
    ["validation", 422, "VALIDATION_ERROR"],
    ["rateLimited", 429, "RATE_LIMITED"],
    ["internal", 500, "INTERNAL_ERROR"],
  ] as const)("%s() maps to status %i and code %s", (factory, status, code) => {
    const err = AppError[factory]();
    expect(err.statusCode).toBe(status);
    expect(err.code).toBe(code);
    expect(err).toBeInstanceOf(Error);
  });

  it("carries a custom message through", () => {
    const err = AppError.notFound("Ticket not found");
    expect(err.message).toBe("Ticket not found");
  });

  it("carries structured details through for validation errors", () => {
    const err = AppError.validation("Bad input", { field: "email" });
    expect(err.details).toEqual({ field: "email" });
  });
});

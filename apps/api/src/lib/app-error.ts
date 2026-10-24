import type { ApiErrorCode } from "@support-saas/shared-types";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ApiErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static unauthorized(message = "Authentication required") {
    return new AppError("UNAUTHORIZED", message, 401);
  }

  static forbidden(message = "You do not have permission to perform this action") {
    return new AppError("FORBIDDEN", message, 403);
  }

  static notFound(message = "Resource not found") {
    return new AppError("NOT_FOUND", message, 404);
  }

  static validation(message = "Validation failed", details?: Record<string, unknown>) {
    return new AppError("VALIDATION_ERROR", message, 422, details);
  }

  static conflict(message = "Resource already exists") {
    return new AppError("CONFLICT", message, 409);
  }

  static rateLimited(message = "Too many requests") {
    return new AppError("RATE_LIMITED", message, 429);
  }

  /** 402: the organization's plan does not allow more of this. `details` tells the UI what to show. */
  static planLimit(message: string, details: { metric: string; limit: number; plan: string }) {
    return new AppError("PLAN_LIMIT_REACHED", message, 402, details);
  }

  static billingNotConfigured() {
    return new AppError("BILLING_NOT_CONFIGURED", "Billing is not configured on this server", 503);
  }

  static internal(message = "Internal server error") {
    return new AppError("INTERNAL_ERROR", message, 500);
  }
}

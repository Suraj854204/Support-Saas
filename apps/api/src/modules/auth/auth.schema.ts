import { z } from "zod";

export const registerSchema = z.object({
  orgName: z.string().min(2).max(100),
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(), // falls back to httpOnly cookie if omitted
});

export type RefreshInput = z.infer<typeof refreshSchema>;

// ---------------------------------------------------------------------------
// Feature 1: email OTP login 2FA
// ---------------------------------------------------------------------------

export const verifyLoginOtpSchema = z.object({
  challengeId: z.string().min(1),
  otp: z.string().length(6).regex(/^\d{6}$/, "OTP must be 6 digits"),
  rememberDevice: z.boolean().optional().default(false),
});

export type VerifyLoginOtpInput = z.infer<typeof verifyLoginOtpSchema>;

export const resendLoginOtpSchema = z.object({
  challengeId: z.string().min(1),
});

export type ResendLoginOtpInput = z.infer<typeof resendLoginOtpSchema>;

export const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid(),
});

export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;

// ---------------------------------------------------------------------------
// Feature 2: email verification
// ---------------------------------------------------------------------------

export const sendVerificationSchema = z.object({
  email: z.string().email().optional(), // optional: authenticated users don't need to repeat it
});

export type SendVerificationInput = z.infer<typeof sendVerificationSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

// ---------------------------------------------------------------------------
// Feature 3: forgot password / reset password
// ---------------------------------------------------------------------------

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128, "Password is too long"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
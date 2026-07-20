import { z } from "zod";

export const registerSchema = z.object({
  orgName: z
    .string()
    .trim()
    .min(2, "Organization name must contain at least 2 characters")
    .max(100, "Organization name is too long"),

  name: z
    .string()
    .trim()
    .min(2, "Name must contain at least 2 characters")
    .max(100, "Name is too long"),

  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .transform((value) => value.toLowerCase()),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

export type RegisterInput = z.infer<
  typeof registerSchema
>;

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .transform((value) => value.toLowerCase()),

  password: z
    .string()
    .min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address")
    .transform((value) => value.toLowerCase()),
});

export type ForgotPasswordInput = z.infer<
  typeof forgotPasswordSchema
>;

export const resetPasswordSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, "Reset token is required"),

  password: z
    .string()
    .min(8, "Password must contain at least 8 characters")
    .max(128, "Password is too long"),
});

export type ResetPasswordInput = z.infer<
  typeof resetPasswordSchema
>;

export const refreshSchema = z.object({
  refreshToken: z
    .string()
    .min(1, "Refresh token is required")
    .optional(),
});

export type RefreshInput = z.infer<
  typeof refreshSchema
>;
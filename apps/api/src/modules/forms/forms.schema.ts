import { z } from "zod";

/** `https://shop.example.com` — scheme + host (+port) only, no path. */
const origin = z
  .string()
  .trim()
  .max(200)
  .refine((v) => {
    try {
      const u = new URL(v);
      return (u.protocol === "https:" || u.protocol === "http:") && u.origin === v.replace(/\/$/, "");
    } catch {
      return false;
    }
  }, "Use an origin like https://example.com (no path)")
  .transform((v) => v.replace(/\/$/, ""));

const GOOGLE_FORM_HOSTS = new Set(["docs.google.com", "forms.gle", "forms.google.com"]);

/** Only genuine Google Forms links are stored, and only https, so the "Open form" button can't point anywhere else. */
export const googleFormUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" && GOOGLE_FORM_HOSTS.has(u.hostname);
    } catch {
      return false;
    }
  }, "Paste the link of your Google Form (docs.google.com/forms/... or forms.gle/...)");

export const createFormSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    allowedOrigins: z.array(origin).max(20).default([]),
    source: z.enum(["web", "google_form", "assistant"]).default("web"),
    googleFormUrl: googleFormUrl.optional(),
  })
  .refine((f) => f.source !== "google_form" || Boolean(f.googleFormUrl), {
    message: "Paste your Google Form link",
    path: ["googleFormUrl"],
  });
export type CreateFormInput = z.infer<typeof createFormSchema>;

export const updateFormSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  allowedOrigins: z.array(origin).max(20).optional(),
  isActive: z.boolean().optional(),
  googleFormUrl: googleFormUrl.optional(),
});
export type UpdateFormInput = z.infer<typeof updateFormSchema>;

export const submitFormSchema = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(320),
  subject: z.string().trim().max(300).optional(),
  message: z.string().trim().min(1).max(10_000),
  /** Extra answers from the site's form, e.g. { "Order number": "1042" }. */
  fields: z
    .record(z.string().trim().min(1).max(40), z.string().trim().max(500))
    .refine((r) => Object.keys(r).length <= 10, "At most 10 extra fields")
    .optional(),
  /** For follow-up on serious matters. Digits, spaces, + ( ) - only. */
  phone: z.string().trim().regex(/^[+()\d\s-]{6,20}$/, "Enter a valid phone number").optional().or(z.literal("")),
  contactPreference: z.enum(["call", "message"]).optional(),
  /** Chat history when the AI assistant hands a visitor over to the team. */
  transcript: z.string().trim().max(6000).optional(),
  /** Honeypot: real people never see or fill this. */
  website: z.string().max(500).optional(),
});
export type SubmitFormInput = z.infer<typeof submitFormSchema>;

export const submissionsQuerySchema = z.object({
  formId: z.string().uuid().optional(),
  status: z.enum(["open", "pending", "on_hold", "solved", "closed"]).optional(),
  /** Only messages received in the last N hours (24 = last day, 72 = last 3 days, ...). */
  withinHours: z.coerce.number().int().min(1).max(24 * 30).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type SubmissionsQuery = z.infer<typeof submissionsQuerySchema>;

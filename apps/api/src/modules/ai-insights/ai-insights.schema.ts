import { z } from "zod";

const boolFromQuery = z
  .enum(["true", "false"])
  .transform((v) => v === "true")
  .optional();

export const listTracesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  feedback: z.enum(["up", "down", "none"]).optional(),
  fallbackOnly: boolFromQuery,
  lowConfidenceOnly: boolFromQuery,
});

export const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

export const feedbackBodySchema = z.object({
  feedback: z.enum(["up", "down"]),
  note: z.string().trim().max(500).optional(),
});

const keywordList = z.array(z.string().trim().min(1).max(100)).max(20);

export const createEvalCaseSchema = z.object({
  question: z.string().trim().min(3).max(1000),
  expectedKeywords: keywordList.default([]),
  forbiddenKeywords: keywordList.default([]),
  expectFallback: z.boolean().default(false),
});

export const updateEvalCaseSchema = z
  .object({
    question: z.string().trim().min(3).max(1000),
    expectedKeywords: keywordList,
    forbiddenKeywords: keywordList,
    expectFallback: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" });

export const idParamSchema = z.object({ id: z.string().uuid() });

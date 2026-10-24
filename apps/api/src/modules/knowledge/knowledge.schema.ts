import { z } from "zod";

export const createArticleSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(100_000),
  tags: z.array(z.string().min(1).max(50)).max(30).default([]),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});
export type CreateArticleInput = z.infer<typeof createArticleSchema>;

export const updateArticleSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(100_000).optional(),
  tags: z.array(z.string().min(1).max(50)).max(30).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

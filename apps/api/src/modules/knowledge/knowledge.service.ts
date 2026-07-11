import type { CreateArticleInput, UpdateArticleInput } from "./knowledge.schema";

import { aiClient } from "@/lib/ai-client";
import { AppError } from "@/lib/app-error";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";


async function syncToIndex(orgId: string, articleId: string) {
  const article = await prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
  if (!article) return;

  if (article.status !== "published") {
    // Drafts/archived articles shouldn't be retrievable by the AI — remove
    // them from the index if they were previously published and indexed.
    if (article.vectorIndexed) {
      await aiClient.bestEffort(() => aiClient.deleteArticle(articleId), "knowledge.unpublish");
      await prisma.knowledgeArticle.update({ where: { id: articleId }, data: { vectorIndexed: false } });
    }
    return;
  }

  const result = await aiClient.bestEffort(
    () =>
      aiClient.indexArticle({
        orgId,
        articleId: article.id,
        title: article.title,
        content: article.content,
        tags: article.tags,
      }),
    "knowledge.index"
  );

  await prisma.knowledgeArticle.update({
    where: { id: articleId },
    data: { vectorIndexed: result !== null },
  });

  if (result === null) {
    logger.warn({ articleId }, "Article saved but not indexed — AI service unavailable");
  }
}

export const knowledgeService = {
  async list(orgId: string) {
    return prisma.knowledgeArticle.findMany({ where: { orgId }, orderBy: { updatedAt: "desc" } });
  },

  async getById(orgId: string, articleId: string) {
    const article = await prisma.knowledgeArticle.findFirst({ where: { id: articleId, orgId } });
    if (!article) throw AppError.notFound("Article not found");
    return article;
  },

  async create(orgId: string, input: CreateArticleInput) {
    const article = await prisma.knowledgeArticle.create({ data: { orgId, ...input } });
    await syncToIndex(orgId, article.id);
    return this.getById(orgId, article.id);
  },

  async update(orgId: string, articleId: string, input: UpdateArticleInput) {
    await this.getById(orgId, articleId);
    await prisma.knowledgeArticle.update({ where: { id: articleId }, data: input });
    await syncToIndex(orgId, articleId);
    return this.getById(orgId, articleId);
  },

  async delete(orgId: string, articleId: string) {
    await this.getById(orgId, articleId);
    await aiClient.bestEffort(() => aiClient.deleteArticle(articleId), "knowledge.delete");
    await prisma.knowledgeArticle.delete({ where: { id: articleId } });
  },
};

"use client";

import { BookOpen, Pencil, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArticleFormDialog } from "@/components/knowledge/article-form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { useArticles, useDeleteArticle } from "@/hooks/use-knowledge";
import { relativeTime } from "@/lib/format";
import type { KnowledgeArticle } from "@support-saas/shared-types";

const STATUS_VARIANT: Record<KnowledgeArticle["status"], "default" | "muted" | "success"> = {
  draft: "muted",
  published: "success",
  archived: "muted",
};

export default function KnowledgePage() {
  const { data: articles, isLoading } = useArticles();
  const deleteArticle = useDeleteArticle();

  return (
    <div>
      <PageHeader
        title="Knowledge base"
        description="Articles published here are indexed for AI-suggested replies."
        actions={<ArticleFormDialog />}
      />

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !articles || articles.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No articles yet"
            description="Publish your first article to give the AI something to ground its suggested replies in."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Indexed</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {articles.map((article: KnowledgeArticle) => (
                <TableRow key={article.id}>
                  <TableCell className="max-w-xs truncate font-medium">{article.title}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[article.status]}>{article.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {article.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="muted" className="font-normal">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {article.vectorIndexed ? (
                      <span className="flex items-center gap-1 text-xs text-ai">
                        <Sparkles className="h-3 w-3" /> Indexed
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{relativeTime(article.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ArticleFormDialog
                        article={article}
                        trigger={
                          <button className="text-muted-foreground hover:text-foreground" aria-label="Edit article">
                            <Pencil className="h-4 w-4" />
                          </button>
                        }
                      />
                      <button
                        className="text-muted-foreground hover:text-danger"
                        aria-label="Delete article"
                        onClick={() =>
                          deleteArticle.mutate(article.id, {
                            onError: () => toast.error("Couldn't delete the article."),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

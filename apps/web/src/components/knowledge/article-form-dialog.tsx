"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateArticle, useUpdateArticle } from "@/hooks/use-knowledge";
import type { KnowledgeArticle } from "@support-saas/shared-types";

const articleSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  content: z.string().min(1, "Content is required"),
  status: z.enum(["draft", "published", "archived"]),
  tagsInput: z.string(),
});
type ArticleValues = z.infer<typeof articleSchema>;

interface ArticleFormDialogProps {
  /** Pass an existing article to switch the dialog into edit mode. */
  article?: KnowledgeArticle;
  /** Custom trigger element (e.g. an icon button for the edit case). Defaults to a "New article" button. */
  trigger?: React.ReactNode;
}

export function ArticleFormDialog({ article, trigger }: ArticleFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isEditMode = Boolean(article);
  const createArticle = useCreateArticle();
  const updateArticle = useUpdateArticle();
  const isPending = createArticle.isPending || updateArticle.isPending;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ArticleValues>({
    resolver: zodResolver(articleSchema),
    defaultValues: article
      ? {
          title: article.title,
          content: article.content,
          status: article.status,
          tagsInput: article.tags.join(", "),
        }
      : { title: "", content: "", status: "published", tagsInput: "" },
  });

  const status = watch("status");

  const onSubmit = (values: ArticleValues) => {
    const tags = values.tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload = { title: values.title, content: values.content, status: values.status, tags };

    const onSuccess = () => {
      toast.success(
        isEditMode
          ? "Article updated."
          : values.status === "published"
            ? "Article published and indexed for AI suggestions."
            : "Article saved as a draft."
      );
      reset();
      setOpen(false);
    };
    const onError = () => toast.error("Couldn't save the article. Try again.");

    if (isEditMode && article) {
      updateArticle.mutate({ id: article.id, ...payload }, { onSuccess, onError });
    } else {
      createArticle.mutate(payload, { onSuccess, onError });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button size="sm">New article</Button>}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit article" : "New knowledge base article"}</DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" {...register("title")} placeholder="How to reset your password" />
              {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="content">Content</Label>
              <Textarea id="content" rows={6} {...register("content")} placeholder="Write the article body..." />
              {errors.content && <p className="text-xs text-danger">{errors.content.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input id="tags" {...register("tagsInput")} placeholder="billing, account" />
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setValue("status", v as ArticleValues["status"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {status === "published" && (
              <p className="text-xs text-muted-foreground">
                Publishing indexes this article into the AI&apos;s knowledge base immediately, making it eligible
                for suggested replies.
              </p>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEditMode ? "Save changes" : "Save article"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useCannedResponses,
  useCreateCannedResponse,
  useDeleteCannedResponse,
  useUpdateCannedResponse,
} from "@/hooks/use-canned-responses";
import { ApiRequestError } from "@/lib/api-client";

export default function CannedResponsesPage() {
  const { data: responses, isLoading } = useCannedResponses();
  const createResponse = useCreateCannedResponse();
  const updateResponse = useUpdateCannedResponse();
  const deleteResponse = useDeleteCannedResponse();

  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const onCreate = () => {
    if (!name.trim() || !body.trim()) {
      toast.error("Give it a name and some body text.");
      return;
    }
    createResponse.mutate(
      { name: name.trim(), body: body.trim() },
      {
        onSuccess: () => {
          setName("");
          setBody("");
          toast.success("Canned response created");
        },
        onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : "Couldn't create it."),
      }
    );
  };

  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <PageHeader
          title="Canned responses"
          description="Reusable reply text agents can insert with one click — also referenceable from automation rules."
        />
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : !responses || responses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No canned responses yet.</p>
        ) : (
          responses.map((cr) => (
            <Card key={cr.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    defaultValue={cr.name}
                    className="h-8 font-medium"
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== cr.name) {
                        updateResponse.mutate({ id: cr.id, name: e.target.value.trim() });
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      deleteResponse.mutate(cr.id, {
                        onSuccess: () => toast.success("Deleted"),
                        onError: () => toast.error("Couldn't delete it."),
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </div>
                <Textarea
                  defaultValue={cr.body}
                  className="min-h-16 text-xs"
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== cr.body) {
                      updateResponse.mutate({ id: cr.id, body: e.target.value.trim() });
                    }
                  }}
                />
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">New canned response</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Refund policy" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Body</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-24"
              placeholder="Thanks for reaching out — here's how our refund policy works..."
            />
          </div>
          <Button onClick={onCreate} disabled={createResponse.isPending}>
            {createResponse.isPending ? "Creating..." : "Create"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

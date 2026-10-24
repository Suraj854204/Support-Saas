"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Catches a crashing page so the sidebar and navigation stay usable. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
        <AlertTriangle className="h-5 w-5 text-danger" />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">This page failed to load</h1>
        <p className="text-sm text-muted-foreground">
          Something went wrong while showing this page. Your data is safe. Try again, and if it keeps happening, reload the app.
        </p>
      </div>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

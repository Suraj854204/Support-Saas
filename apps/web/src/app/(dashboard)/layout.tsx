"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { useAppSelector } from "@/store";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const status = useAppSelector((s) => s.auth.status);
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // While the silent-refresh attempt is still in flight (page just loaded),
  // or once we know the visitor is unauthenticated, render nothing at all —
  // never the shell, never any stat cards, real or fake, behind it.
  if (status === "idle" || status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  return <DashboardShell>{children}</DashboardShell>;
}

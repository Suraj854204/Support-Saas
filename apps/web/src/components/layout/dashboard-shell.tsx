"use client";

import { useRouter } from "next/navigation";

import { CommandPalette } from "@/components/layout/command-palette";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useRealtimeTickets } from "@/hooks/use-realtime-tickets";
import { useAppSelector } from "@/store";

export function DashboardShell({ title, children }: { title?: string; children: React.ReactNode }) {
  const router = useRouter();
  const commandPaletteOpen = useAppSelector((s) => s.ui.commandPaletteOpen);

  useRealtimeTickets();

  useKeyboardShortcut({ key: "d", handler: () => router.push("/dashboard"), enabled: !commandPaletteOpen });
  useKeyboardShortcut({ key: "t", handler: () => router.push("/tickets"), enabled: !commandPaletteOpen });

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}

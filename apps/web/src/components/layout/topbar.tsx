"use client";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { useAppDispatch } from "@/store";
import { setCommandPaletteOpen } from "@/store/slices/ui-slice";

export function Topbar({ title }: { title?: string }) {
  const dispatch = useAppDispatch();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
      <MobileSidebar />

      {title && <h1 className="text-sm font-semibold">{title}</h1>}

      <Button
        variant="outline"
        size="sm"
        className="ml-auto hidden gap-2 text-muted-foreground sm:flex"
        onClick={() => dispatch(setCommandPaletteOpen(true))}
      >
        <Search className="h-3.5 w-3.5" />
        Search...
        <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="ml-auto sm:hidden"
        onClick={() => dispatch(setCommandPaletteOpen(true))}
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
      </Button>

      <ThemeToggle />
      <UserMenu />
    </header>
  );
}

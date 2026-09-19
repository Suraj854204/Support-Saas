"use client";

import { BookOpen, Inbox, LayoutDashboard, Moon, Settings, Sun, Users2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useKeyboardShortcut } from "@/hooks/use-keyboard-shortcut";
import { useAppDispatch, useAppSelector } from "@/store";
import { setCommandPaletteOpen } from "@/store/slices/ui-slice";

export function CommandPalette() {
  const open = useAppSelector((s) => s.ui.commandPaletteOpen);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { setTheme } = useTheme();

  const setOpen = useCallback((next: boolean) => dispatch(setCommandPaletteOpen(next)), [dispatch]);

  useKeyboardShortcut({
    key: "k",
    metaOrCtrl: true,
    handler: () => setOpen(!open),
  });

  const go = (href: string) => {
    router.push(href);
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search tickets, run a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/dashboard")}>
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
            <CommandShortcut>D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/tickets")}>
            <Inbox className="h-4 w-4" />
            Tickets
            <CommandShortcut>T</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/knowledge")}>
            <BookOpen className="h-4 w-4" />
            Knowledge base
          </CommandItem>
          <CommandItem onSelect={() => go("/teams")}>
            <Users2 className="h-4 w-4" />
            Teams
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            <Settings className="h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Appearance">
          <CommandItem
            onSelect={() => {
              setTheme("light");
              setOpen(false);
            }}
          >
            <Sun className="h-4 w-4" />
            Switch to light mode
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme("dark");
              setOpen(false);
            }}
          >
            <Moon className="h-4 w-4" />
            Switch to dark mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

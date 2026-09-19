"use client";

import { motion } from "framer-motion";
import { ChevronsLeft, ChevronsRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { navItems } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store";
import { toggleSidebar } from "@/store/slices/ui-slice";

export function Sidebar() {
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
  const dispatch = useAppDispatch();
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={200}>
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{
          type: "tween",
          duration: 0.18,
          ease: "easeInOut",
        }}
        className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface md:flex"
      >
        {/* Logo / Header */}
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>

          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight">
              Loop
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);

            const link = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  collapsed && "justify-center px-0"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />

                {!collapsed && (
                  <span className="truncate">{item.label}</span>
                )}

                {!collapsed && item.shortcut && (
                  <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {item.shortcut}
                  </kbd>
                )}
              </Link>
            );

            // Expanded sidebar: show normal link
            if (!collapsed) {
              return (
                <div key={item.href}>
                  {link}
                </div>
              );
            }

            // Collapsed sidebar: show tooltip
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>

                <TooltipContent side="right">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Collapse Button */}
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full justify-center gap-2 text-muted-foreground",
              !collapsed && "justify-start"
            )}
            onClick={() => dispatch(toggleSidebar())}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}

            {!collapsed && "Collapse"}
          </Button>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}

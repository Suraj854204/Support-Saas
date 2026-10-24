"use client";

import { motion } from "framer-motion";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SidebarExtras } from "@/components/layout/sidebar-extras";
import { visibleNavGroups, type NavItem } from "@/components/layout/nav-items";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrentUser } from "@/hooks/use-auth";
import { useEscalationSummary } from "@/hooks/use-escalations";
import { useCurrentOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store";
import { toggleSidebar } from "@/store/slices/ui-slice";

export function BrandMark({ className }: { className?: string }) {
  // Two nested arcs: a loop closing on itself.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M10 16a6 6 0 1 1 6 6"
        fill="none"
        strokeWidth="2.6"
        strokeLinecap="round"
        className="stroke-primary-foreground"
      />
      <circle cx="16" cy="22" r="2" className="fill-primary-foreground" />
    </svg>
  );
}

function NavLink({ item, collapsed, active, badge }: { item: NavItem; collapsed: boolean; active: boolean; badge?: { count: number; urgent: boolean } }) {
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        collapsed && "justify-center px-0"
      )}
    >
      {active && <span className="absolute -left-2 top-1.5 h-[calc(100%-12px)] w-[3px] rounded-full bg-primary" />}
      <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {badge && badge.count > 0 && (
        <span
          aria-label={`${badge.count} waiting`}
          className={cn(
            "tabular ml-auto rounded-full px-1.5 text-[10px] font-semibold leading-4",
            badge.urgent ? "bg-danger text-white" : "bg-warning/20 text-warning",
            collapsed && "absolute right-1 top-0.5 ml-0 px-1"
          )}
        >
          {badge.count}
        </span>
      )}
      {!collapsed && item.shortcut && (
        <kbd className="ml-auto rounded border border-border px-1.5 py-px font-mono text-[10px] text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100">
          {item.shortcut}
        </kbd>
      )}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const { data: org } = useCurrentOrg();
  const groups = visibleNavGroups(user?.role);
  const { data: esc } = useEscalationSummary();

  return (
    <TooltipProvider delayDuration={200}>
      <motion.aside
        animate={{ width: collapsed ? 64 : 244 }}
        transition={{ type: "tween", duration: 0.18, ease: "easeInOut" }}
        className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface md:flex"
      >
        <div className={cn("flex h-14 items-center gap-2.5 px-4", collapsed && "justify-center px-0")}>
          <BrandMark className="h-7 w-7 shrink-0" />
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold tracking-tight">Loop</p>
              {org?.name && <p className="truncate text-[11px] text-muted-foreground">{org.name}</p>}
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-3" aria-label="Main">
          {groups.map((group) => (
            <div key={group.label} className="space-y-0.5">
              {!collapsed ? (
                <p className="px-2.5 pb-1 text-[11px] font-medium text-muted-foreground/70">{group.label}</p>
              ) : (
                <div className="mx-3 mb-1 h-px bg-border" />
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  active={pathname.startsWith(item.href)}
                  badge={item.href === "/escalations" && esc ? { count: esc.pending, urgent: esc.overdue > 0 } : undefined}
                />
              ))}
            </div>
          ))}
        </nav>

        <SidebarExtras collapsed={collapsed} />

        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full justify-center gap-2 text-muted-foreground", !collapsed && "justify-start")}
            onClick={() => dispatch(toggleSidebar())}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && "Collapse"}
          </Button>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}

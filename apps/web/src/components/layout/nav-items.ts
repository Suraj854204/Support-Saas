import { BookOpen, Code2, FormInput, Inbox, ShieldAlert, LayoutDashboard, Settings, Sparkles, Users, Users2 } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  shortcut?: string;
  /** Visible to owners/admins only (the pages behind these need manage/audit permissions). */
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, shortcut: "D" },
      { label: "Inbox", href: "/tickets", icon: Inbox, shortcut: "T" },
      { label: "Form messages", href: "/forms", icon: FormInput },
      { label: "Escalations", href: "/escalations", icon: ShieldAlert },
      { label: "Customers", href: "/customers", icon: Users, shortcut: "C" },
    ],
  },
  {
    label: "Knowledge & AI",
    items: [
      { label: "Knowledge base", href: "/knowledge", icon: BookOpen },
      { label: "AI insights", href: "/ai-insights", icon: Sparkles, adminOnly: true },
    ],
  },
  {
    label: "Manage",
    items: [
      { label: "Teams", href: "/teams", icon: Users2 },
      { label: "Developers", href: "/developers", icon: Code2, adminOnly: true },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

/** Flat list, kept for anything that just needs every destination. */
export const navItems: NavItem[] = navGroups.flatMap((g) => g.items);

/** Groups filtered for the viewer's role; empty groups are dropped. */
export function visibleNavGroups(role: string | undefined): NavGroup[] {
  const isAdmin = role === "owner" || role === "admin";
  return navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || isAdmin) }))
    .filter((g) => g.items.length > 0);
}

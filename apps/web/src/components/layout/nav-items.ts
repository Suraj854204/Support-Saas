import { BookOpen, Inbox, LayoutDashboard, Settings, Users2 } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  shortcut?: string;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, shortcut: "D" },
  { label: "Tickets", href: "/tickets", icon: Inbox, shortcut: "T" },
  { label: "Knowledge base", href: "/knowledge", icon: BookOpen },
  { label: "Teams", href: "/teams", icon: Users2 },
  { label: "Settings", href: "/settings", icon: Settings },
];

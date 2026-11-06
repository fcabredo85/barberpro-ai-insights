import { LayoutDashboard, PlusCircle, Receipt, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Primary navigation for authenticated workspace pages. */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sales/new", label: "New sale", icon: PlusCircle },
  { href: "/sales", label: "Sales", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings },
];

/**
 * Returns true when `href` is the best match for `pathname`.
 * `/sales` must not light up while on `/sales/new`, so the longest matching
 * nav href wins.
 */
export function isActiveNav(pathname: string, href: string): boolean {
  const matches = NAV_ITEMS.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  if (matches.length === 0) return false;
  const best = matches.reduce((a, b) => (b.href.length > a.href.length ? b : a));
  return best.href === href;
}

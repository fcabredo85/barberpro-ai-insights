import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathnameMock = vi.hoisted(() => ({ current: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock.current,
}));

import { AppSidebar } from "@/components/layout/app-sidebar";
import { NAV_ITEMS, isActiveNav } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";
import HomePage from "@/app/page";
import LoginPage from "@/app/login/page";

describe("smoke", () => {
  it("merges conflicting Tailwind classes", () => {
    expect(cn("px-2 py-1", false && "hidden", "px-4")).toBe("py-1 px-4");
  });

  it("exposes every workspace route in the navigation", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/dashboard",
      "/sales/new",
      "/sales",
      "/settings",
    ]);
  });

  it("highlights only the most specific nav item", () => {
    expect(isActiveNav("/sales/new", "/sales/new")).toBe(true);
    expect(isActiveNav("/sales/new", "/sales")).toBe(false);
    expect(isActiveNav("/sales", "/sales")).toBe(true);
    expect(isActiveNav("/settings", "/dashboard")).toBe(false);
    expect(isActiveNav("/login", "/dashboard")).toBe(false);
  });

  it("renders the sidebar with the current page marked", () => {
    pathnameMock.current = "/sales";
    render(<AppSidebar />);

    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sales" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "New sale" })).not.toHaveAttribute("aria-current");
  });

  it("renders the landing page with a link to login", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1, name: "BarberPro AI Insights" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("renders the login placeholder without enabling submission", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});

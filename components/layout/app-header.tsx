import Link from "next/link";

import { Button } from "@/components/ui/button";
import { MobileNav } from "./mobile-nav";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <MobileNav />
      <div className="min-w-0 flex-1">
        {/* Workspace name will come from the authorized membership in a later milestone. */}
        <p className="truncate text-sm font-medium">My Barbershop</p>
      </div>
      <Button asChild size="sm">
        <Link href="/sales/new">New sale</Link>
      </Button>
    </header>
  );
}

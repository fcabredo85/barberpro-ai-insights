import Link from "next/link";
import { LogOut } from "lucide-react";

import { signOutAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { MobileNav } from "./mobile-nav";

interface AppHeaderProps {
  workspaceName: string;
  userEmail: string;
}

export function AppHeader({ workspaceName, userEmail }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <MobileNav />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{workspaceName}</p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">{userEmail}</p>
      </div>
      <Button asChild size="sm" className="hidden sm:inline-flex">
        <Link href="/sales/new">New sale</Link>
      </Button>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
          <LogOut />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </form>
    </header>
  );
}

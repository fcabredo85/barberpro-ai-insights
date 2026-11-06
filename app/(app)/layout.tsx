import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { requireWorkspace } from "@/lib/auth/session";

/**
 * Shell for workspace pages. Verifies the session and membership on the server
 * (the proxy redirect is only an optimistic first check). Pages that read
 * tenant data must still call requireWorkspace() themselves, because layouts
 * and pages render in parallel; RLS remains the final boundary.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, workspace } = await requireWorkspace();

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader workspaceName={workspace.name} userEmail={user.email ?? ""} />
        <main className="flex-1 space-y-6 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

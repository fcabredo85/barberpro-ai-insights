import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/auth/actions";
import { WorkspaceForm } from "@/components/auth/workspace-form";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentWorkspace, requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (await getCurrentWorkspace()) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <Brand />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Name your barbershop</CardTitle>
          <CardDescription>
            This creates your private workspace. Only you can see its data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceForm />
        </CardContent>
      </Card>
      <form action={signOutAction} className="text-center text-sm text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{user.email}</span>.{" "}
        <Button type="submit" variant="link" className="h-auto p-0">
          Sign out
        </Button>
      </form>
    </main>
  );
}

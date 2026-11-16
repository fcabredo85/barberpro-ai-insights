import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/password-forms";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

/**
 * Reached from the password-reset email via /auth/callback, which signs the
 * user in with a recovery session. Without a session the link was invalid,
 * expired, or opened in a different browser.
 */
export default async function ResetPasswordPage() {
  const user = await getCurrentUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <Brand />
      <Card className="w-full max-w-sm">
        {user ? (
          <>
            <CardHeader>
              <CardTitle>Choose a new password</CardTitle>
              <CardDescription>{user.email ? `For ${user.email}.` : "For your account."}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResetPasswordForm />
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Link invalid or expired</CardTitle>
              <CardDescription>
                Reset links work once, for 1 hour, in the same browser where you requested them. Request a new link to
                continue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/forgot-password">Request a new link</Link>
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}

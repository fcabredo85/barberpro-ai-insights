import type { Metadata } from "next";
import Link from "next/link";

import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <Brand />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Sign in isn&apos;t connected yet. Supabase Auth comes in a later milestone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" aria-describedby="login-status">
            <fieldset disabled className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <input id="email" name="email" type="email" autoComplete="email" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className={inputClass}
                />
              </div>
              <Button type="submit" className="w-full">
                Sign in
              </Button>
            </fieldset>
            <p id="login-status" className="text-center text-xs text-muted-foreground">
              Placeholder only: no credentials are sent.
            </p>
          </form>
        </CardContent>
      </Card>
      <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to home
      </Link>
    </main>
  );
}

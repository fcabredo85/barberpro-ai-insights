import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm, type AuthMode } from "@/components/auth/auth-form";
import { Brand } from "@/components/layout/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeRedirectPath } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Sign in" };

const CALLBACK_ERRORS: Record<string, string> = {
  confirmation_failed: "That confirmation link is invalid or has expired. Please sign in or sign up again.",
};

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const mode: AuthMode = params.mode === "signup" ? "signup" : "signin";
  const next = typeof params.next === "string" ? safeRedirectPath(params.next) : undefined;
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const isSignUp = mode === "signup";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <Brand />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{isSignUp ? "Create your owner account" : "Sign in"}</CardTitle>
          <CardDescription>
            {isSignUp
              ? "You will name your barbershop workspace next."
              : "Access your barbershop dashboard."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuthForm
            key={mode}
            mode={mode}
            next={next}
            initialMessage={errorKey ? CALLBACK_ERRORS[errorKey] : undefined}
          />
        </CardContent>
      </Card>
      <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to home
      </Link>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { Brand } from "@/components/layout/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-12">
      <Brand />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>Enter your account email and we&apos;ll send you a link to choose a new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
      <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        Back to home
      </Link>
    </main>
  );
}

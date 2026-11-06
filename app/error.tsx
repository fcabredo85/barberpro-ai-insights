"use client"; // Error boundaries must be Client Components

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorPageProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/**
 * Safe fallback for unexpected server errors. Shows no internal details; the
 * digest lets a developer match the entry in the server logs.
 */
export default function ErrorPage({ error, retry }: ErrorPageProps) {
  const digest = error instanceof Error ? error.digest : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            We couldn&apos;t load this page. Your data is safe. Please try again in a moment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => retry()}>Try again</Button>
            <Button asChild variant="outline">
              <Link href="/">Go to home</Link>
            </Button>
          </div>
          {digest ? <p className="text-xs text-muted-foreground">Reference: {digest}</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}

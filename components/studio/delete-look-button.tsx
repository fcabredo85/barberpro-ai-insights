"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Deletes a saved look (photos, record, and storage consent) after confirmation. */
export function DeleteLookButton({ lookId, customerLabel }: { lookId: string; customerLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`Delete ${customerLabel}'s saved look and both photos? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/looks/${lookId}`, { method: "DELETE" });
      const body = await res.json().catch(() => null);
      if (res.ok || res.status === 404) {
        router.refresh();
      } else {
        setError(body?.error?.message ?? "Couldn't delete the look. Please try again.");
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" size="sm" onClick={remove} disabled={busy} aria-label={`Delete ${customerLabel}'s saved look`}>
        {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Delete
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

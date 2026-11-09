import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { DeleteLookButton } from "@/components/studio/delete-look-button";
import { Button } from "@/components/ui/button";
import { requireWorkspace } from "@/lib/auth/session";
import { listSavedLooks, purgeExpiredLooks } from "@/lib/db/looks";
import { createSupabaseServerClient } from "@/lib/db/supabase/server";
import { SIMULATION_LABEL } from "@/lib/tryon/consent";

export const metadata: Metadata = { title: "Saved looks" };
// Signed URLs expire; never cache this page.
export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });

export default async function SavedLooksPage() {
  const { workspace } = await requireWorkspace();
  const supabase = await createSupabaseServerClient();
  // Retention: remove this shop's expired looks before listing.
  await purgeExpiredLooks(supabase, workspace.barbershopId);
  const looks = await listSavedLooks(supabase, workspace.barbershopId);

  return (
    <>
      <PageHeader
        title="Saved looks"
        description={`Private to ${workspace.name}. Looks are deleted automatically after their keep-until date.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/studio">
              <ArrowLeft />
              Back to studio
            </Link>
          </Button>
        }
      />

      {looks.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          No saved looks yet. Generate a preview in the studio and choose Save Look.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {looks.map((look) => (
            <li key={look.id} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    [look.originalUrl, `${look.customerLabel}: original photo`, "Original"],
                    [look.previewUrl, `${look.customerLabel}: ${SIMULATION_LABEL} of a ${look.styleName}`, SIMULATION_LABEL],
                  ] as const
                ).map(([url, alt, caption]) => (
                  <figure key={caption} className="space-y-1">
                    {url ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimizable */
                      <img src={url} alt={alt} className="aspect-[4/5] w-full rounded-md border object-cover" />
                    ) : (
                      <div className="flex aspect-[4/5] items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                        Image unavailable
                      </div>
                    )}
                    <figcaption className="text-center text-xs text-muted-foreground">{caption}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="min-w-0 text-sm">
                <p className="truncate font-semibold">{look.customerLabel}</p>
                <p>{look.styleName}</p>
                {look.title ? <p className="text-muted-foreground">{look.title}</p> : null}
                <p className="text-xs text-muted-foreground">
                  Saved {dateFormat.format(new Date(look.createdAt))} · keep until {dateFormat.format(new Date(look.deleteAfter))}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap items-start gap-2">
                <Button asChild size="sm">
                  <Link href={`/appointments/new?lookId=${look.id}`}>Book this style</Link>
                </Button>
                <DeleteLookButton lookId={look.id} customerLabel={look.customerLabel} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

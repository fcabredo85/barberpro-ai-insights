import type { Metadata } from "next";
import Link from "next/link";
import { Images } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { VirtualStudio } from "@/components/studio/virtual-studio";
import { requireWorkspace } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Virtual Try-On Studio" };

export default async function StudioPage() {
  // Same server-side guard as other workspace pages; the API checks again.
  await requireWorkspace();

  return (
    <>
      <PageHeader
        title="Virtual Try-On Studio"
        description="Preview a haircut on a selfie before the cut. Previews are AI simulations, not guaranteed results."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/studio/looks">
              <Images />
              Saved looks
            </Link>
          </Button>
        }
      />
      <VirtualStudio />
    </>
  );
}

import Link from "next/link";
import { Scissors } from "lucide-react";

export function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Scissors className="h-4 w-4" aria-hidden="true" />
      </span>
      <span>BarberPro AI</span>
    </Link>
  );
}

import { Brand } from "./brand";
import { NavLinks } from "./nav-links";

/** Fixed sidebar shown from the `md` breakpoint up. */
export function AppSidebar() {
  return (
    <aside className="hidden w-60 print:hidden shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <Brand />
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <NavLinks />
      </div>
      <p className="border-t p-4 text-xs text-muted-foreground">
        Records external cash/GCash payments only.
      </p>
    </aside>
  );
}

import { Card, CardContent, CardHeader } from "@/components/ui/card";

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

/** First-load placeholder only; filter changes keep the previous view (dimmed) instead. */
export default function DashboardLoading() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="space-y-6">
      <span className="sr-only" role="status">
        Loading dashboard…
      </span>
      <div className="space-y-2">
        <Block className="h-7 w-40" />
        <Block className="h-4 w-72 max-w-full" />
      </div>
      <Block className="h-10 w-full max-w-md" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}>
            <CardHeader className="p-4 pb-1">
              <Block className="h-4 w-24" />
            </CardHeader>
            <CardContent className="space-y-2 p-4 pt-0">
              <Block className="h-7 w-28" />
              <Block className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <Block className="h-60 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Block className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

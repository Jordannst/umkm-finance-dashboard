import { Skeleton } from "@/components/ui/skeleton";

export default function ReceivablesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 pb-2 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-44" />
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

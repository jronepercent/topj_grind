import { Skeleton } from "@/components/ui/misc";

export default function StudioLoading() {
  return (
    <div aria-busy="true" aria-label="กำลังโหลด">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-3 h-4 w-72" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[120px] rounded-[16px]" />
        ))}
      </div>
      <Skeleton className="mt-6 h-[260px] rounded-[16px]" />
      <div className="mt-6 space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 rounded-[12px]" />
        ))}
      </div>
    </div>
  );
}

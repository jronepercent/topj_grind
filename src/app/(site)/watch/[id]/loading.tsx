export default function Loading() {
  return (
    <div className="mx-auto grid max-w-[1800px] gap-6 sm:px-6 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:px-8">
      <div>
        <div className="skeleton aspect-video sm:rounded-[12px]" />
        <div className="space-y-3 px-4 pt-4 sm:px-0">
          <div className="skeleton h-6 w-3/4 rounded-md" />
          <div className="skeleton h-10 w-1/2 rounded-full" />
          <div className="skeleton h-24 rounded-[16px]" />
        </div>
      </div>
      <div className="space-y-3 px-4 sm:px-0">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex gap-3">
            <div className="skeleton aspect-video w-[168px] shrink-0 rounded-[12px]" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="skeleton h-3.5 rounded" />
              <div className="skeleton h-3 w-2/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

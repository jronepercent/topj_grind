export default function Loading() {
  return (
    <div className="mx-auto max-w-[820px]" aria-hidden>
      <div className="skeleton h-8 w-40 rounded" />
      <div className="mt-8 divide-y divide-border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-4 py-6 first:pt-0 sm:flex-row">
            <div className="skeleton aspect-video rounded-[12px] sm:w-60 sm:shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="skeleton h-5 w-3/4 rounded" />
              <div className="skeleton h-3 w-full rounded" />
              <div className="skeleton h-3 w-2/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

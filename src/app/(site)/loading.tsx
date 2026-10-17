import { CardSkeleton } from "@/components/cards/cards";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="skeleton h-[40vh] rounded-[16px]" />
      <div className="mt-8 grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

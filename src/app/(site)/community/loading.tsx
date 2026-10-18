import { PostFeedSkeleton } from "@/components/community/feed";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[600px]">
      <PostFeedSkeleton />
    </div>
  );
}

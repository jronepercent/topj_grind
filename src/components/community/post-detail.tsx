"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PostCard } from "./post-card";
import { PostComments } from "./post-comments";
import type { PostCommentView, PostView } from "@/lib/community";

/** /community/posts/[id]: the post (full caption) with its comment thread. */
export function PostDetail({ initial, comments }: { initial: PostView; comments: { items: PostCommentView[]; total: number; hasMore: boolean } }) {
  const router = useRouter();
  const [post, setPost] = React.useState(initial);
  return (
    <div className="space-y-8">
      <PostCard
        post={post}
        detail
        priority
        onChange={(p) => {
          if (p === null) router.replace("/community");
          else setPost((x) => ({ ...x, ...p }));
        }}
      />
      <PostComments postId={post.id} initial={comments} count={post.comment_count} lockedText="คอมเมนต์และตอบกลับได้เฉพาะสมาชิก" />
    </div>
  );
}

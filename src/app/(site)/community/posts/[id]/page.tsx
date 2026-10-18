import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { getPost, listPostComments } from "@/lib/server/community";
import { PostDetail } from "@/components/community/post-detail";

export const dynamic = "force-dynamic";

// Community posts are for signed-in people only, so the page carries no social preview and is not indexed.
export const metadata: Metadata = { title: "โพสต์ในชุมชน", robots: { index: false, follow: false } };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  const post = await getPost(id, viewer);
  if (!post) notFound();
  const comments = await listPostComments(post.id, 0);
  return (
    <div className="mx-auto max-w-[600px]">
      <PostDetail initial={post} comments={comments} />
    </div>
  );
}

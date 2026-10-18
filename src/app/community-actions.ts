"use server";

import { revalidatePath } from "next/cache";
import { HttpError, getViewer, requireAdmin, requireUser } from "@/lib/server/auth";
import { limit, run } from "@/lib/server/action-utils";
import { signImageUpload } from "@/lib/server/images";
import {
  createCommunityPost,
  createPostComment,
  deletePost,
  deletePostComment,
  editPostComment,
  listFeed,
  listPostComments,
  moderatePost,
  moderatePostComment,
  togglePostLike,
} from "@/lib/server/community";
import { POST_LIMITS } from "@/lib/community";

/** Server Actions for ชุมชน. Reads and writes go through userDb inside lib/server/community.ts, so RLS is the gate. */

export async function loadFeedAction(cursor: string | null) {
  return run(async () => listFeed(await getViewer(), cursor));
}

/** Members get one signed Storage URL per image; the browser PUTs the (already resized) file straight to it. */
export async function signCommunityUploadsAction(contentTypes: string[]) {
  return run(async () => {
    const v = await requireUser();
    if (!v.is_member) throw new HttpError(403, "โพสต์รูปได้เฉพาะสมาชิก");
    if (!Array.isArray(contentTypes) || contentTypes.length < 1 || contentTypes.length > POST_LIMITS.images) {
      throw new HttpError(400, `แนบรูปได้ไม่เกิน ${POST_LIMITS.images} รูป`);
    }
    limit(`community-sign:${v.id}`, 40, 10 * 60_000);
    return await Promise.all(contentTypes.map((t) => signImageUpload(`community/${v.id}`, String(t))));
  });
}

export async function createPostAction(body: string, images: string[]) {
  return run(async () => {
    const v = await requireUser();
    limit(`community-post:${v.id}`, 6, 10 * 60_000);
    const post = await createCommunityPost(v, { body: String(body ?? ""), images: Array.isArray(images) ? images.map(String) : [] });
    revalidatePath("/community");
    return post;
  });
}

export async function togglePostLikeAction(postId: string, force?: boolean) {
  return run(async () => {
    const v = await requireUser();
    limit(`post-like:${v.id}`, 60, 60_000);
    return await togglePostLike(v, postId, force);
  });
}

export async function deletePostAction(postId: string) {
  return run(async () => {
    await deletePost(await requireUser(), postId);
    revalidatePath("/community");
    revalidatePath("/studio/community");
  });
}

export async function moderatePostAction(postId: string, action: "pin" | "unpin" | "hide" | "unhide") {
  return run(async () => {
    await moderatePost(await requireAdmin(), postId, action);
    revalidatePath("/community");
    revalidatePath("/studio/community");
  });
}

// ───────── Comments (posts + articles) ─────────
export async function loadPostCommentsAction(postId: string, offset: number) {
  return run(async () => listPostComments(postId, Math.max(0, Math.floor(offset) || 0)));
}

export async function postCommentOnPostAction(postId: string, body: string, parentId: string | null) {
  return run(async () => {
    const v = await requireUser();
    limit(`comment:${v.id}`, 5, 60_000);
    return await createPostComment(v, postId, String(body ?? ""), parentId);
  });
}

export async function editPostCommentAction(id: string, body: string) {
  return run(async () => editPostComment(await requireUser(), id, String(body ?? "")));
}

export async function deletePostCommentAction(id: string) {
  return run(async () => {
    await deletePostComment(await requireUser(), id);
    revalidatePath("/studio/community");
  });
}

export async function moderatePostCommentAction(id: string, hide: boolean) {
  return run(async () => {
    await moderatePostComment(await requireAdmin(), id, hide);
    revalidatePath("/studio/community");
  });
}

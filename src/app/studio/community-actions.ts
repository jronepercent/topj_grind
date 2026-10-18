"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/server/auth";
import { limit, run } from "@/lib/server/action-utils";
import { signImageUpload } from "@/lib/server/images";
import { deleteArticle, saveArticle, setArticlePinned, type ArticleInput } from "@/lib/server/community";

/** Studio-only Server Actions for บทความ. Every one starts with requireAdmin(). */

export async function signArticleImageAction(contentType: string) {
  return run(async () => {
    const v = await requireAdmin();
    limit(`article-image:${v.id}`, 30, 60_000);
    return await signImageUpload("articles", String(contentType));
  });
}

export async function saveArticleAction(input: ArticleInput) {
  return run(async () => {
    const v = await requireAdmin();
    const saved = await saveArticle(v, {
      id: input.id,
      title: String(input.title ?? ""),
      excerpt: String(input.excerpt ?? ""),
      body: String(input.body ?? ""),
      cover_url: input.cover_url ? String(input.cover_url) : null,
      visibility: input.visibility === "members" ? "members" : "public",
      status: input.status === "published" ? "published" : "draft",
      published_at: input.published_at ? String(input.published_at) : null,
    });
    revalidatePath("/community/articles");
    revalidatePath(`/community/articles/${saved.id}`);
    revalidatePath("/studio/articles");
    return saved;
  });
}

export async function deleteArticleAction(id: string) {
  return run(async () => {
    await deleteArticle(await requireAdmin(), id);
    revalidatePath("/community/articles");
    revalidatePath("/studio/articles");
  });
}

export async function pinArticleAction(id: string, pinned: boolean) {
  return run(async () => {
    await setArticlePinned(await requireAdmin(), id, pinned);
    revalidatePath("/community/articles");
    revalidatePath("/studio/articles");
  });
}

-- 0012 — Let members soft-delete their own video comments.
-- deleteComment() runs `update comments set deleted_at = now() where id = …` as the signed-in member (RLS applies).
-- Because that statement filters on a column, Postgres also checks the NEW row against the SELECT policy, and
-- comments_read (0001) only shows rows with deleted_at is null and not is_hidden. So the freshly soft-deleted row
-- failed the check and a member's delete was rejected (42501, "ลบไม่ได้"); only admins (admin_all) could delete.
-- Same fix as post_comments_read_own in 0011: authors can always see their own rows.
-- The site itself reads comments with the service role and filters deleted/hidden rows in code, so this does not
-- make deleted or hidden comments appear anywhere. Idempotent: safe to run twice.

drop policy if exists comments_read_own on public.comments;
create policy comments_read_own on public.comments for select to authenticated using (user_id = auth.uid());

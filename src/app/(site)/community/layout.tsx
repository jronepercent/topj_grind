import { CommunityTabs } from "@/components/community/community-tabs";

/** Shared by /community and /community/articles: the ชุมชน | บทความ toggle stays at the top. */
export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CommunityTabs />
      <div className="tg-page mx-auto w-full px-4 py-5 sm:py-8">{children}</div>
    </>
  );
}

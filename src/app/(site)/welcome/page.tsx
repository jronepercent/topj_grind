import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/server/auth";
import { onboardingState, pathFor } from "@/lib/server/onboarding";
import { progressMap } from "@/lib/server/queries";
import { safeNext } from "@/app/(auth)/_components/safe-next";
import { WelcomeClient, type PathClip } from "./welcome-client";

export const metadata: Metadata = {
  title: "เริ่มต้นที่นี่",
  robots: { index: false, follow: false },
};

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const viewer = await getViewer();
  if (!viewer) {
    const back = next === "/" ? "/welcome" : `/welcome?next=${encodeURIComponent(next)}`;
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  const state = await onboardingState(viewer.id);
  const clips = state.stage ? await pathFor(state.stage) : [];
  const progress = await progressMap(viewer.id, clips.map((c) => c.id));
  const path: PathClip[] = clips.map((c) => ({
    id: c.id,
    type: c.type,
    title: c.title,
    thumbnail_url: c.thumbnail_url,
    duration_sec: c.duration_sec,
    members_only: c.visibility === "members",
    completed: !!progress[c.id]?.completed,
  }));

  return <WelcomeClient stage={state.stage} onboarded={state.onboarded} path={path} next={next} isMember={viewer.is_member} />;
}

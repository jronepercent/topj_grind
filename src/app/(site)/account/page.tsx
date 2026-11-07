import { getViewer } from "@/lib/server/auth";
import { EmailCard, LogoutCard, ProfileCard } from "./_components/account-view";

export default async function AccountProfilePage() {
  const viewer = await getViewer();
  if (!viewer) return null; // the layout shows the sign-in prompt
  return (
    <>
      <ProfileCard viewer={viewer} />
      <EmailCard email={viewer.email} />
      <LogoutCard />
    </>
  );
}

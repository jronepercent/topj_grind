import { permanentRedirect } from "next/navigation";

// Shorts were replaced by ชุมชน. Old links and bookmarks go there.
export default function Page() {
  permanentRedirect("/community");
}

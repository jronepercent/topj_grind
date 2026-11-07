import { cache } from "react";
import { studioCommunity } from "@/lib/server/community";

/** Posts + comments for Studio → ชุมชน; shared by the layout (counts) and the pages (cached per request). */
export const communityData = cache(studioCommunity);

import { cache } from "react";
import { studioContentRows } from "../_lib/data";

/** All content rows incl. trash; shared by the tabs layout (counts) and both pages (cached per request). */
export const contentRows = cache(studioContentRows);

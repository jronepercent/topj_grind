/** Only same-origin relative paths are allowed as redirect targets. */
export function safeNext(next: string | string[] | undefined | null, fallback = "/") {
  const n = Array.isArray(next) ? next[0] : next;
  return typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : fallback;
}

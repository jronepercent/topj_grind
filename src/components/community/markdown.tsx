import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Article body renderer. Raw HTML in the Markdown is NOT rendered (react-markdown's default),
 * links get rel="noopener noreferrer nofollow", and javascript: URLs are stripped by urlTransform.
 * Safe to use on the server and in the Studio preview.
 */
const components: Components = {
  h1: ({ children }) => <h2 className="mt-12 text-[28px] font-semibold leading-[1.4] tracking-[-0.01em] first:mt-0">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-12 text-[24px] font-semibold leading-[1.4] tracking-[-0.01em] first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-9 text-[20px] font-semibold leading-[1.45]">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-7 text-[17px] font-semibold leading-[1.5]">{children}</h4>,
  p: ({ children }) => <p className="mt-5 first:mt-0">{children}</p>,
  a: ({ href, children }) => {
    const external = !!href && /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
        className="text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent"
      >
        {children}
      </a>
    );
  },
  ul: ({ children }) => <ul className="mt-5 list-disc space-y-2 pl-6 marker:text-text-2">{children}</ul>,
  ol: ({ children }) => <ol className="mt-5 list-decimal space-y-2 pl-6 marker:text-text-2">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mt-6 rounded-r-[12px] border-l-[3px] border-accent bg-surface px-5 py-3 text-text [&>p]:mt-3 [&>p:first-child]:mt-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-10 border-border" />,
  strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
  code: ({ className, children }) =>
    className ? (
      <code className={cn(className, "font-mono text-[14px]")}>{children}</code>
    ) : (
      <code className="rounded-[6px] bg-hover px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>
    ),
  pre: ({ children }) => <pre className="mt-6 overflow-x-auto rounded-[12px] border border-border bg-surface p-4 leading-6">{children}</pre>,
  table: ({ children }) => (
    <div className="mt-6 overflow-x-auto rounded-[12px] border border-border">
      <table className="w-full min-w-[480px] border-collapse text-[15px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border bg-surface px-4 py-2.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-4 py-2.5 align-top last:border-b-0">{children}</td>,
  img: ({ src, alt }) =>
    typeof src === "string" && /^https:\/\//i.test(src) ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt ?? ""} loading="lazy" className="mt-6 h-auto max-w-full rounded-[12px]" />
    ) : null,
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-[17px] leading-[1.9] text-text/90 [overflow-wrap:anywhere]", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

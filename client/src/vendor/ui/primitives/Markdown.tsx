import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// react-markdown (without the rehype-raw plugin, which this project doesn't
// use) never renders raw HTML from the source — <script>, <img onerror>, etc.
// are escaped as literal text. But it does pass link hrefs straight through
// to a real <a> tag, and doesn't strip dangerous URL schemes on its own — a
// javascript: link would still execute on click. Since this renders
// untrusted content (imported skill bodies), only allow the schemes an
// inline link legitimately needs.
function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  // A base is always supplied so relative/fragment links (e.g. "docs/x.md",
  // "#section") resolve rather than throwing — URL() also normalizes case
  // and leading whitespace, so "  JavaScript:..." can't sneak past this.
  try {
    const { protocol } = new URL(href, "https://placeholder.invalid");
    return protocol === "http:" || protocol === "https:" || protocol === "mailto:" ? href : undefined;
  } catch {
    return undefined;
  }
}

/** Markdown renderer (replaces prototype mdLite). Inline + GFM. */
export function Markdown({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <div className="dd-md" style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => (
            <code
              className="mono"
              style={{
                fontSize: "0.92em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--bg-hover)",
                color: "var(--accent-text)",
              }}
            >
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a href={safeHref(href)} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

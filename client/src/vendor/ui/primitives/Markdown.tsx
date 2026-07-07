import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

// This renders untrusted content (imported/extracted skill bodies), so HTML is
// sanitized at the AST level via rehype-sanitize (default GitHub allowlist) —
// an EXPLICIT, enforced boundary rather than relying on the incidental fact
// that rehype-raw isn't installed. If a future change ever adds rehype-raw to
// render raw HTML, sanitize still strips <script>/<img onerror>/event handlers
// and unsafe URL schemes instead of executing them.
//
// safeHref is kept as a second, independent layer on link hrefs: it also
// covers relative/fragment resolution and normalizes leading whitespace/case
// so "  JavaScript:..." can't sneak past. Only allow the schemes an inline
// link legitimately needs.
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
        rehypePlugins={[rehypeSanitize]}
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

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Markdown } from "./Markdown";

afterEach(cleanup);

/**
 * Markdown renders untrusted content (imported skill bodies). Two distinct
 * safety properties matter here:
 *  - react-markdown (no rehype-raw) never renders raw HTML from the source —
 *    covered by the "does not render" tests below.
 *  - Link hrefs are NOT sanitized by react-markdown itself, so a
 *    javascript:/data: scheme link would still execute on click — that's
 *    handled by this component's own safeHref, covered separately.
 */
describe("Markdown — raw HTML is never rendered (no rehype-raw plugin)", () => {
  it("renders a <script> tag in the source as literal escaped text, not an executable script", () => {
    render(<Markdown>{"before <script>window.__pwned = true</script> after"}</Markdown>);
    expect(document.querySelector("script")).not.toBeInTheDocument();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it("renders an <img onerror=...> tag as literal text, not a live element with the handler attached", () => {
    render(<Markdown>{'<img src=x onerror="window.__pwned = true">'}</Markdown>);
    const img = document.querySelector("img");
    expect(img).not.toBeInTheDocument();
  });
});

describe("Markdown — link href sanitization", () => {
  it("allows http(s) and mailto links through unchanged", () => {
    render(<Markdown>{"[go](https://example.com/page)"}</Markdown>);
    expect(screen.getByRole("link", { name: "go" })).toHaveAttribute(
      "href",
      "https://example.com/page",
    );
  });

  it("allows relative and fragment links through unchanged", () => {
    render(<Markdown>{"[anchor](#section)"}</Markdown>);
    expect(screen.getByRole("link", { name: "anchor" })).toHaveAttribute("href", "#section");
  });

  it("strips javascript: links (would otherwise execute on click)", () => {
    render(<Markdown>{"[click me](javascript:alert(document.cookie))"}</Markdown>);
    const link = screen.getByText("click me");
    expect(link).not.toHaveAttribute("href");
  });

  it("strips data: links", () => {
    // base64 of: <script>alert(1)</script>
    render(
      <Markdown>
        {"[click me](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)"}
      </Markdown>,
    );
    const link = screen.getByText("click me");
    expect(link).not.toHaveAttribute("href");
  });

  it("strips a javascript: link regardless of case", () => {
    render(<Markdown>{"[click me](JavaScript:alert(1))"}</Markdown>);
    const link = screen.getByText("click me");
    expect(link).not.toHaveAttribute("href");
  });
});

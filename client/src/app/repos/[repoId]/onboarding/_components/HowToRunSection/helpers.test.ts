import { describe, it, expect } from "vitest";
import { parseHowToRunSteps } from "./helpers";

describe("parseHowToRunSteps", () => {
  it("returns no steps for an empty body", () => {
    expect(parseHowToRunSteps("")).toEqual([]);
    expect(parseHowToRunSteps("   \n  ")).toEqual([]);
  });

  it("splits prose and fenced code blocks into separate steps, in order", () => {
    const body = [
      "First, install dependencies:",
      "",
      "```bash",
      "pnpm install",
      "```",
      "",
      "Then start the dev server:",
      "",
      "```bash",
      "pnpm dev",
      "```",
    ].join("\n");

    const steps = parseHowToRunSteps(body);
    expect(steps).toEqual([
      { type: "text", content: "First, install dependencies:" },
      { type: "code", content: "pnpm install", lang: "bash" },
      { type: "text", content: "Then start the dev server:" },
      { type: "code", content: "pnpm dev", lang: "bash" },
    ]);
  });

  it("handles a body with no fenced code blocks as a single text step", () => {
    expect(parseHowToRunSteps("Just read the README.")).toEqual([
      { type: "text", content: "Just read the README." },
    ]);
  });
});

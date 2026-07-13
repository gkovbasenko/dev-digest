import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildZip, initialWizardInput } from "./helpers";

describe("buildZip (AC-11 'Copy files as a zip')", () => {
  it("produces a real .zip archive preserving each file's full path and contents", () => {
    const files = [
      { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: Security Reviewer\n" },
      { path: ".devdigest/skills/repo-conventions.md", contents: "# Repo conventions\n" },
      { path: ".devdigest/memory.jsonl", contents: "" },
      { path: ".github/workflows/devdigest-review.yml", contents: "name: DevDigest Review\n" },
    ];

    const zipped = buildZip(files);
    // A real zip starts with the local-file-header signature "PK\x03\x04".
    expect(zipped[0]).toBe(0x50);
    expect(zipped[1]).toBe(0x4b);

    const unzipped = unzipSync(zipped);
    const unzippedPaths = Object.keys(unzipped).sort();
    expect(unzippedPaths).toEqual(files.map((f) => f.path).sort());

    for (const f of files) {
      expect(strFromU8(unzipped[f.path]!)).toBe(f.contents);
    }
  });

  it("keeps directory structure distinct for files that share a basename", () => {
    // Two files that would collide if paths were flattened to basenames.
    const files = [
      { path: ".devdigest/skills/index.md", contents: "skill a" },
      { path: ".github/workflows/index.md", contents: "skill b" },
    ];
    const unzipped = unzipSync(buildZip(files));
    expect(strFromU8(unzipped[".devdigest/skills/index.md"]!)).toBe("skill a");
    expect(strFromU8(unzipped[".github/workflows/index.md"]!)).toBe("skill b");
  });
});

describe("initialWizardInput", () => {
  it("defaults target to gha and post_as to github_review", () => {
    const input = initialWizardInput();
    expect(input.target).toBe("gha");
    expect(input.post_as).toBe("github_review");
    expect(input.repo).toBe("");
  });
});

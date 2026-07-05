import { describe, it, expect } from "vitest";
import { evidenceHref } from "./helpers";

describe("evidenceHref", () => {
  it("builds a github blob URL when repoFullName, defaultBranch, and path are all present", () => {
    expect(evidenceHref("acme/payments-api", "main", "src/modules/foo/service.ts")).toBe(
      "https://github.com/acme/payments-api/blob/main/src/modules/foo/service.ts",
    );
  });

  it("returns undefined when repoFullName is null", () => {
    expect(evidenceHref(null, "main", "src/foo.ts")).toBeUndefined();
  });

  it("returns undefined when repoFullName is undefined", () => {
    expect(evidenceHref(undefined, "main", "src/foo.ts")).toBeUndefined();
  });

  it("returns undefined when defaultBranch is null", () => {
    expect(evidenceHref("acme/payments-api", null, "src/foo.ts")).toBeUndefined();
  });

  it("returns undefined when defaultBranch is undefined", () => {
    expect(evidenceHref("acme/payments-api", undefined, "src/foo.ts")).toBeUndefined();
  });

  it("returns undefined when path is null", () => {
    expect(evidenceHref("acme/payments-api", "main", null)).toBeUndefined();
  });
});

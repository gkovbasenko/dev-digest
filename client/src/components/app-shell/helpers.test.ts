import { describe, it, expect } from "vitest";
import { activeKeyFor } from "./helpers";

describe("activeKeyFor — Onboarding Tour (T5)", () => {
  it("matches a repo-scoped onboarding route", () => {
    expect(activeKeyFor("/repos/x/onboarding")).toBe("onboarding-tour");
  });

  it("does not match the bare Add-Repo /onboarding route", () => {
    expect(activeKeyFor("/onboarding")).not.toBe("onboarding-tour");
  });
});

import { describe, it, expect } from "vitest";
import { buildFindingLookup } from "./helpers";

describe("buildFindingLookup (AC-26)", () => {
  it("flattens every review's findings into a single id-keyed map", () => {
    const lookup = buildFindingLookup([
      { findings: [{ id: "f1", confidence: 0.9 }, { id: "f2", confidence: 0.4 }] },
      { findings: [{ id: "f3", confidence: 0.6 }] },
    ]);
    expect(lookup.get("f1")).toEqual({ id: "f1", confidence: 0.9 });
    expect(lookup.get("f3")).toEqual({ id: "f3", confidence: 0.6 });
    expect(lookup.get("missing")).toBeUndefined();
  });

  it("returns an empty map for undefined/empty input", () => {
    expect(buildFindingLookup(undefined).size).toBe(0);
    expect(buildFindingLookup([]).size).toBe(0);
  });
});

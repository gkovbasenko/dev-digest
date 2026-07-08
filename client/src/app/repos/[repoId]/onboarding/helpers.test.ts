import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { relativeTime } from "./helpers";

const NOW = new Date("2026-07-08T12:00:00.000Z");

describe("relativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns an em dash for null, undefined, or empty input", () => {
    expect(relativeTime(null)).toBe("—");
    expect(relativeTime(undefined)).toBe("—");
    expect(relativeTime("")).toBe("—");
  });

  it("returns an em dash for an unparseable date string", () => {
    expect(relativeTime("not-a-date")).toBe("—");
  });

  it("returns 'just now' for a timestamp under a minute old", () => {
    const iso = new Date(NOW.getTime() - 20_000).toISOString();
    expect(relativeTime(iso)).toBe("just now");
  });

  it("returns minutes-ago for a timestamp under an hour old", () => {
    const iso = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    expect(relativeTime(iso)).toBe("5m ago");
  });

  it("returns hours-ago for a timestamp under a day old", () => {
    const iso = new Date(NOW.getTime() - 3 * 60 * 60_000).toISOString();
    expect(relativeTime(iso)).toBe("3h ago");
  });

  it("returns days-ago for a timestamp a day or more old", () => {
    const iso = new Date(NOW.getTime() - 2 * 24 * 60 * 60_000).toISOString();
    expect(relativeTime(iso)).toBe("2d ago");
  });

  it("floors at 'just now' instead of going negative for a future timestamp", () => {
    const iso = new Date(NOW.getTime() + 60 * 60_000).toISOString();
    expect(relativeTime(iso)).toBe("just now");
  });
});

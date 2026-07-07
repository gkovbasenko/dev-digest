import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillVersion, SkillStats, Skill } from "@devdigest/shared";

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock("../api", () => ({
  api: {
    get: mockGet,
    post: mockPost,
  },
}));

import { useSkillVersions, useSkillStats, useRestoreSkillVersion } from "./skills";

afterEach(() => {
  cleanup();
  mockGet.mockReset();
  mockPost.mockReset();
});

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const VERSIONS: SkillVersion[] = [
  { version: 2, body: "# v2", created_at: "2026-01-02T00:00:00.000Z" },
  { version: 1, body: "# v1", created_at: "2026-01-01T00:00:00.000Z" },
];

const STATS: SkillStats = {
  agent_count: 2,
  version_count: 2,
  run_usage_count: 5,
  last_used_at: null,
  source: "manual",
  created_at: "2026-01-01T00:00:00.000Z",
};

const RESTORED_SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Checks PR quality",
  type: "rubric",
  source: "manual",
  body: "# v1",
  enabled: true,
  version: 3,
  evidence_files: null,
};

describe("useSkillVersions", () => {
  it("fetches the version history for a skill", async () => {
    mockGet.mockResolvedValue(VERSIONS);

    const { result } = renderHook(() => useSkillVersions("sk1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/skills/sk1/versions");
    expect(result.current.data).toEqual(VERSIONS);
  });

  it("is disabled (does not fetch) when no id is given", () => {
    renderHook(() => useSkillVersions(null), { wrapper: createWrapper() });
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe("useSkillStats", () => {
  it("fetches stats for a skill", async () => {
    mockGet.mockResolvedValue(STATS);

    const { result } = renderHook(() => useSkillStats("sk1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/skills/sk1/stats");
    expect(result.current.data).toEqual(STATS);
  });

  it("is disabled (does not fetch) when no id is given", () => {
    renderHook(() => useSkillStats(undefined), { wrapper: createWrapper() });
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe("useRestoreSkillVersion", () => {
  it("posts the chosen version and returns the updated skill", async () => {
    mockPost.mockResolvedValue(RESTORED_SKILL);

    const { result } = renderHook(() => useRestoreSkillVersion(), { wrapper: createWrapper() });

    await act(async () => {
      result.current.mutate({ id: "sk1", version: 1 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith("/skills/sk1/restore", { version: 1 });
    expect(result.current.data).toEqual(RESTORED_SKILL);
  });
});

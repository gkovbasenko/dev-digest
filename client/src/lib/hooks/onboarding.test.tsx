import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OnboardingDoc } from "@devdigest/shared";

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

import { useOnboarding, useRegenerateOnboarding } from "./onboarding";

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

const DOC: OnboardingDoc = {
  exists: true,
  indexed: true,
  stale: false,
  sections: [
    { kind: "architecture", title: "Architecture", body: "# Architecture", diagram: null, links: [] },
  ],
  generated_at: "2026-01-01T00:00:00.000Z",
  source_file_count: 42,
};

describe("useOnboarding", () => {
  it("fetches the onboarding doc for a repo", async () => {
    mockGet.mockResolvedValue(DOC);

    const { result } = renderHook(() => useOnboarding("repo1"), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGet).toHaveBeenCalledWith("/repos/repo1/onboarding");
    expect(result.current.data).toEqual(DOC);
  });

  it("is disabled (does not fetch) when repoId is falsy", () => {
    renderHook(() => useOnboarding(null), { wrapper: createWrapper() });
    expect(mockGet).not.toHaveBeenCalled();

    renderHook(() => useOnboarding(undefined), { wrapper: createWrapper() });
    expect(mockGet).not.toHaveBeenCalled();

    renderHook(() => useOnboarding(""), { wrapper: createWrapper() });
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe("useRegenerateOnboarding", () => {
  it("posts to the regenerate endpoint and invalidates the onboarding query on success", async () => {
    mockPost.mockResolvedValue(DOC);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useRegenerateOnboarding("repo1"), { wrapper });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockPost).toHaveBeenCalledWith("/repos/repo1/onboarding/regenerate");
    expect(result.current.data).toEqual(DOC);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["onboarding", "repo1"] });
  });
});

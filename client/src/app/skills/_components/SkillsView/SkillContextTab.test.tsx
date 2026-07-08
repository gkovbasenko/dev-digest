import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ContextDocument, ContextDocList } from "@devdigest/shared";

const { mockMutate, mockIsPending, mockDocList, mockLinks, mockPreview } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockIsPending: { current: false },
  mockDocList: { current: undefined as ContextDocList | undefined },
  mockLinks: { current: [] as { path: string; order: number }[] },
  mockPreview: { current: { content: "" } },
}));

vi.mock("../../../../lib/hooks/context", () => ({
  useContextDocs: () => ({ data: mockDocList.current }),
  useSkillContext: () => ({ data: mockLinks.current }),
  useSetSkillContext: () => ({ mutate: mockMutate, isPending: mockIsPending.current }),
  useContextFilePreview: () => ({ data: mockPreview.current, isLoading: false }),
}));

vi.mock("../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo1" }),
}));

import { SkillContextTab } from "./SkillContextTab";

const PUBLIC_API: ContextDocument = { path: "specs/public-api.md", badge: "specs", token_count: 80 };

afterEach(() => {
  cleanup();
  mockMutate.mockReset();
  mockIsPending.current = false;
  mockDocList.current = { indexed: true, documents: [PUBLIC_API] };
  mockLinks.current = [];
  mockPreview.current = { content: "" };
});

mockDocList.current = { indexed: true, documents: [PUBLIC_API] };

describe("SkillContextTab", () => {
  it("explains inheritance", () => {
    render(<SkillContextTab skillId="sk1" />);
    expect(screen.getByText("Project context to use")).toBeInTheDocument();
    expect(screen.getByText(/inherited by every agent/)).toBeInTheDocument();
  });

  it("attaching specs/public-api.md renders the serialization preview containing '- specs/public-api.md'", () => {
    mockLinks.current = [{ path: "specs/public-api.md", order: 0 }];
    render(<SkillContextTab skillId="sk1" />);

    expect(screen.getByText("SERIALIZES AS")).toBeInTheDocument();
    expect(screen.getByText(/- specs\/public-api\.md/)).toBeInTheDocument();
    expect(screen.getByText(/## Project specifications/)).toBeInTheDocument();
  });

  it("toggling a doc calls useSetSkillContext with the expected ordered paths + active repoId", () => {
    render(<SkillContextTab skillId="sk1" />);
    fireEvent.click(screen.getByRole("checkbox"));

    expect(mockMutate).toHaveBeenCalledWith(
      { paths: ["specs/public-api.md"], repoId: "repo1" },
      expect.any(Object),
    );
  });

  it("blocks the attach control for a doc over the per-doc cap", () => {
    const HUGE: ContextDocument = { path: "specs/huge.md", badge: "specs", token_count: 60_000 };
    mockDocList.current = { indexed: true, documents: [HUGE] };
    render(<SkillContextTab skillId="sk1" />);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.getByText("over cap")).toBeInTheDocument();
  });
});

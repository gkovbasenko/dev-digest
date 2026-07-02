import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ConventionCandidate } from "@devdigest/shared";
import { ConventionCandidateCard } from "./ConventionCandidateCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  rule: "Service classes are named with a Service suffix",
  category: "naming",
  evidence_path: "src/modules/foo/service.ts",
  evidence_snippet: "export class FooService",
  confidence: 0.9,
  accepted: false,
  rejected: false,
};

describe("ConventionCandidateCard", () => {
  it("renders rule, category, evidence path", () => {
    render(<ConventionCandidateCard c={CANDIDATE} onAction={() => {}} />);
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("naming")).toBeInTheDocument();
    expect(screen.getByText("src/modules/foo/service.ts")).toBeInTheDocument();
  });

  it("shows an 'Accepted' tag when accepted", () => {
    render(<ConventionCandidateCard c={{ ...CANDIDATE, accepted: true }} onAction={() => {}} />);
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("shows a 'Rejected' tag when rejected", () => {
    render(<ConventionCandidateCard c={{ ...CANDIDATE, rejected: true }} onAction={() => {}} />);
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("fires accept/reject actions", () => {
    const onAction = vi.fn();
    render(<ConventionCandidateCard c={CANDIDATE} onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith({ accepted: true });
    fireEvent.click(screen.getByText("Reject"));
    expect(onAction).toHaveBeenCalledWith({ rejected: true });
  });

  it("disables actions while pending", () => {
    render(<ConventionCandidateCard c={CANDIDATE} onAction={() => {}} pending />);
    expect(screen.getByText("Accept").closest("button")).toBeDisabled();
    expect(screen.getByText("Reject").closest("button")).toBeDisabled();
  });

  it("edit mode: Save fires onAction with the edited rule and category", () => {
    const onAction = vi.fn();
    render(<ConventionCandidateCard c={CANDIDATE} onAction={onAction} />);
    fireEvent.click(screen.getByText("Edit"));

    const input = screen.getByPlaceholderText("Rule text");
    fireEvent.change(input, { target: { value: "Edited rule text" } });
    fireEvent.click(screen.getByText("Save"));

    expect(onAction).toHaveBeenCalledWith({ rule: "Edited rule text", category: "naming" });
  });

  it("edit mode: Cancel discards changes without firing onAction", () => {
    const onAction = vi.fn();
    render(<ConventionCandidateCard c={CANDIDATE} onAction={onAction} />);
    fireEvent.click(screen.getByText("Edit"));

    const input = screen.getByPlaceholderText("Rule text");
    fireEvent.change(input, { target: { value: "Something else entirely" } });
    fireEvent.click(screen.getByText("Cancel"));

    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });

  it("Save is disabled when the rule is emptied out", () => {
    render(<ConventionCandidateCard c={CANDIDATE} onAction={() => {}} />);
    fireEvent.click(screen.getByText("Edit"));
    const input = screen.getByPlaceholderText("Rule text");
    fireEvent.change(input, { target: { value: "   " } });
    expect(screen.getByText("Save").closest("button")).toBeDisabled();
  });

  describe("nullable fields", () => {
    it("renders without a category badge when category is null", () => {
      render(<ConventionCandidateCard c={{ ...CANDIDATE, category: null }} onAction={() => {}} />);
      expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
      expect(screen.queryByText("naming")).not.toBeInTheDocument();
    });

    it("renders without an evidence path link when evidence_path is null", () => {
      render(
        <ConventionCandidateCard c={{ ...CANDIDATE, evidence_path: null }} onAction={() => {}} />,
      );
      expect(screen.queryByText("src/modules/foo/service.ts")).not.toBeInTheDocument();
    });

    it("renders without a snippet block when evidence_snippet is null", () => {
      const { container } = render(
        <ConventionCandidateCard c={{ ...CANDIDATE, evidence_snippet: null }} onAction={() => {}} />,
      );
      expect(container.querySelector("pre")).not.toBeInTheDocument();
    });

    it("renders without a confidence indicator when confidence is null", () => {
      render(<ConventionCandidateCard c={{ ...CANDIDATE, confidence: null }} onAction={() => {}} />);
      expect(screen.queryByTitle("Model confidence")).not.toBeInTheDocument();
    });

    it("renders without crashing when every nullable field is null", () => {
      render(
        <ConventionCandidateCard
          c={{
            ...CANDIDATE,
            category: null,
            evidence_path: null,
            evidence_snippet: null,
            confidence: null,
          }}
          onAction={() => {}}
        />,
      );
      expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
      expect(screen.getByText("Accept")).toBeInTheDocument();
    });
  });
});

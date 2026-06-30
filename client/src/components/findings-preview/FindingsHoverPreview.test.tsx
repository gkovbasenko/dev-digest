import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { FindingsHoverPreview, type PreviewFinding } from "./FindingsHoverPreview";

afterEach(cleanup);

const F: PreviewFinding = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  confidence: 0.98,
  rationale_excerpt: "A live Stripe key is committed.",
};

describe("FindingsHoverPreview", () => {
  it("renders just the trigger when totalCount is zero", () => {
    render(
      <FindingsHoverPreview findings={[]} totalCount={0} headerLabel="0 findings">
        <button>chips</button>
      </FindingsHoverPreview>,
    );
    expect(screen.getByText("chips")).toBeInTheDocument();
    expect(screen.queryByText("0 findings")).not.toBeInTheDocument();
  });

  it("opens the popover on hover and shows the finding rows", () => {
    render(
      <FindingsHoverPreview findings={[F]} totalCount={1} headerLabel="1 findings">
        <button>chips</button>
      </FindingsHoverPreview>,
    );
    fireEvent.mouseEnter(screen.getByText("chips").parentElement!);
    expect(screen.getByText("1 findings")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText(/98% conf/)).toBeInTheDocument();
    expect(screen.getByText("A live Stripe key is committed.")).toBeInTheDocument();
  });

  it("closes the popover shortly after mouseleave", async () => {
    render(
      <FindingsHoverPreview findings={[F]} totalCount={1} headerLabel="1 findings">
        <button>chips</button>
      </FindingsHoverPreview>,
    );
    const trigger = screen.getByText("chips").parentElement!;
    fireEvent.mouseEnter(trigger);
    expect(screen.getByText("1 findings")).toBeInTheDocument();
    fireEvent.mouseLeave(trigger);
    // 80ms close delay lets the cursor bridge trigger → popover without flicker.
    await waitFor(() => {
      expect(screen.queryByText("1 findings")).not.toBeInTheDocument();
    });
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SeverityChips } from "./SeverityChips";

afterEach(cleanup);

describe("SeverityChips", () => {
  it("renders icon + count for each non-zero severity", () => {
    render(<SeverityChips counts={{ CRITICAL: 2, WARNING: 3, SUGGESTION: 1 }} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("hides zero-count severities", () => {
    render(<SeverityChips counts={{ CRITICAL: 2, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders nothing when all severities are zero", () => {
    const { container } = render(
      <SeverityChips counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

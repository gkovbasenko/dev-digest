import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => (
    <div data-testid="mermaid-diagram" data-chart={chart} />
  ),
}));

import { ArchitectureSection } from "./ArchitectureSection";

afterEach(cleanup);

describe("ArchitectureSection", () => {
  it("renders both the diagram and the markdown body when a diagram is present", () => {
    render(<ArchitectureSection body="The system has three layers." diagram="flowchart TD\nA-->B" />);
    expect(screen.getByTestId("mermaid-diagram")).toBeInTheDocument();
    expect(screen.getByText("The system has three layers.")).toBeInTheDocument();
  });

  it("renders body only, without crashing, when diagram is null", () => {
    render(<ArchitectureSection body="The system has three layers." diagram={null} />);
    expect(screen.queryByTestId("mermaid-diagram")).not.toBeInTheDocument();
    expect(screen.getByText("The system has three layers.")).toBeInTheDocument();
  });

  it("renders body only when diagram is undefined", () => {
    render(<ArchitectureSection body="The system has three layers." />);
    expect(screen.queryByTestId("mermaid-diagram")).not.toBeInTheDocument();
    expect(screen.getByText("The system has three layers.")).toBeInTheDocument();
  });
});

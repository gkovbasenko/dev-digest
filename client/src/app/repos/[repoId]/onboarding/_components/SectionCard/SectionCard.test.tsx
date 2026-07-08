import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SectionCard } from "./SectionCard";

afterEach(cleanup);

describe("SectionCard", () => {
  it("starts collapsed by default and expands/collapses on header click", () => {
    render(
      <SectionCard icon="Layers" title="Architecture">
        <p>Section body content</p>
      </SectionCard>,
    );
    expect(screen.queryByText("Section body content")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Architecture"));
    expect(screen.getByText("Section body content")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Architecture"));
    expect(screen.queryByText("Section body content")).not.toBeInTheDocument();
  });

  it("renders open by default when defaultOpen is set, and expands on Enter/Space", () => {
    render(
      <SectionCard icon="Layers" title="Architecture" defaultOpen>
        <p>Section body content</p>
      </SectionCard>,
    );
    expect(screen.getByText("Section body content")).toBeInTheDocument();

    const header = screen.getByRole("button", { expanded: true });
    fireEvent.keyDown(header, { key: " " });
    expect(screen.queryByText("Section body content")).not.toBeInTheDocument();

    fireEvent.keyDown(header, { key: "Enter" });
    expect(screen.getByText("Section body content")).toBeInTheDocument();
  });
});

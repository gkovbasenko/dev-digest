import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/runs.json";
import { ModeToggle } from "./ModeToggle";

function renderToggle(mode: "columns" | "tabs", onChange: (m: "columns" | "tabs") => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <ModeToggle mode={mode} onChange={onChange} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("ModeToggle (AC-27)", () => {
  it("renders two keyboard-reachable, aria-pressed buttons and reports the clicked mode via a plain callback (no mutation)", () => {
    const onChange = vi.fn();
    renderToggle("columns", onChange);

    const columnsBtn = screen.getByRole("button", { name: "columns" });
    const tabsBtn = screen.getByRole("button", { name: "tabs" });
    expect(columnsBtn).toHaveAttribute("aria-pressed", "true");
    expect(tabsBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(tabsBtn);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("tabs");
  });
});

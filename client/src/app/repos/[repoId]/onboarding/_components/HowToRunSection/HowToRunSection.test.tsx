import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import { ToastProvider } from "@/lib/toast";
import { HowToRunSection } from "./HowToRunSection";

afterEach(cleanup);

function renderSection(body: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ToastProvider>
        <HowToRunSection body={body} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const BODY = ["Install dependencies:", "", "```bash", "pnpm install", "```", "", "```bash", "pnpm dev", "```"].join(
  "\n",
);

describe("HowToRunSection", () => {
  it("shows an 'insufficient signal' note when the body is empty", () => {
    renderSection("");
    expect(screen.getByText("Insufficient signal to generate run instructions for this repo.")).toBeInTheDocument();
  });

  it("renders each fenced code block with its own copy control that copies only that block's text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderSection(BODY);

    expect(screen.getByText("Install dependencies:")).toBeInTheDocument();
    expect(screen.getByText("pnpm install")).toBeInTheDocument();
    expect(screen.getByText("pnpm dev")).toBeInTheDocument();

    const copyButtons = screen.getAllByText("Copy");
    expect(copyButtons).toHaveLength(2);

    fireEvent.click(copyButtons[1]!);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("pnpm dev");

    expect(await screen.findByText("Copied")).toBeInTheDocument();
    // The first block's control is untouched — still says "Copy".
    expect(screen.getAllByText("Copy")).toHaveLength(1);
  });

  it("shows an error toast and does not throw when the clipboard write rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderSection(BODY);

    const copyButtons = screen.getAllByText("Copy");
    expect(() => fireEvent.click(copyButtons[0]!)).not.toThrow();

    expect(await screen.findByText("Couldn’t copy to clipboard.")).toBeInTheDocument();
    // No success flash — both controls still say "Copy".
    expect(screen.getAllByText("Copy")).toHaveLength(2);
  });

  it("shows an error toast and does not throw when the Clipboard API is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });

    renderSection(BODY);

    const copyButtons = screen.getAllByText("Copy");
    expect(() => fireEvent.click(copyButtons[0]!)).not.toThrow();
    expect(screen.getByText("Couldn’t copy to clipboard.")).toBeInTheDocument();
  });
});

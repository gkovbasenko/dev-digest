import type { ComponentProps } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import { ToastProvider } from "@/lib/toast";
import { OnboardingHeader } from "./OnboardingHeader";

afterEach(cleanup);

function renderHeader(props: Partial<ComponentProps<typeof OnboardingHeader>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ToastProvider>
        <OnboardingHeader
          repoId="repo1"
          repoName="acme/payments-api"
          sourceFileCount={42}
          generatedAt={null}
          stale={false}
          isPending={false}
          isError={false}
          onRegenerate={() => {}}
          {...props}
        />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("OnboardingHeader", () => {
  it("renders the repo title and file-count subtitle", () => {
    renderHeader();
    expect(screen.getByText("Onboarding for acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText(/Generated from index of 42 files/)).toBeInTheDocument();
  });

  it("fires onRegenerate when Regenerate is clicked, and disables it while pending", () => {
    const onRegenerate = vi.fn();
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <ToastProvider>
          <OnboardingHeader
            repoId="repo1"
            repoName="acme/payments-api"
            sourceFileCount={42}
            generatedAt={null}
            stale={false}
            isPending={false}
            isError={false}
            onRegenerate={onRegenerate}
          />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByText("Regenerate"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);

    rerender(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <ToastProvider>
          <OnboardingHeader
            repoId="repo1"
            repoName="acme/payments-api"
            sourceFileCount={42}
            generatedAt={null}
            stale={false}
            isPending
            isError={false}
            onRegenerate={onRegenerate}
          />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    const pendingBtn = screen.getByText("Regenerating…").closest("button")!;
    expect(pendingBtn).toBeDisabled();
    fireEvent.click(pendingBtn);
    // still just the one call from before — the pending click didn't fire again.
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("shows a non-blocking stale hint while still rendering the header", () => {
    renderHeader({ stale: true });
    expect(screen.getByText(/may be out of date/)).toBeInTheDocument();
    expect(screen.getByText("Onboarding for acme/payments-api")).toBeInTheDocument();
  });

  it("shows an inline retry after a failed regenerate", () => {
    const onRegenerate = vi.fn();
    renderHeader({ isError: true, onRegenerate });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("copies the share link to the clipboard and shows a confirmation toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    renderHeader();
    fireEvent.click(screen.getByText("Share link"));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/repos/repo1/onboarding"));
    expect(await screen.findByText("Link copied to clipboard")).toBeInTheDocument();
  });

  it("shows an error toast and does not throw when the clipboard write rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    renderHeader();
    expect(() => fireEvent.click(screen.getByText("Share link"))).not.toThrow();

    expect(await screen.findByText("Couldn’t copy link to clipboard.")).toBeInTheDocument();
  });

  it("shows an error toast and does not throw when the Clipboard API is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });

    renderHeader();
    expect(() => fireEvent.click(screen.getByText("Share link"))).not.toThrow();

    expect(screen.getByText("Couldn’t copy link to clipboard.")).toBeInTheDocument();
  });
});

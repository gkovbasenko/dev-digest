/* WizardDialog — the Export Wizard's accessible dialog shell (AC-12).
   `vendor/ui`'s `Modal` primitive has `role="dialog"` + `aria-modal` and
   backdrop-close, but NO Escape handler and NO focus trap (client INSIGHTS /
   plan gotcha). Reusing `Modal` as a black box makes it impossible to trap
   focus reliably: `Modal` gates its portal behind an internal `mounted`
   flag flipped from its own `useEffect`, so a wrapper's own mount effect can
   run BEFORE that flag flips (child-before-parent effect order) and find no
   dialog node yet. Rather than special-case that race, this component owns
   its own minimal portal (always mounted — it is only ever rendered from a
   client-side `useState` toggle, never during SSR, so the `document` guard
   `Modal` needs isn't required here) with the exact same visual shell, so
   focus management can be wired synchronously against real DOM nodes. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { IconBtn } from "@devdigest/ui";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function WizardDialog({
  width = 720,
  title,
  ariaLabel,
  subtitle,
  onClose,
  children,
  footer,
}: {
  width?: number;
  title?: React.ReactNode;
  /** Accessible name for the dialog (AC-12). Falls back to `title` when it's
      a plain string. */
  ariaLabel: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  // Focus moves into the dialog on open; restored to the trigger on close.
  React.useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const el = dialogRef.current;
    if (el) {
      const first = focusableIn(el)[0];
      (first ?? el).focus();
    }
    return () => {
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escape closes; Tab/Shift+Tab is trapped within the dialog.
  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const el = dialogRef.current;
      if (!el) return;
      const focusables = focusableIn(el);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", zIndex: 50, padding: 28 }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", animation: "ddfadein .15s ease" }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        style={{
          position: "relative",
          width,
          maxWidth: "100%",
          maxHeight: "92%",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: 14,
          boxShadow: "var(--shadow-modal)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "ddpop .18s ease",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: "18px 24px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
            {subtitle && (
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
          <IconBtn icon="X" label="Close" onClick={onClose} />
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>{children}</div>
        {footer && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "16px 24px", background: "var(--bg-surface)" }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

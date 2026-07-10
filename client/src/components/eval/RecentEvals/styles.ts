import type React from "react";

export const s = {
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } as React.CSSProperties,
  loading: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "16px 0",
  } as React.CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } as React.CSSProperties,
  agentCard: {
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } as React.CSSProperties,
  agentHeader: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  } as React.CSSProperties,
  agentName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } as React.CSSProperties,
  agentMeta: {
    fontSize: 12,
    color: "var(--text-muted)",
  } as React.CSSProperties,
  metrics: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  } as React.CSSProperties,
} as const;

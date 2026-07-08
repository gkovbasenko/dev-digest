import type { IconName } from "@devdigest/ui";

/** Skill detail tab descriptor. */
export interface DetailTab {
  key: string;
  label: string;
  icon: IconName;
}

export const TABS: readonly DetailTab[] = [
  { key: "config", label: "Config", icon: "Settings" },
  { key: "context", label: "Context", icon: "Folder" },
  { key: "preview", label: "Preview", icon: "Eye" },
  { key: "stats", label: "Stats", icon: "BarChart" },
  { key: "versions", label: "Versions", icon: "History" },
];

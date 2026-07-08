import type { IconName } from "@devdigest/ui";

/** The five fixed onboarding section kinds (mirrors the server's
 *  ONBOARDING_SECTION_KINDS) — used to pick a stable icon/nav label per
 *  section regardless of the LLM-generated `section.title` text. */
export const SECTION_KINDS = [
  "architecture",
  "critical_paths",
  "how_to_run",
  "guided_reading",
  "first_tasks",
] as const;

export const SECTION_ICON: Record<string, IconName> = {
  architecture: "Layers",
  critical_paths: "GitBranch",
  how_to_run: "Play",
  guided_reading: "BookOpen",
  first_tasks: "ListChecks",
};

export const DEFAULT_SECTION_ICON: IconName = "FileText";

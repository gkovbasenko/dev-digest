import type { CiTarget } from "@devdigest/shared";

/** Step order for `ExportWizardSteps` + the wizard's own `step` state. */
export const STEP_TARGET = 0;
export const STEP_PREVIEW = 1;
export const STEP_CONFIGURE = 2;
export const STEP_INSTALL = 3;

/** Target options (AC-7). GHA is the only one wired end-to-end (self-contained
    workflow + open-PR + ingest); the rest emit a template bundle usable only
    via the `action='files'` path (plan Decision — "Non-GHA targets"). */
export const TARGET_VALUES: readonly CiTarget[] = ["gha", "circle", "jenkins", "cli"];

/** Default PR triggers (`CiExportInput.triggers` default). */
export const DEFAULT_TRIGGERS = ["opened", "synchronize", "reopened"] as const;
export const TRIGGER_VALUES = ["opened", "synchronize", "reopened"] as const;
export type TriggerValue = (typeof TRIGGER_VALUES)[number];

/** "Post results as" options (`CiExportInput.post_as`). Only `github_review`
    yields a blocking verdict (AC-9). */
export const POST_AS_VALUES = ["github_review", "pr_comment", "none"] as const;

/** Secret names the generated workflow references by NAME ONLY — never a
    value (AC-10/AC-31). Display-only in the Configure step. */
export const EXPECTED_SECRETS = ["OPENROUTER_API_KEY", "GITHUB_TOKEN"] as const;

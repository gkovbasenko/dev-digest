import type { IconName } from "@devdigest/ui";
import type { ConventionCategory } from "@devdigest/shared";

export const CATEGORY_META: Record<ConventionCategory, { icon: IconName; label: string }> = {
  naming: { icon: "Tag", label: "naming" },
  imports: { icon: "Boxes", label: "imports" },
  "error-handling": { icon: "AlertTriangle", label: "error handling" },
  testing: { icon: "FlaskConical", label: "testing" },
  formatting: { icon: "Code", label: "formatting" },
  architecture: { icon: "Layers", label: "architecture" },
  other: { icon: "Hash", label: "other" },
};

export const CATEGORY_OPTIONS: { value: ConventionCategory; label: string }[] = (
  Object.keys(CATEGORY_META) as ConventionCategory[]
).map((value) => ({ value, label: CATEGORY_META[value].label }));

/* schema.ts — runtime Zod validation for `EvalCase.expected_output`.
   `EvalCase.expected_output` is `z.unknown()` in the shared contract (the API
   only cares that it round-trips through JSONB); the editor is the one place
   that needs to validate its actual shape client-side (AC-20), so the schema
   lives here rather than in `vendor/shared`.

   IMPORTANT (client INSIGHTS 2026-07-08): `Severity`/`FindingCategory` are
   runtime VALUES (Zod enums), so they must come from the contract SUBPATH
   (`@devdigest/shared/contracts/findings`), never the bare `@devdigest/shared`
   barrel — a value import from the barrel breaks the webpack build. */
import { z } from "zod";
import { Severity, FindingCategory } from "@devdigest/shared/contracts/findings";

/** `{ file, start_line, end_line }` — a must_not_flag region, or the base shape
    a must_find region extends. */
export const Region = z.object({
  file: z.string().min(1),
  start_line: z.number().int(),
  end_line: z.number().int(),
});
export type Region = z.infer<typeof Region>;

/** A must_find region also carries the finding metadata the case expects. */
export const MustFindRegion = Region.extend({
  severity: Severity,
  category: FindingCategory,
  title: z.string(),
});
export type MustFindRegion = z.infer<typeof MustFindRegion>;

/** `expected_output` shape (spec D2): must_find regions (with finding metadata)
    the run is expected to surface, and must_not_flag regions it must not. */
export const ExpectedOutput = z.object({
  must_find: z.array(MustFindRegion),
  must_not_flag: z.array(Region),
});
export type ExpectedOutput = z.infer<typeof ExpectedOutput>;

export const EMPTY_EXPECTED_OUTPUT: ExpectedOutput = { must_find: [], must_not_flag: [] };

export const FINDING_SKELETON: MustFindRegion = {
  file: "",
  start_line: 1,
  end_line: 1,
  severity: "WARNING",
  category: "bug",
  title: "",
};

export type ExpectedOutputValidation =
  | { valid: true; value: ExpectedOutput }
  | { valid: false; error: string };

/** Two-stage validation: JSON.parse first (so a malformed literal reports as
    "Invalid JSON", not a confusing Zod path), then `safeParse` against the
    shape above. Never throws. */
export function validateExpectedOutput(raw: string): ExpectedOutputValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, error: "Invalid JSON" };
  }
  const result = ExpectedOutput.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path?.length ? ` (${first.path.join(".")})` : "";
    return { valid: false, error: `${first?.message ?? "Invalid shape"}${path}` };
  }
  return { valid: true, value: result.data };
}

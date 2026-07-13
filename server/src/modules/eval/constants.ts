/** Constants for the eval module. */

/** Max points rendered in an agent-detail METRIC TREND / dashboard-card sparkline. */
export const DASHBOARD_TREND_LIMIT = 20;

/** Max rows in a dashboard "recent runs" table (agent-detail and workspace-wide). */
export const DASHBOARD_RECENT_RUNS_LIMIT = 10;

/** Max points fed into a workspace-level agent card's sparkline. */
export const DASHBOARD_SPARKLINE_LIMIT = 10;

/** `groundingSummary`-style fallback when a case never attempted grounding (malformed diff / LLM failure). */
export const NO_GROUNDING_SUMMARY = '0/0 passed';

/** Reason recorded in a case_result's `actual` blob when the frozen `input_diff` parses to zero files. */
export const MALFORMED_DIFF_REASON = 'malformed input_diff: no files parsed';

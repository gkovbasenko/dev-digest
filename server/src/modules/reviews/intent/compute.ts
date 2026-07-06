import { wrapUntrusted } from '@devdigest/reviewer-core';
import { Intent as IntentSchema } from '@devdigest/shared';
import type { ChatMessage, Intent, IssueMeta } from '@devdigest/shared';
import type { Container } from '../../../platform/container.js';
import { resolveFeatureModel } from '../../settings/feature-models.js';
import { extractHunkHeaders } from './hunk-headers.js';

/**
 * C2 — intent compute function.
 *
 * Derives a PR's intent/scope with a cheap model BEFORE the (expensive) review
 * runs, so agents can be told what's in/out of scope. Cost angle: the prompt
 * excludes diff BODIES entirely — only the file list + `@@ … @@` hunk headers
 * (from C1) — since the intent doesn't need line-by-line code to be inferred.
 *
 * No I/O beyond: (1) the injected LLM provider (via the DI container) and
 * (2) a best-effort GitHub `getIssue` lookup for the PR's linked issue (not
 * persisted anywhere, so it's re-resolved here each time).
 */

/** Minimal pino-compatible logger — matches `run-logger.ts`'s `PinoLike`. */
export interface IntentLogger {
  info: (obj: unknown, msg?: string) => void;
}

export interface IntentPrInput {
  id: string;
  number: number;
  title: string;
  body: string | null;
}

export interface IntentFileInput {
  path: string;
  patch: string | null;
}

export interface ComputeIntentInput {
  container: Container;
  workspaceId: string;
  pull: IntentPrInput;
  repo: { owner: string; name: string };
  files: IntentFileInput[];
  logger?: IntentLogger;
}

const SYSTEM_PROMPT =
  'You infer the INTENT and SCOPE of a pull request from its title, description, ' +
  'linked issue, changed file list, and diff hunk headers only — you are NOT shown the ' +
  'full diff. Produce: a short one-to-two-sentence summary of what the PR is trying to ' +
  'accomplish (`intent`), a short list of what IS in scope (`in_scope`), and a short list ' +
  'of what is explicitly OUT of scope (`out_of_scope`) — so reviewers know not to treat ' +
  'unrelated pre-existing issues as blockers for this PR. If the PR has no description and ' +
  'no linked issue, you MUST still infer a plausible best-effort intent from the title, the ' +
  'changed file paths, and the hunk headers alone (implicit signals) — never refuse or ask ' +
  'for more information.';

/**
 * A GitHub closing-keyword reference in the PR body (`Closes #123`, `fixes: #4`).
 * The keyword is REQUIRED and word-boundary-anchored: a bare `#123` in prose, a
 * URL (`…/issues/123`), or a code sample is NOT a linked issue and must not
 * resolve a phantom/unrelated one. (Stricter than the GitHub adapter's older
 * loose regex, which made the keyword optional and matched any `#<n>`.)
 */
const LINKED_ISSUE_RE =
  /\b(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)[:\s]+#(\d+)\b/i;

/**
 * Best-effort linked-issue resolution over the PR body. Not persisted on the
 * `pull_requests` table, so this re-derives it fresh at compute time via the
 * GitHub adapter's public `getIssue`. Never throws — a missing/unreachable
 * issue just means the prompt falls back to title + files + hunk headers.
 */
async function resolveLinkedIssue(
  container: Container,
  repo: { owner: string; name: string },
  body: string,
): Promise<IssueMeta | undefined> {
  const m = body.match(LINKED_ISSUE_RE);
  if (!m?.[1]) return undefined;
  try {
    const github = await container.github();
    return await github.getIssue(repo, Number(m[1]));
  } catch {
    return undefined;
  }
}

/** Build the intent-only chat messages (no diff bodies — headers only). */
export function buildIntentPrompt(
  pull: IntentPrInput,
  linkedIssue: IssueMeta | undefined,
  files: IntentFileInput[],
): ChatMessage[] {
  const lines: string[] = [`PR #${pull.number}: ${pull.title}`, ''];

  const body = pull.body?.trim();
  if (body) {
    lines.push('## PR description');
    lines.push(wrapUntrusted('pr-description', body));
  } else {
    lines.push('(No PR description provided.)');
  }
  lines.push('');

  if (linkedIssue) {
    lines.push('## Linked issue');
    lines.push(
      wrapUntrusted(
        'linked-issue',
        `#${linkedIssue.number} (${linkedIssue.state}): ${linkedIssue.title}\n${linkedIssue.body ?? ''}`,
      ),
    );
  } else {
    lines.push('(No linked issue found.)');
  }
  lines.push('');

  lines.push('## Changed files + hunk headers (diff bodies excluded)');
  if (files.length === 0) {
    lines.push('(No changed files.)');
  } else {
    for (const f of files) {
      const headers = extractHunkHeaders(f.patch);
      lines.push(`- ${f.path}`);
      for (const h of headers) lines.push(`  ${h}`);
    }
  }

  if (!body && !linkedIssue) {
    lines.push('');
    lines.push(
      'No PR description or linked issue is available for this PR. Infer intent purely from ' +
        'the title, the changed file paths, and the hunk headers above — this is expected; ' +
        'still produce a concrete, plausible best-effort intent rather than a refusal.',
    );
  }

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: lines.join('\n') },
  ];
}

/** Rough local char-based token estimate (chars / 4) — no `Tokenizer` dependency. */
function estimateTokensFromChars(chars: number): number {
  return Math.round(chars / 4);
}

/**
 * Compute the intent/scope for a PR via the cheap `review_intent` feature
 * model. Logs the actual `tokensIn` against a rough full-diff-alternative
 * estimate so the token savings of the headers-only prompt are visible.
 */
export async function computeIntent(input: ComputeIntentInput): Promise<Intent> {
  const { container, workspaceId, pull, repo, files, logger } = input;

  const linkedIssue = pull.body
    ? await resolveLinkedIssue(container, repo, pull.body)
    : undefined;

  const messages = buildIntentPrompt(pull, linkedIssue, files);

  const { provider, model } = await resolveFeatureModel(container, workspaceId, 'review_intent');
  const llm = await container.llm(provider);
  const result = await llm.completeStructured<Intent>({
    model,
    schema: IntentSchema,
    schemaName: 'Intent',
    messages,
    sessionId: `${repo.owner}/${repo.name}#${pull.number}:intent`,
  });

  const estFullDiffTokens = estimateTokensFromChars(
    files.reduce((sum, f) => sum + (f.patch?.length ?? 0), 0),
  );
  const savedApprox = Math.max(0, estFullDiffTokens - result.tokensIn);
  logger?.info(
    { prId: pull.id, model, tokensIn: result.tokensIn, estFullDiffTokens, savedApprox },
    `intent computed pr=${pull.id} model=${model} tokensIn=${result.tokensIn} estFullDiffTokens=${estFullDiffTokens} savedApprox=${savedApprox}`,
  );

  return result.data;
}

/** Render a stored/computed Intent into the concise string `ReviewInput.intent` expects. */
export function renderIntent(intent: Intent): string {
  const lines = [`Summary: ${intent.intent}`];
  if (intent.in_scope.length > 0) {
    lines.push('In scope:');
    for (const s of intent.in_scope) lines.push(`- ${s}`);
  }
  if (intent.out_of_scope.length > 0) {
    lines.push('Out of scope:');
    for (const s of intent.out_of_scope) lines.push(`- ${s}`);
  }
  return lines.join('\n');
}

import { wrapUntrusted } from '@devdigest/reviewer-core';
import { AGGREGATE_TOKEN_CAP, PER_DOC_TOKEN_CAP, RiskBrief as RiskBriefSchema } from '@devdigest/shared';
import type { ChatMessage, Intent, IssueMeta, PrBlastResponse, RiskBrief, SmartDiff } from '@devdigest/shared';
import type { Container } from '../../../platform/container.js';
import { renderPrompt } from '../../../platform/prompts.js';
import { resolveFeatureModel } from '../../settings/feature-models.js';
import { ContextService } from '../../context/service.js';
import { extractHunkHeaders } from '../intent/hunk-headers.js';

/**
 * Brief compute function (Why+Risk brief).
 *
 * Mirrors `intent/compute.ts`'s shape: a single `completeStructured` call over
 * deterministic, already-built inputs — cached Intent, the Blast summary,
 * Smart-Diff group statistics, the changed-file list + hunk headers, the
 * linked issue, and token-capped Context-Folder specs. Diff BODIES are never
 * included (only file paths + `@@ … @@` hunk headers, like intent).
 *
 * No I/O beyond: (1) the injected LLM provider (via the DI container), (2) a
 * best-effort GitHub `getIssue` lookup for the linked issue, and (3) a
 * best-effort `ContextService` read of the repo's Project Context specs.
 */

export interface BriefPrInput {
  id: string;
  number: number;
  title: string;
  body: string | null;
}

export interface BriefFileInput {
  path: string;
  patch: string | null;
}

export interface ComputeBriefInput {
  container: Container;
  workspaceId: string;
  repoId: string;
  pull: BriefPrInput;
  repo: { owner: string; name: string };
  files: BriefFileInput[];
  /** Already-computed persisted intent, or null when none exists yet — no intent-model call here. */
  intent: Intent | null;
  blast: PrBlastResponse;
  smartDiff: SmartDiff;
}

export interface ComputeBriefResult {
  brief: RiskBrief;
  provider: string;
  model: string;
  inputPresence: { intent: boolean; issue: boolean; specs: number };
}

/**
 * A GitHub closing-keyword reference in the PR body (`Closes #123`, `fixes: #4`).
 * Duplicated from `intent/compute.ts` (not imported) — the GitHub adapter's
 * `resolveLinkedIssue` is private (server INSIGHTS 2026-07-06); re-derive the
 * same regex here rather than widening the adapter interface.
 */
const LINKED_ISSUE_RE =
  /\b(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)[:\s]+#(\d+)\b/i;

/** Best-effort linked-issue resolution over the PR body. Never throws. */
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

interface SpecExcerpt {
  path: string;
  content: string;
}

/**
 * Best-effort, token-capped Context-Folder spec gathering: ALL configured
 * repo specs up to `AGGREGATE_TOKEN_CAP` (no relevance ranking — spec
 * fallback (b), plan Decision 2), each individually under `PER_DOC_TOKEN_CAP`.
 * `ContextService` is reached by CONSTRUCTING it (matching `context/routes.ts`
 * precedent) — it is not on the DI container. The whole step is wrapped in
 * try/catch so an un-cloned repo or any read failure degrades to `[]`.
 */
async function gatherSpecs(
  container: Container,
  workspaceId: string,
  repoId: string,
): Promise<SpecExcerpt[]> {
  try {
    const svc = new ContextService(container);
    const list = await svc.discover(workspaceId, repoId);
    if (!list.indexed || list.documents.length === 0) return [];

    let total = 0;
    const chosen: string[] = [];
    for (const doc of list.documents) {
      if (doc.token_count > PER_DOC_TOKEN_CAP) continue;
      if (total + doc.token_count > AGGREGATE_TOKEN_CAP) break;
      total += doc.token_count;
      chosen.push(doc.path);
    }

    const excerpts: SpecExcerpt[] = [];
    for (const path of chosen) {
      const preview = await svc.preview(workspaceId, repoId, path);
      if (preview) excerpts.push({ path, content: preview.content });
    }
    return excerpts;
  } catch {
    return [];
  }
}

/** Deterministic text summary of the Blast response — no LLM call. */
function formatBlastSummary(blast: PrBlastResponse): string {
  const lines: string[] = [
    `index_status: ${blast.index_status}${blast.degraded ? ' (degraded)' : ''}`,
  ];
  if (blast.reason) lines.push(`reason: ${blast.reason}`);
  lines.push(`changed_symbols: ${blast.changed_symbols.length}`);
  for (const s of blast.changed_symbols) lines.push(`- ${s.name} (${s.kind}) in ${s.file}`);
  lines.push(`impacted_endpoints: ${blast.impacted_endpoints.join(', ') || '(none)'}`);
  lines.push(`impacted_crons: ${blast.impacted_crons.join(', ') || '(none)'}`);
  const callerCount = blast.downstream.reduce((n, d) => n + d.callers.length, 0);
  lines.push(`downstream callers: ${callerCount}`);
  if (blast.degraded) {
    lines.push(
      'NOTE: the blast-radius index is degraded/partial — treat this as a LOWER-CONFIDENCE ' +
        'signal, not exhaustive.',
    );
  }
  return lines.join('\n');
}

/** Per-role file counts + summed additions/deletions from the Smart Diff groups — no per-line pseudocode. */
function formatSmartDiffStats(smartDiff: SmartDiff): string {
  if (smartDiff.groups.length === 0) return '(no changed-file groups)';
  return smartDiff.groups
    .map((g) => {
      const additions = g.files.reduce((n, f) => n + f.additions, 0);
      const deletions = g.files.reduce((n, f) => n + f.deletions, 0);
      return `- ${g.role}: ${g.files.length} file(s), +${additions}/-${deletions}`;
    })
    .join('\n');
}

/**
 * Build the brief-generation chat messages. Every foreign segment
 * (`pr-description`, `linked-issue`, each `spec:<path>`) is individually
 * wrapped via `wrapUntrusted` (AC-8); diff BODIES are never included — only
 * the file list + `@@ … @@` hunk headers (AC-6).
 */
export async function buildBriefPrompt(input: {
  pull: BriefPrInput;
  intent: Intent | null;
  linkedIssue: IssueMeta | undefined;
  blast: PrBlastResponse;
  smartDiff: SmartDiff;
  files: BriefFileInput[];
  specs: SpecExcerpt[];
}): Promise<ChatMessage[]> {
  const { pull, intent, linkedIssue, blast, smartDiff, files, specs } = input;
  const system = await renderPrompt('risk_brief.system.md', {});

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

  lines.push('## Derived intent');
  if (intent) {
    lines.push(`Summary: ${intent.intent}`);
    if (intent.in_scope.length > 0) lines.push(`In scope: ${intent.in_scope.join('; ')}`);
    if (intent.out_of_scope.length > 0) lines.push(`Out of scope: ${intent.out_of_scope.join('; ')}`);
  } else {
    lines.push('(No derived intent available — infer intent from the title and description above.)');
  }
  lines.push('');

  lines.push('## Blast radius');
  lines.push(formatBlastSummary(blast));
  lines.push('');

  lines.push('## Changed-file groups (Smart Diff)');
  lines.push(formatSmartDiffStats(smartDiff));
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

  if (specs.length > 0) {
    lines.push('');
    lines.push('## Project context specs');
    for (const s of specs) {
      lines.push(`### ${s.path}`);
      lines.push(wrapUntrusted(`spec:${s.path}`, s.content));
    }
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: lines.join('\n') },
  ];
}

/**
 * Compute a PR's Why+Risk brief via exactly ONE `completeStructured` call
 * (AC-1). Grounding (dropping hallucinated file refs) happens afterward in
 * `ground.ts`/`service.ts` — this function returns the raw model output.
 */
export async function computeBrief(input: ComputeBriefInput): Promise<ComputeBriefResult> {
  const { container, workspaceId, repoId, pull, repo, files, intent, blast, smartDiff } = input;

  const linkedIssue = pull.body ? await resolveLinkedIssue(container, repo, pull.body) : undefined;
  const specs = await gatherSpecs(container, workspaceId, repoId);

  const messages = await buildBriefPrompt({ pull, intent, linkedIssue, blast, smartDiff, files, specs });

  const { provider, model } = await resolveFeatureModel(container, workspaceId, 'risk_brief');
  const llm = await container.llm(provider);
  const result = await llm.completeStructured<RiskBrief>({
    model,
    schema: RiskBriefSchema,
    schemaName: 'RiskBrief',
    messages,
    maxRetries: 2,
  });

  return {
    brief: result.data,
    provider,
    model,
    inputPresence: { intent: intent != null, issue: linkedIssue != null, specs: specs.length },
  };
}

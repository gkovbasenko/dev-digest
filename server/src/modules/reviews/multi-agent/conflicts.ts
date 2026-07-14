/**
 * Deterministic cross-agent conflict matcher (pure, no I/O).
 *
 * Given the set of `done` agents' findings for one multi-agent run, computes
 * the `Conflict[]` list for the "Where agents disagree" view: locations where
 * at least one agent flagged something and at least one other reviewing
 * agent did not, or where flagging agents assigned divergent severities.
 *
 * Security (OWASP A05 — Injection / ReDoS): finding `title`/`rationale` text
 * is UNTRUSTED (LLM output, itself downstream of PR content). It is only ever
 * compared as data — split into a normalized token set and scored via a Dice
 * coefficient. Never pass finding text into `new RegExp(...)`; the only
 * regular expression here is the fixed, hardcoded tokenizer split pattern.
 */
import type { Conflict, ConflictTake, Finding, Severity } from '@devdigest/shared';

/** One `done` agent's persisted findings for this multi-agent run. */
export interface AgentReviewResult {
  agentId: string;
  persona: string;
  /** Only agents with `status === 'done'` contribute to conflict takes (AC-21). */
  status: string;
  findings: Finding[];
}

/** Dice-coefficient threshold above which two findings' title+rationale are "the same complaint". */
const SIMILARITY_THRESHOLD = 0.3;

/** Minimum normalized-token length kept (drops single-letter noise). */
const MIN_TOKEN_LENGTH = 2;

/** Fixed, hardcoded split pattern — never built from finding text. */
const TOKEN_SPLIT_RE = /[^a-z0-9]+/;

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

function severityRank(s: Severity): number {
  return SEVERITY_RANK[s];
}

/** Lowercase + split on non-alphanumerics into a de-duplicated token set. No regex compiled from input. */
function normalizeTokens(text: string): Set<string> {
  const tokens = text.toLowerCase().split(TOKEN_SPLIT_RE);
  const set = new Set<string>();
  for (const t of tokens) {
    if (t.length >= MIN_TOKEN_LENGTH) set.add(t);
  }
  return set;
}

/** Sørensen–Dice coefficient over two token sets: 2*|A∩B| / (|A|+|B|). */
function diceCoefficient(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  return (2 * intersection) / (a.size + b.size);
}

function textSimilarity(a: Finding, b: Finding): number {
  const tokensA = normalizeTokens(`${a.title} ${a.rationale}`);
  const tokensB = normalizeTokens(`${b.title} ${b.rationale}`);
  return diceCoefficient(tokensA, tokensB);
}

/** Inclusive `[start_line, end_line]` overlap, same shape as the eval-scoring / grounding gate. */
function linesIntersect(a: Finding, b: Finding): boolean {
  const aLo = Math.min(a.start_line, a.end_line);
  const aHi = Math.max(a.start_line, a.end_line);
  const bLo = Math.min(b.start_line, b.end_line);
  const bHi = Math.max(b.start_line, b.end_line);
  return aLo <= bHi && bLo <= aHi;
}

function findingsMatch(a: Finding, b: Finding): boolean {
  if (a.file !== b.file) return false;
  if (!linesIntersect(a, b)) return false;
  return textSimilarity(a, b) >= SIMILARITY_THRESHOLD;
}

/**
 * `noUncheckedIndexedAccess` makes every `arr[i]` read `T | undefined`. All
 * call sites below index with values known-in-range by construction (loop
 * bounds, or indices sourced from a same-length array) — this asserts that
 * invariant instead of scattering non-null assertions.
 */
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new RangeError(`index ${i} out of bounds (length ${arr.length})`);
  return v;
}

/** Simple union-find with path compression — clusters matching findings into contended locations. */
class UnionFind {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(x: number): number {
    while (at(this.parent, x) !== x) {
      this.parent[x] = at(this.parent, at(this.parent, x));
      x = at(this.parent, x);
    }
    return x;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

interface TaggedFinding {
  agentId: string;
  persona: string;
  finding: Finding;
}

/**
 * Compute the deterministic `Conflict[]` for a multi-agent run from the raw
 * per-agent results. Pure — no DB, no network, no UI. Agents whose
 * `status !== 'done'` are dropped entirely (their findings are excluded and
 * they never appear as an `ignored` take either — AC-21).
 */
export function computeConflicts(agents: AgentReviewResult[]): Conflict[] {
  const doneAgents = agents.filter((a) => a.status === 'done');
  if (doneAgents.length === 0) return [];

  const tagged: TaggedFinding[] = [];
  for (const agent of doneAgents) {
    for (const finding of agent.findings) {
      tagged.push({ agentId: agent.agentId, persona: agent.persona, finding });
    }
  }
  if (tagged.length === 0) return [];

  const uf = new UnionFind(tagged.length);
  for (let i = 0; i < tagged.length; i++) {
    for (let j = i + 1; j < tagged.length; j++) {
      if (findingsMatch(at(tagged, i).finding, at(tagged, j).finding)) {
        uf.union(i, j);
      }
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < tagged.length; i++) {
    const root = uf.find(i);
    const members = clusters.get(root);
    if (members) {
      members.push(i);
    } else {
      clusters.set(root, [i]);
    }
  }

  const conflicts: Conflict[] = [];
  for (const indices of clusters.values()) {
    const members = indices.map((i) => at(tagged, i));

    const takes: ConflictTake[] = doneAgents.map((agent) => {
      const own = members.filter((m) => m.agentId === agent.agentId);
      if (own.length === 0) {
        return {
          agent_id: agent.agentId,
          persona: agent.persona,
          verdict: 'ignored',
          note: 'Reviewed the pull request but did not flag this location.',
        };
      }
      // When one agent contributed >1 finding to this cluster, surface the
      // single worst one: highest severity, then (tie) highest confidence.
      const worst = own.reduce((a, b) => {
        const rankDiff = severityRank(b.finding.severity) - severityRank(a.finding.severity);
        if (rankDiff !== 0) return rankDiff > 0 ? b : a;
        return b.finding.confidence > a.finding.confidence ? b : a;
      });
      return {
        agent_id: agent.agentId,
        persona: agent.persona,
        verdict: worst.finding.severity,
        note: worst.finding.rationale,
      };
    });

    const flagged = takes.filter((t) => t.verdict !== 'ignored');
    const ignored = takes.filter((t) => t.verdict === 'ignored');
    const severitiesDiverge = new Set(flagged.map((t) => t.verdict)).size > 1;
    const isConflict = (flagged.length >= 1 && ignored.length >= 1) || severitiesDiverge;
    if (!isConflict) continue;

    // Deterministic representative file/line/title: highest severity first,
    // then highest confidence, then earliest start_line.
    const sorted = [...members].sort((a, b) => {
      const rankDiff = severityRank(b.finding.severity) - severityRank(a.finding.severity);
      if (rankDiff !== 0) return rankDiff;
      const confDiff = b.finding.confidence - a.finding.confidence;
      if (confDiff !== 0) return confDiff;
      return a.finding.start_line - b.finding.start_line;
    });
    const rep = at(sorted, 0);
    const line = Math.min(...members.map((m) => m.finding.start_line));

    conflicts.push({
      file: rep.finding.file,
      line,
      title: rep.finding.title,
      takes,
    });
  }

  conflicts.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
  return conflicts;
}

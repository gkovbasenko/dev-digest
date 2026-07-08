/**
 * tokenizer adapter — token counter for the repo-map budget search (T3).
 *
 * The repo-map renderer (pipeline/repo-map.ts) binary-searches the largest set
 * of symbols that fits a token budget; that loop calls `count()` ≤ ~13 times.
 *
 * Default impl: js-tiktoken `cl100k_base` (pure-JS, no natives). The encoder is
 * lazy-initialised (loading the BPE ranks is the heavy part) and any failure
 * falls back to the `ceil(chars / 4)` heuristic — the renderer must never throw.
 *
 * Scope: in-process, container-level — usable by any module (repo-intel's
 * repo-map budget search, the context module's per-doc/aggregate token caps).
 * Swappable in tests via a mock counter (ContainerOverrides.tokenizer).
 */
import { getEncoding, type Tiktoken } from 'js-tiktoken';

export interface Tokenizer {
  count(text: string): number;
}

/** Heuristic fallback used before/instead of a real encoder. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * `js-tiktoken`'s BPE merge search is fast on ordinary text (a 400k-char
 * repeated-sentence string encoded in ~35ms in testing) but degrades
 * catastrophically on highly repetitive, short-period input: a mere 20,000
 * chars of `"ab".repeat(...)` took 18+ SECONDS to encode, and 220,000 chars
 * of a single repeated character did not finish within 20s. This is a
 * content-shape problem, not a size problem — a raw length cutoff either
 * misses the pathological case (it's already too slow well under any size
 * that would matter for real docs) or discards precision for every normal
 * large document. `looksDegenerate()` is a cheap (no BPE calls), O(n),
 * windowed distinct-trigram scan: real prose/code/markdown clears the
 * distinct-trigram floor almost immediately in every window; content that's
 * a short repeating pattern throughout a whole window does not. A doc that's
 * flagged gets the `ceil(chars/4)` heuristic instead of an exact count —
 * acceptable for a cap-enforcement caller (Project Context's per-doc/
 * aggregate caps only need to know "over the cap or not"), and a display-only
 * caller (the doc-list `token_count`) shows an approximation for that one
 * pathological/degenerate file instead of hanging the request.
 */
const DEGENERATE_WINDOW_CHARS = 4096;
const DEGENERATE_MIN_DISTINCT_TRIGRAMS = 64;
const DEGENERATE_CHECK_MIN_LENGTH = 512;

export function looksDegenerate(text: string): boolean {
  if (text.length < DEGENERATE_CHECK_MIN_LENGTH) return false;
  for (let start = 0; start < text.length; start += DEGENERATE_WINDOW_CHARS) {
    const window = text.slice(start, start + DEGENERATE_WINDOW_CHARS);
    if (window.length < DEGENERATE_WINDOW_CHARS / 2) continue; // trailing partial window
    const trigrams = new Set<string>();
    for (let i = 0; i + 3 <= window.length; i++) trigrams.add(window.slice(i, i + 3));
    if (trigrams.size < DEGENERATE_MIN_DISTINCT_TRIGRAMS) return true;
  }
  return false;
}

export class TiktokenTokenizer implements Tokenizer {
  private enc?: Tiktoken;
  private broken = false;

  count(text: string): number {
    if (this.broken || looksDegenerate(text)) return approxTokens(text);
    try {
      this.enc ??= getEncoding('cl100k_base');
      return this.enc.encode(text).length;
    } catch {
      // BPE load failed once — don't retry per call; stick to the heuristic.
      this.broken = true;
      return approxTokens(text);
    }
  }
}

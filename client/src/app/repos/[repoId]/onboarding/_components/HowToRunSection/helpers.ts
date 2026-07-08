/** One rendered step of the how-to-run body: either a prose chunk (rendered
 *  as markdown) or a fenced code block (rendered with its own copy control).
 *  The `OnboardingSection` contract has no structured `steps` field — only
 *  `body` markdown — so per-step copy granularity is derived here from the
 *  fenced code blocks the model emits inside `body` (see plan Risks: AC-18
 *  vs contract shape). */
export interface HowToRunStep {
  type: "text" | "code";
  content: string;
  lang?: string;
}

const FENCE_RE = /```(\w*)\n?([\s\S]*?)```/g;

export function parseHowToRunSteps(body: string): HowToRunStep[] {
  const src = body ?? "";
  const steps: HowToRunStep[] = [];
  let lastIndex = 0;
  FENCE_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(src)) !== null) {
    const before = src.slice(lastIndex, match.index).trim();
    if (before) steps.push({ type: "text", content: before });

    const lang = match[1] || undefined;
    const code = (match[2] ?? "").replace(/\n$/, "");
    if (code.trim()) steps.push({ type: "code", content: code, lang });

    lastIndex = FENCE_RE.lastIndex;
  }

  const rest = src.slice(lastIndex).trim();
  if (rest) steps.push({ type: "text", content: rest });

  return steps;
}

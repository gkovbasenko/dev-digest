export const INITIAL_SKILL_VERSION = 1;

// These HTML-comment markers are NOT the same thing as reviewer-core's
// `<untrusted>…</untrusted>` wrapper, and `assemblePrompt`'s INJECTION_GUARD
// system rule does not recognize them. They only mean "show a 'needs
// vetting' badge in the UI until a human enables this skill." If a skill
// body (with these markers still attached) is ever read into an agent
// prompt, it must first be stripped or re-wrapped with reviewer-core's
// `wrapUntrusted()` (from `prompt.ts`) — otherwise the model has zero
// prompt-injection protection on that content. See server/INSIGHTS.md.
export const UNTRUSTED_SKILL_START = '<!-- BEGIN UNTRUSTED SKILL -->';
export const UNTRUSTED_SKILL_END = '<!-- END UNTRUSTED SKILL -->';

#!/usr/bin/env node
// PreToolUse guard for Write/Edit: blocks writes to protected paths regardless
// of what an agent's prompt says. Deny-list (not a jail) — see .claude/agents/README.md.
import { resolve } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";

// Pure, testable core: does `filePath` (resolved against `root`) hit the deny-list?
export function isProtectedPath(filePath, { root, home } = { root: process.cwd(), home: homedir() }) {
  const target = resolve(root, filePath);
  // Paths no agent in this repo should ever write.
  const denied = [
    `${home}/.ssh/`,
    `${home}/.aws/`,
    `${home}/.gnupg/`,
    `${home}/.bashrc`,
    `${home}/.zshrc`,
    `${home}/.profile`,
    `${root}/.git/`,
    `${root}/.claude/settings.json`,
    `${root}/.claude/settings.local.json`,
  ];
  const isEnvFile = /(^|\/)\.env(\.|$)/.test(target);
  return isEnvFile || denied.some((d) => target === d.replace(/\/$/, "") || target.startsWith(d));
}

// When run as the hook (not imported by a test), read the tool call from stdin and gate it.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // PreToolUse hooks receive the tool call as JSON on stdin.
  const raw = await new Promise((r) => {
    let s = "";
    process.stdin.on("data", (c) => (s += c));
    process.stdin.on("end", () => r(s));
  });

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // Deliberate fail-OPEN: this stdin is produced by the Claude Code harness, not
    // by untrusted/attacker content — malformed JSON means a broken harness, not an
    // injection vector. Failing closed would wedge every Write/Edit in the session on
    // one unexpected payload, so we allow and let the call proceed. (The threat this
    // guard defends against arrives as a file_path in *well-formed* tool JSON.)
    process.exit(0);
  }

  const fp = input?.tool_input?.file_path;
  if (!fp) process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  if (isProtectedPath(fp, { root, home: homedir() })) {
    console.error(
      `🚫 Blocked Write/Edit to a protected path: ${resolve(root, fp)}\n` +
        `On the agent-pipeline deny-list (.git internals, credentials, shell rc, ` +
        `Claude settings, .env). If intentional, edit it directly, outside the agent flow.`,
    );
    process.exit(2); // exit 2 = block the tool call; stderr is fed back to the agent
  }
  process.exit(0); // allow
}

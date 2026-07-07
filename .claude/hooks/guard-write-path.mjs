#!/usr/bin/env node
// PreToolUse guard for Write/Edit: blocks writes to protected paths regardless
// of what an agent's prompt says. Deny-list (not a jail) — see .claude/agents/README.md.
import { resolve } from "node:path";
import { homedir } from "node:os";

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
  process.exit(0); // fail open on parse — never wedge the session on malformed input
}

const fp = input?.tool_input?.file_path;
if (!fp) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const target = resolve(root, fp);
const home = homedir();

// Deny-list: paths no agent in this repo should ever write.
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

if (isEnvFile || denied.some((d) => target === d.replace(/\/$/, "") || target.startsWith(d))) {
  console.error(
    `🚫 Blocked Write/Edit to a protected path: ${target}\n` +
      `On the agent-pipeline deny-list (.git internals, credentials, shell rc, ` +
      `Claude settings, .env). If intentional, edit it directly, outside the agent flow.`,
  );
  process.exit(2); // exit 2 = block the tool call; stderr is fed back to the agent
}
process.exit(0); // allow

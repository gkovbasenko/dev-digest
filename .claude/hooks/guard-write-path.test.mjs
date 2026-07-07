// Tests for the Write/Edit path guard. Run: node --test .claude/hooks/guard-write-path.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { isProtectedPath } from "./guard-write-path.mjs";

const ctx = { root: "/repo", home: "/home/dev" };
const allow = (p) => assert.equal(isProtectedPath(p, ctx), false, `expected ALLOW: ${p}`);
const block = (p) => assert.equal(isProtectedPath(p, ctx), true, `expected BLOCK: ${p}`);

test("allows normal source, spec, and plan paths", () => {
  allow("server/src/foo.ts");
  allow("client/src/lib/api.ts");
  allow("specs/SPEC-2026-07-08-x.md");
  allow("docs/plans/x.plan.md");
  allow(".claude/agents/spec-creator.md");
  allow(".claude/hooks/guard-write-path.mjs"); // the guard doesn't lock itself
});

test("blocks .git internals", () => {
  block(".git/config");
  block(".git/hooks/pre-commit");
});

test("blocks Claude settings (both variants)", () => {
  block(".claude/settings.json");
  block(".claude/settings.local.json");
});

test("blocks .env files anywhere in the tree", () => {
  block("server/.env");
  block(".env");
  block(".env.local");
});

test("blocks credential + shell-rc paths under home (absolute)", () => {
  block("/home/dev/.ssh/id_rsa");
  block("/home/dev/.aws/credentials");
  block("/home/dev/.gnupg/secring.gpg");
  block("/home/dev/.zshrc");
  block("/home/dev/.bashrc");
  block("/home/dev/.profile");
});

test("blocks paths that escape the repo root via ..", () => {
  block("../../home/dev/.ssh/id_rsa"); // resolves to /home/dev/.ssh/id_rsa
});

test("does not misfire on lookalike names", () => {
  allow("server/.environment.ts"); // .env-something, not a dotenv file
  allow("client/git/foo.ts"); // 'git' dir, not '.git'
  allow("docs/settings.json"); // not under .claude/
});

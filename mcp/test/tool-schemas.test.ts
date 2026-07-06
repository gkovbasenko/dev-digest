/**
 * Contract tests on each tool's `inputSchema` — flat scalars only, per the
 * plan's design principles (`mcp/src/tools/tool.ts`). Valid inputs must
 * parse; missing/wrong-typed/nested inputs must fail.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getBlastRadiusTool } from '../src/tools/get-blast-radius.js';
import { getConventionsTool } from '../src/tools/get-conventions.js';
import { getFindingsTool } from '../src/tools/get-findings.js';
import { listAgentsTool } from '../src/tools/list-agents.js';
import { runReviewTool } from '../src/tools/run-review.js';
import type { ToolDef } from '../src/tools/tool.js';

function schemaOf(tool: ToolDef<any>): z.ZodObject<any> {
  return z.object(tool.inputSchema);
}

describe('list_agents inputSchema', () => {
  const schema = schemaOf(listAgentsTool);

  it('accepts an empty object', () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('rejects non-object input', () => {
    expect(schema.safeParse(null).success).toBe(false);
    expect(schema.safeParse([]).success).toBe(false);
    expect(schema.safeParse('acme/widgets').success).toBe(false);
  });
});

describe('get_findings inputSchema', () => {
  const schema = schemaOf(getFindingsTool);

  it('accepts a valid flat input', () => {
    expect(schema.safeParse({ repo: 'acme/widgets', pr: 42 }).success).toBe(true);
  });

  it('rejects missing fields', () => {
    expect(schema.safeParse({ repo: 'acme/widgets' }).success).toBe(false);
    expect(schema.safeParse({ pr: 42 }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty repo string', () => {
    expect(schema.safeParse({ repo: '', pr: 42 }).success).toBe(false);
  });

  it('rejects a non-integer pr', () => {
    expect(schema.safeParse({ repo: 'acme/widgets', pr: 42.5 }).success).toBe(false);
    expect(schema.safeParse({ repo: 'acme/widgets', pr: '42' }).success).toBe(false);
  });

  it('rejects a nested object in place of a flat scalar', () => {
    expect(schema.safeParse({ repo: { owner: 'acme', name: 'widgets' }, pr: 42 }).success).toBe(
      false,
    );
  });
});

describe('get_conventions inputSchema', () => {
  const schema = schemaOf(getConventionsTool);

  it('accepts a valid flat input', () => {
    expect(schema.safeParse({ repo: 'acme/widgets' }).success).toBe(true);
  });

  it('rejects a missing or empty repo', () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ repo: '' }).success).toBe(false);
  });

  it('rejects a nested object', () => {
    expect(schema.safeParse({ repo: { owner: 'acme' } }).success).toBe(false);
  });
});

describe('get_blast_radius inputSchema', () => {
  const schema = schemaOf(getBlastRadiusTool);

  it('accepts a valid flat input', () => {
    expect(schema.safeParse({ repo: 'acme/widgets', pr: 7 }).success).toBe(true);
  });

  it('rejects missing pr', () => {
    expect(schema.safeParse({ repo: 'acme/widgets' }).success).toBe(false);
  });
});

describe('run_review inputSchema', () => {
  const schema = schemaOf(runReviewTool);

  it('accepts a valid flat input', () => {
    expect(
      schema.safeParse({ repo: 'acme/widgets', pr: 42, agent: 'security-reviewer' }).success,
    ).toBe(true);
  });

  it('rejects a missing agent', () => {
    expect(schema.safeParse({ repo: 'acme/widgets', pr: 42 }).success).toBe(false);
  });

  it('rejects an empty agent name', () => {
    expect(schema.safeParse({ repo: 'acme/widgets', pr: 42, agent: '' }).success).toBe(false);
  });

  it('rejects a non-positive pr', () => {
    expect(
      schema.safeParse({ repo: 'acme/widgets', pr: 0, agent: 'security-reviewer' }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ repo: 'acme/widgets', pr: -1, agent: 'security-reviewer' }).success,
    ).toBe(false);
  });

  it('rejects a nested object for agent', () => {
    expect(
      schema.safeParse({ repo: 'acme/widgets', pr: 42, agent: { name: 'security-reviewer' } })
        .success,
    ).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { listAgentsTool } from '../src/tools/list-agents.js';
import { AGENTS_FIXTURE } from './fixtures.js';
import { get, mockFetch } from './mock-fetch.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function parse(result: Awaited<ReturnType<typeof listAgentsTool.handler>>): any {
  return JSON.parse(result.content[0]!.text);
}

describe('list_agents', () => {
  it('returns a compact projection (name, provider, model, enabled, description)', async () => {
    mockFetch([get('/agents', AGENTS_FIXTURE)]);

    const result = await listAgentsTool.handler({});
    expect(result.isError).toBeUndefined();

    const body = parse(result);
    expect(body.agents).toHaveLength(AGENTS_FIXTURE.length);
    expect(body.agents[0]).toEqual({
      name: 'security-reviewer',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      enabled: true,
      description: 'Flags security issues',
    });
    // No leakage of fields this tool must not surface (e.g. system_prompt).
    expect(body.agents[0]).not.toHaveProperty('system_prompt');
  });

  it('forwards an actionable error when the API call fails', async () => {
    mockFetch([get('/agents', { message: 'boom' }, 500)]);

    const result = await listAgentsTool.handler({});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('500');
  });
});

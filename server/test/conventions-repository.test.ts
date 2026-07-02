import { describe, it, expect } from 'vitest';
import { ConventionsRepository } from '../src/modules/conventions/repository.js';
import type { Db } from '../src/db/client.js';

/**
 * insertMany([]) short-circuits before ever touching `this.db` — extract()
 * calls insertMany(toInsert) unconditionally after its verify-and-filter
 * loop, so an empty result set (every candidate rejected on evidence, or
 * already-rejected) reaches this exact branch in production. No DB needed
 * to exercise it: the early return happens before any query is built.
 */
describe('ConventionsRepository.insertMany — empty input', () => {
  it('returns an empty array without touching the db', async () => {
    // A fake Db that throws if ever invoked — proves the early return never
    // reaches the query builder.
    const explodingDb = new Proxy(
      {},
      {
        get() {
          throw new Error('insertMany([]) should never touch the db');
        },
      },
    ) as Db;

    const repo = new ConventionsRepository(explodingDb);
    await expect(repo.insertMany([])).resolves.toEqual([]);
  });
});

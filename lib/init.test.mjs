import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInit } from './init.mjs';

test('w pustym repo planuje wszystkie pliki', () => {
  const plan = planInit({ existing: [] });
  const paths = plan.create.map((c) => c.path);
  assert.deepEqual(paths.sort(), ['.github/workflows/knowledge.yml', 'CLAUDE.md', 'docs/DECISIONS.md'].sort());
  assert.deepEqual(plan.skip, []);
});

test('nigdy nie nadpisuje istniejących plików', () => {
  const plan = planInit({ existing: ['docs/DECISIONS.md'] });
  const paths = plan.create.map((c) => c.path);
  assert.ok(!paths.includes('docs/DECISIONS.md'));
  assert.deepEqual(plan.skip, ['docs/DECISIONS.md']);
});

test('istniejący CLAUDE.md jest rozszerzany, nie tworzony', () => {
  const plan = planInit({ existing: ['CLAUDE.md'] });
  assert.ok(!plan.create.some((c) => c.path === 'CLAUDE.md'));
  assert.equal(plan.appendToClaudeMd, true);
  assert.deepEqual(plan.skip, []);
});

test('gdy CLAUDE.md nie istnieje, jest tworzony i nie doklejany', () => {
  const plan = planInit({ existing: [] });
  assert.ok(plan.create.some((c) => c.path === 'CLAUDE.md'));
  assert.equal(plan.appendToClaudeMd, false);
});

test('każdy wpis create ma nazwę szablonu', () => {
  for (const c of planInit({ existing: [] }).create) {
    assert.ok(typeof c.template === 'string' && c.template.length > 0, c.path);
  }
});

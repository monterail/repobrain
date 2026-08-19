import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInit } from './init.mjs';

test('in an empty repo it plans every file', () => {
  const plan = planInit({ existing: [] });
  const paths = plan.create.map((c) => c.path);
  assert.deepEqual(paths.sort(), ['.github/workflows/knowledge.yml', 'CLAUDE.md', 'docs/DECISIONS.md'].sort());
  assert.deepEqual(plan.skip, []);
});

test('it never overwrites existing files', () => {
  const plan = planInit({ existing: ['docs/DECISIONS.md'] });
  const paths = plan.create.map((c) => c.path);
  assert.ok(!paths.includes('docs/DECISIONS.md'));
  assert.deepEqual(plan.skip, ['docs/DECISIONS.md']);
});

test('an existing CLAUDE.md is appended to, not created', () => {
  const plan = planInit({ existing: ['CLAUDE.md'] });
  assert.ok(!plan.create.some((c) => c.path === 'CLAUDE.md'));
  assert.equal(plan.appendToClaudeMd, true);
  assert.deepEqual(plan.skip, []);
});

test('when CLAUDE.md does not exist it is created, not appended to', () => {
  const plan = planInit({ existing: [] });
  assert.ok(plan.create.some((c) => c.path === 'CLAUDE.md'));
  assert.equal(plan.appendToClaudeMd, false);
});

test('every create entry carries a template name', () => {
  for (const c of planInit({ existing: [] }).create) {
    assert.ok(typeof c.template === 'string' && c.template.length > 0, c.path);
  }
});

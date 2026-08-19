import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateIntegrity, gateIndexFresh, gateDecisionRequired } from './gates.mjs';
import { OPEN_MARKER, CLOSE_MARKER } from './render.mjs';

const DECISIONS = `# Decisions

## DEC-001 — 2026-01-05
**Area:** auth
**Topic:** OTP login
**Context:** C
**Decision:** D
**Consequences:** CO
**Decided by:** The team
`;

test('gateIntegrity returns an empty list for a valid file', () => {
  const errors = gateIntegrity({ decisionsText: DECISIONS, clientNames: null, fileExists: () => true });
  assert.deepEqual(errors, []);
});

test('gateIntegrity aggregates parser, relation and integrity errors', () => {
  const bad = `## Note
## DEC-002 — 2026-02-01
**Reverses:** DEC-999
**Topic:** [fill in]
**Context:** C
**Decision:** D
**Consequences:** CO
**Decided by:** T
`;
  const errors = gateIntegrity({ decisionsText: bad, clientNames: null, fileExists: () => true });
  assert.ok(errors.length >= 3, `expected >=3 errors, got ${errors.length}: ${errors.join(' | ')}`);
  assert.ok(errors.some((e) => /is not a valid DEC entry/.test(e)));
  assert.ok(errors.some((e) => /DEC-999/.test(e)));
  assert.ok(errors.some((e) => /fill in/.test(e)));
});

test('gateIndexFresh passes when the block is up to date', () => {
  const fresh = `# P\n\n${OPEN_MARKER}\n| DEC | Date | Area | Topic |\n|-----|------|------|-------|\n| DEC-001 | 2026-01-05 | auth | OTP login |\n${CLOSE_MARKER}\n`;
  assert.deepEqual(gateIndexFresh({ decisionsText: DECISIONS, claudeMdText: fresh }), []);
});

test('gateIndexFresh detects a stale block', () => {
  const stale = `# P\n\n${OPEN_MARKER}\nold\n${CLOSE_MARKER}\n`;
  const errors = gateIndexFresh({ decisionsText: DECISIONS, claudeMdText: stale });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /index/);
});

test('gateIndexFresh reports missing markers instead of throwing', () => {
  const errors = gateIndexFresh({ decisionsText: DECISIONS, claudeMdText: '# P\nno markers\n' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /init/);
});

test('gateDecisionRequired lets through a PR outside the decision paths', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['src/button.tsx'], paths: ['docs/specs/**'], labels: [],
  });
  assert.deepEqual(errors, []);
});

test('gateDecisionRequired blocks a change on a decision path without DECISIONS.md', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['docs/specs/M01.md'], paths: ['docs/specs/**'], labels: [],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /docs\/specs\/M01\.md/);
  assert.match(errors[0], /no-decision/);
});

test('gateDecisionRequired lets through when DECISIONS.md changed too', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['docs/specs/M01.md', 'docs/DECISIONS.md'], paths: ['docs/specs/**'], labels: [],
  });
  assert.deepEqual(errors, []);
});

test('the no-decision label opens the back door', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['docs/specs/M01.md'], paths: ['docs/specs/**'], labels: ['no-decision'],
  });
  assert.deepEqual(errors, []);
});

test('the ** pattern matches nested directories, * does not cross the separator', () => {
  assert.equal(gateDecisionRequired({
    changedFiles: ['a/b/c/pricing.ts'], paths: ['**/pricing*'], labels: [],
  }).length, 1);
  assert.deepEqual(gateDecisionRequired({
    changedFiles: ['a/b/x.ts'], paths: ['a/*.ts'], labels: [],
  }), []);
});

test('a leading ./ does not cause a false alarm', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['docs/specs/M01.md', './docs/DECISIONS.md'],
    paths: ['docs/specs/**'], labels: [],
  });
  assert.deepEqual(errors, [], 'DECISIONS.md was touched — the gate must stay silent');
});

test('a leading ./ does not let you bypass the gate', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['./docs/specs/M01.md'],
    paths: ['docs/specs/**'], labels: [],
  });
  assert.equal(errors.length, 1, 'a change on a decision path must be detected despite the prefix');
});

test('gateIndexFresh stays silent on relation errors — integrity reports them', () => {
  const badRelations = [
    '## DEC-002 — 2026-02-01',
    '**Reverses:** DEC-999',
    '**Topic:** T',
    '**Context:** C',
    '**Decision:** D',
    '**Consequences:** CO',
    '**Decided by:** T',
    '',
  ].join('\n');
  const stale = `# P\n\n${OPEN_MARKER}\ndeliberately stale\n${CLOSE_MARKER}\n`;

  assert.deepEqual(
    gateIndexFresh({ decisionsText: badRelations, claudeMdText: stale }),
    [],
    'with broken relations the index cannot be compared — no noise',
  );
  assert.equal(
    gateIntegrity({ decisionsText: badRelations, clientNames: null, fileExists: () => true }).length,
    1,
    'the real error is reported by integrity',
  );
});

test('normalisation covers every way of writing a path', () => {
  const variants = [
    './docs/specs/M01.md',
    './/docs/specs/M01.md',
    '././docs/specs/M01.md',
    'docs/./specs/M01.md',
  ];
  for (const f of variants) {
    assert.equal(
      gateDecisionRequired({ changedFiles: [f], paths: ['docs/specs/**'], labels: [] }).length,
      1,
      `variant ${f} must be detected — otherwise the gate quietly stops enforcing`,
    );
  }
});

test('normalisation recognises DECISIONS.md in every spelling', () => {
  for (const f of ['docs/DECISIONS.md', './docs/DECISIONS.md', './/docs/DECISIONS.md', 'docs/./DECISIONS.md']) {
    assert.deepEqual(
      gateDecisionRequired({ changedFiles: ['docs/specs/M01.md', f], paths: ['docs/specs/**'], labels: [] }),
      [],
      `variant ${f} must be recognised as DECISIONS.md being touched`,
    );
  }
});

test('normalisation does not break paths starting with a dot', () => {
  assert.equal(
    gateDecisionRequired({ changedFiles: ['.github/workflows/knowledge.yml'], paths: ['.github/**'], labels: [] }).length,
    1,
    '.github must not be truncated by normalisation',
  );
});

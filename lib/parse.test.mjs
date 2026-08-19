import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecisions } from './parse.mjs';

const VALID = `# Decisions

## DEC-039 — 2026-07-20
**Changes:** DEC-036
**Area:** billing, webhooks
**Scope:** in scope
**Source:** Transcripts/2026-07-20-call.md
**Topic:** Correcting invoice outside the limit
**Context:** The client clarified the behaviour.
**Decision:** It does not count towards the limit.
**Consequences:** A change in how the limit is computed.
**Decided by:** Smith — call 2026-07-20
`;

test('parses a complete entry with every field', () => {
  const { decs, errors } = parseDecisions(VALID);
  assert.deepEqual(errors, []);
  assert.equal(decs.length, 1);
  const d = decs[0];
  assert.equal(d.id, 'DEC-039');
  assert.equal(d.num, 39);
  assert.equal(d.date, '2026-07-20');
  assert.equal(d.changes, 'DEC-036');
  assert.equal(d.reverses, null);
  assert.deepEqual(d.area, ['billing', 'webhooks']);
  assert.equal(d.scope, 'in scope');
  assert.equal(d.source, 'Transcripts/2026-07-20-call.md');
  assert.equal(d.topic, 'Correcting invoice outside the limit');
  assert.equal(d.decidedBy, 'Smith — call 2026-07-20');
  assert.equal(d.line, 3);
});

test('accepts the separators -, – and —', () => {
  for (const sep of ['-', '–', '—']) {
    const text = VALID.replace('—', sep);
    const { decs, errors } = parseDecisions(text);
    assert.deepEqual(errors, [], `separator ${sep}`);
    assert.equal(decs[0].date, '2026-07-20');
  }
});

test('optional fields are null or an empty list when absent', () => {
  const minimal = `## DEC-001 — 2026-01-05
**Topic:** T
**Context:** C
**Decision:** D
**Consequences:** CO
**Decided by:** The team
`;
  const { decs, errors } = parseDecisions(minimal);
  assert.deepEqual(errors, []);
  assert.equal(decs[0].reverses, null);
  assert.equal(decs[0].changes, null);
  assert.equal(decs[0].scope, null);
  assert.equal(decs[0].source, null);
  assert.deepEqual(decs[0].area, []);
});

test('reports a missing required field with a line number', () => {
  const missing = `## DEC-001 — 2026-01-05
**Topic:** T
**Context:** C
**Decision:** D
**Decided by:** The team
`;
  const { errors } = parseDecisions(missing);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^1: /);
  assert.match(errors[0], /Consequences/);
});

test('rejects a date without leading zeros', () => {
  const bad = `## DEC-041 — 2026-9-3
**Topic:** T
**Context:** C
**Decision:** D
**Consequences:** CO
**Decided by:** T
`;
  const { decs, errors } = parseDecisions(bad);
  assert.equal(decs.length, 0);
  assert.equal(errors.length, 1);
});

test('rejects an invalid Scope value', () => {
  const bad = VALID.replace('**Scope:** in scope', '**Scope:** free');
  const { errors } = parseDecisions(bad);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Scope/);
});

test('normalises the ID to three digits', () => {
  const short = `## DEC-7 — 2026-01-05
**Topic:** T
**Context:** C
**Decision:** D
**Consequences:** CO
**Decided by:** T
`;
  const { decs } = parseDecisions(short);
  assert.equal(decs[0].id, 'DEC-007');
  assert.equal(decs[0].num, 7);
});

test('an entry with an invalid Scope does not reach decs', () => {
  const bad = VALID.replace('**Scope:** in scope', '**Scope:** free');
  const { decs, errors } = parseDecisions(bad);
  assert.equal(errors.length, 1);
  assert.equal(decs.length, 0, 'an entry with a bad Scope value must not leak into decs');
});

test('skips headings and fields inside fenced blocks', () => {
  const text = [
    '### Entry format',
    '',
    '```markdown',
    '## DEC-NNN — YYYY-MM-DD',
    '**Topic:** example from the documentation',
    '```',
    '',
    '## DEC-001 — 2026-01-05',
    '**Topic:** T',
    '**Context:** C',
    '**Decision:** D',
    '**Consequences:** CO',
    '**Decided by:** T',
    '',
  ].join('\n');

  const { decs, errors } = parseDecisions(text);
  assert.deepEqual(errors, [], 'an example in a code block must not be an error');
  assert.equal(decs.length, 1);
  assert.equal(decs[0].id, 'DEC-001');
  assert.equal(decs[0].topic, 'T', 'a field from a code block must not overwrite a real entry');
});

test('an unclosed fence is an error, not a silent swallowing of the file', () => {
  const text = [
    '```markdown',
    '## DEC-NNN — YYYY-MM-DD',
    '',
    '## DEC-001 — 2026-01-05',
    '**Topic:** T',
    '**Context:** C',
    '**Decision:** D',
    '**Consequences:** CO',
    '**Decided by:** T',
    '',
  ].join('\n');

  const { errors } = parseDecisions(text);
  assert.equal(errors.length, 1, 'an unclosed fence must produce exactly one error');
  assert.match(errors[0], /^1: /, 'the error points at the opening fence line');
});

test('a fenced snippet inside an entry field does not truncate the block', () => {
  const text = [
    '## DEC-001 — 2026-01-05',
    '**Topic:** T',
    '**Context:** We considered a heading like this in the docs:',
    '```markdown',
    '## This is not a DEC entry',
    '```',
    '**Decision:** D',
    '**Consequences:** CO',
    '**Decided by:** T',
    '',
  ].join('\n');

  const { decs, errors } = parseDecisions(text);
  assert.deepEqual(errors, [], 'a fenced heading inside a field must not be an error');
  assert.equal(decs.length, 1);
  assert.equal(decs[0].decision, 'D', 'fields after the fence must still parse');
  assert.equal(decs[0].decidedBy, 'T');
});

test('a non-DEC heading is a hard error, not a silent skip', () => {
  const text = `## Refinement notes
Some text here.

## DEC-001 — 2026-01-05
**Topic:** T
**Context:** C
**Decision:** D
**Consequences:** CO
**Decided by:** T
`;
  const { decs, errors } = parseDecisions(text);
  assert.equal(decs.length, 1, 'the valid entry still parses');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^1: /);
  assert.match(errors[0], /is not a valid DEC entry/);
});

test('a first-level heading (#) is not an error', () => {
  const text = `# PROJECT — Decision Log

Preamble.

## DEC-001 — 2026-01-05
**Topic:** T
**Context:** C
**Decision:** D
**Consequences:** CO
**Decided by:** T
`;
  const { decs, errors } = parseDecisions(text);
  assert.deepEqual(errors, []);
  assert.equal(decs.length, 1);
});

test('a wrong ID prefix is a heading error', () => {
  const { decs, errors } = parseDecisions(`## DECISION-1 — 2026-01-05
**Topic:** T
`);
  assert.equal(decs.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /is not a valid DEC entry/);
});

test('an empty file produces no errors', () => {
  const { decs, errors } = parseDecisions('');
  assert.deepEqual(decs, []);
  assert.deepEqual(errors, []);
});

test('a fenced block after an entry does not hijack its fields', () => {
  const entry = (n, d, t) => [
    `## DEC-${n} — ${d}`, '**Area:** process', `**Topic:** ${t}`,
    '**Context:** C', '**Decision:** D', '**Consequences:** CO', '**Decided by:** The team', '',
  ].join('\n');

  const text = [
    '# Log', '',
    entry('001', '2026-01-01', 'First decision'),
    entry('002', '2026-02-01', 'Second decision'),
    '### Cheat sheet', '', '```markdown',
    '**Reverses:** DEC-001',
    '**Topic:** example from the documentation',
    '```', '',
  ].join('\n');

  const { decs, errors } = parseDecisions(text);
  assert.deepEqual(errors, []);
  const dec2 = decs.find((d) => d.id === 'DEC-002');
  assert.equal(dec2.topic, 'Second decision', "an entry's topic must not be overwritten by an example in a block");
  assert.equal(dec2.reverses, null, 'an example in a block must not fabricate a relation');
});

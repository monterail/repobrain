import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIntegrity } from './integrity.mjs';

const dec = (extra = {}) => ({
  id: 'DEC-001', num: 1, date: '2026-01-01', line: 3,
  reverses: null, changes: null, area: [], scope: null, source: null,
  topic: 'T', context: 'C', decision: 'D', consequences: 'CO', decidedBy: 'The team',
  ...extra,
});

const base = { clientNames: null, fileExists: () => true, rawText: '' };

test('a Source pointing at an existing file is OK', () => {
  const errors = checkIntegrity({ ...base, decs: [dec({ source: 'Transcripts/a.md' })] });
  assert.deepEqual(errors, []);
});

test('a Source pointing at a missing file is an error', () => {
  const errors = checkIntegrity({
    ...base, fileExists: () => false, decs: [dec({ source: 'Transcripts/missing.md' })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Transcripts\/missing\.md/);
});

test('a client decision without a Source is an error when clientNames is given', () => {
  const errors = checkIntegrity({
    ...base, clientNames: 'Smith, client', decs: [dec({ decidedBy: 'Smith — call' })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Source/);
});

test('a team decision without a Source is OK', () => {
  const errors = checkIntegrity({
    ...base, clientNames: 'Smith, client', decs: [dec({ decidedBy: 'The team — standup' })],
  });
  assert.deepEqual(errors, []);
});

test('without clientNames the rule does not apply', () => {
  const errors = checkIntegrity({ ...base, decs: [dec({ decidedBy: 'Smith' })] });
  assert.deepEqual(errors, []);
});

test('detects placeholders from the closed list', () => {
  const raw = `## DEC-001 — 2026-01-01
**Decided by:** [fill in]
**Topic:** something [date] here
`;
  const errors = checkIntegrity({ ...base, rawText: raw, decs: [] });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /^2: /);
  assert.match(errors[0], /\[fill in\]/);
  assert.match(errors[1], /^3: /);
});

test('brackets in the content are not placeholders', () => {
  const raw = `**Decision:** We show a [warning modal] before [account deletion], the [id] field stays.\n`;
  const errors = checkIntegrity({ ...base, rawText: raw, decs: [] });
  assert.deepEqual(errors, [], 'legitimate brackets in the content must not raise false alarms');
});

test('TODO in the content is a placeholder', () => {
  const errors = checkIntegrity({ ...base, rawText: 'TODO: write this up\n', decs: [] });
  assert.equal(errors.length, 1);
});

// Security tests: verifying the vulnerabilities are gone
test('an invalid regular expression in the names does not throw — it is plain text', () => {
  const errors = checkIntegrity({
    ...base, clientNames: '[unclosed', decs: [dec({ decidedBy: 'Smith' })],
  });
  assert.deepEqual(errors, [], 'a bracket is now an ordinary character, not syntax');
});

test('a catastrophic pattern is an ordinary substring and does not hang', () => {
  // Important: on a string of only 'a' the pattern (a+)+$ matches IMMEDIATELY
  // (the exponential number of combinations is never tried).
  // To trigger catastrophic backtracking in the old RegExp implementation you
  // need a string on which the match FAILS — then the engine walks every
  // possibility. The trailing '!' guarantees failure, and 40 characters are
  // enough to make the old implementation hang for several seconds.
  // NEVER remove that '!' — the test would be useless.
  const decidedByFailingMatch = 'a'.repeat(40) + '!';
  const errors = checkIntegrity({
    ...base, clientNames: '(a+)+$', decs: [dec({ decidedBy: decidedByFailingMatch })],
  });
  assert.deepEqual(errors, [], 'no match and no hang — instead of backtracking in the old implementation');
});

test('an empty list and punctuation alone disable the rule', () => {
  for (const value of [null, '', '  ', ',', ' , , ']) {
    const errors = checkIntegrity({
      ...base, clientNames: value, decs: [dec({ decidedBy: 'Smith' })],
    });
    assert.deepEqual(errors, [], `the value ${JSON.stringify(value)} must disable the rule`);
  }
});

test('substring matching is deliberately loose', () => {
  // Swapping RegExp for substring matching is safer in direction: a false ALARM
  // (demanding Source where it is not needed) beats a false MISS (overlooking a
  // client decision). It is still a trade-off and must be explicit.
  // The name 'Jo' hits 'Joseph', 'Johanna', 'Major' — that is accepted, but
  // without this test it could disappear in a refactor.
  const errors = checkIntegrity({
    ...base, clientNames: 'Jo', decs: [dec({ decidedBy: 'Major of the team' })],
  });
  assert.equal(errors.length, 1, 'a short name hits a wider string — a deliberately accepted trade-off');
});

test('a placeholder inside a fenced block is an example, not an unfilled field', () => {
  const raw = [
    '# Format documentation',
    '',
    '```markdown',
    '**Decided by:** [fill in]',
    '**Topic:** [date]',
    'TODO: an example in the documentation',
    '```',
    '',
  ].join('\n');
  assert.deepEqual(
    checkIntegrity({ ...base, rawText: raw, decs: [] }),
    [],
    'the code block documents the format — these are not unfilled fields',
  );
});

test('a placeholder OUTSIDE a block is still an error', () => {
  const raw = ['**Decided by:** [fill in]', ''].join('\n');
  const errors = checkIntegrity({ ...base, rawText: raw, decs: [] });
  assert.equal(errors.length, 1, 'outside a block the rule applies unchanged');
  assert.match(errors[0], /^1: /);
});

test('a placeholder in a fence INSIDE a DEC entry is still an error', () => {
  const raw = [
    '# Decision log',
    '',
    '## DEC-001 — 2026-01-05',
    '**Topic:** T',
    '**Context:** C',
    '**Decision:** We agreed that:',
    '```',
    'value = [TBD]',
    '```',
    '**Consequences:** CO',
    '**Decided by:** The team',
    '',
  ].join('\n');

  const errors = checkIntegrity({ ...base, rawText: raw, decs: [] });
  assert.equal(errors.length, 1, 'a code block must not be a back door to an incomplete entry');
  assert.match(errors[0], /TBD/);
});

test('a placeholder in a fence in the PREAMBLE is still an example', () => {
  const raw = [
    '# Decision log',
    '',
    '### Entry format',
    '```markdown',
    '**Decided by:** [fill in]',
    '```',
    '',
    '## DEC-001 — 2026-01-05',
    '**Topic:** T',
    '**Context:** C',
    '**Decision:** D',
    '**Consequences:** CO',
    '**Decided by:** The team',
    '',
  ].join('\n');

  assert.deepEqual(
    checkIntegrity({ ...base, rawText: raw, decs: [] }),
    [],
    'format documentation before the first entry stays exempt',
  );
});

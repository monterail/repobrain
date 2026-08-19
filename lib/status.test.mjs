// lib/status.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStatus } from './status.mjs';
import { parseDecisions } from './parse.mjs';

const dec = (num, date, extra = {}) => ({
  id: `DEC-${String(num).padStart(3, '0')}`,
  num, date, line: num,
  reverses: null, changes: null, area: [], scope: null, source: null,
  topic: `T${num}`, context: 'C', decision: 'D', consequences: 'CO', decidedBy: 'T',
  ...extra,
});

test('an entry with no relation is active', () => {
  const { active, history, errors } = deriveStatus([dec(1, '2026-01-01')]);
  assert.deepEqual(errors, []);
  assert.equal(active.length, 1);
  assert.deepEqual(active[0].changedBy, []);
  assert.equal(history.length, 0);
});

test('Reverses moves the target into history', () => {
  const decs = [dec(1, '2026-01-01'), dec(2, '2026-02-01', { reverses: 'DEC-001' })];
  const { active, history } = deriveStatus(decs);
  assert.deepEqual(active.map((a) => a.dec.id), ['DEC-002']);
  assert.equal(history.length, 1);
  assert.equal(history[0].dec.id, 'DEC-001');
  assert.equal(history[0].reversedBy, 'DEC-002');
});

test('Changes leaves the target active and annotates it', () => {
  const decs = [dec(1, '2026-01-01'), dec(2, '2026-02-01', { changes: 'DEC-001' })];
  const { active, history } = deriveStatus(decs);
  assert.equal(history.length, 0);
  assert.equal(active.length, 2);
  const target = active.find((a) => a.dec.id === 'DEC-001');
  assert.deepEqual(target.changedBy, ['DEC-002']);
});

test('a chain of reversals leaves only the last one active', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-02-01', { reverses: 'DEC-001' }),
    dec(3, '2026-03-01', { reverses: 'DEC-002' }),
  ];
  const { active } = deriveStatus(decs);
  assert.deepEqual(active.map((a) => a.dec.id), ['DEC-003']);
});

test('several entries may change the same target', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-02-01', { changes: 'DEC-001' }),
    dec(3, '2026-03-01', { changes: 'DEC-001' }),
  ];
  const { active } = deriveStatus(decs);
  const target = active.find((a) => a.dec.id === 'DEC-001');
  assert.deepEqual(target.changedBy, ['DEC-002', 'DEC-003']);
});

test('active entries are sorted by date, descending', () => {
  const decs = [dec(1, '2026-01-01'), dec(2, '2026-03-01'), dec(3, '2026-02-01')];
  const { active } = deriveStatus(decs);
  assert.deepEqual(active.map((a) => a.dec.id), ['DEC-002', 'DEC-003', 'DEC-001']);
});

test('a changing entry that was itself reversed no longer annotates the target', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-02-01', { changes: 'DEC-001' }),
    dec(3, '2026-03-01', { reverses: 'DEC-002' }),
  ];
  const { active, history } = deriveStatus(decs);

  const target = active.find((a) => a.dec.id === 'DEC-001');
  assert.ok(target, 'DEC-001 stays active');
  assert.deepEqual(target.changedBy, [], 'a dead refinement must not annotate the target');

  assert.deepEqual(history.map((h) => h.dec.id), ['DEC-002']);
});

test('a relation to a non-existent DEC is an error', () => {
  const { errors } = deriveStatus([dec(2, '2026-02-01', { reverses: 'DEC-999' })]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /DEC-999/);
  assert.match(errors[0], /does not exist/);
});

test('a forward-pointing relation is an error', () => {
  const decs = [dec(1, '2026-01-01', { reverses: 'DEC-002' }), dec(2, '2026-02-01')];
  const { errors } = deriveStatus(decs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /earlier/);
});

test('on an equal date the ID number decides', () => {
  const decs = [dec(1, '2026-01-01'), dec(2, '2026-01-01', { changes: 'DEC-001' })];
  assert.deepEqual(deriveStatus(decs).errors, [], 'a higher ID may point at a lower one');

  const backwards = [dec(1, '2026-01-01', { changes: 'DEC-002' }), dec(2, '2026-01-01')];
  assert.equal(deriveStatus(backwards).errors.length, 1, 'a lower ID may not point at a higher one');
});

test('a duplicate ID is an error', () => {
  const decs = [dec(1, '2026-01-01'), { ...dec(1, '2026-02-01'), line: 20 }];
  const { errors } = deriveStatus(decs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /duplicate/i);
  assert.match(errors[0], /DEC-001/);
});

test('an entry may not declare both relations at once', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-01-02'),
    dec(3, '2026-02-01', { reverses: 'DEC-001', changes: 'DEC-002' }),
  ];
  const { errors } = deriveStatus(decs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /both/);
});

test('Changes pointing at an already reversed entry surfaces in errors', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-02-01', { reverses: 'DEC-001' }),
    dec(3, '2026-03-01', { changes: 'DEC-001' }),
  ];
  const { errors } = deriveStatus(decs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /reversed/);
});

test('an entry with both relations contributes neither to the graph', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-01-02'),
    dec(3, '2026-02-01', { reverses: 'DEC-001', changes: 'DEC-002' }),
  ];
  const { active, history, errors } = deriveStatus(decs);

  assert.equal(errors.length, 1);
  assert.deepEqual(history, [], 'a rejected entry must not move anyone into history');
  const target = active.find((a) => a.dec.id === 'DEC-002');
  assert.deepEqual(target.changedBy, [], 'a rejected entry must not annotate the target');
  assert.equal(active.length, 3, 'all three entries remain visible');
});

test('a forward-pointing relation does not create a cycle', () => {
  const decs = [
    dec(1, '2026-01-01', { reverses: 'DEC-002' }),
    dec(2, '2026-02-01', { reverses: 'DEC-001' }),
  ];
  const { active, history, errors } = deriveStatus(decs);

  assert.equal(errors.length, 1, 'only the forward reference is an error');
  assert.deepEqual(history.map((h) => h.dec.id), ['DEC-001'], 'only the valid relation takes effect');
  assert.deepEqual(active.map((a) => a.dec.id), ['DEC-002']);
});

test('a relation to a duplicated ID is an error, regardless of entry order', () => {
  const build = (order) => {
    const dupA = { ...dec(1, '2026-01-01'), line: 10 };
    const dupB = { ...dec(1, '2026-06-01'), line: 20 };
    const ref = dec(3, '2026-03-01', { changes: 'DEC-001' });
    return order === 'ab' ? [dupA, dupB, ref] : [dupB, dupA, ref];
  };

  for (const order of ['ab', 'ba']) {
    const { active, errors } = deriveStatus(build(order));
    assert.equal(errors.length, 2, `order ${order}: duplicate + ambiguous target`);
    assert.ok(errors.some((e) => /ambiguous|duplicated/i.test(e)), `order ${order}`);
    const target = active.find((a) => a.dec.id === 'DEC-001');
    assert.deepEqual(target.changedBy, [], `order ${order}: a relation to an ambiguous target does not apply`);
  }
});

test('a duplicate ID is an error — it contributes no relations to the graph', () => {
  const decs = [dec(1, '2026-01-01'), { ...dec(1, '2026-02-01'), line: 20 }, dec(2, '2026-03-01', { changes: 'DEC-001' })];
  const { active, errors } = deriveStatus(decs);
  assert.equal(errors.length, 2, 'duplicate + relation to a duplicated entry');
  assert.ok(errors.some((e) => /duplicate/i.test(e)));
  const target = active.find((a) => a.dec.id === 'DEC-001');
  assert.deepEqual(target.changedBy, [], 'a duplicated entry contributes no relations');
});

test('a relation to a non-existent DEC is an error — the entry contributes no relation', () => {
  const decs = [dec(1, '2026-01-01'), dec(2, '2026-02-01', { reverses: 'DEC-999' })];
  const { active, history, errors } = deriveStatus(decs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /DEC-999/);
  assert.deepEqual(history, [], 'an entry with a broken reverses does not move the target into history');
  assert.equal(active.length, 2, 'both entries remain visible');
});

test('Changes on a reversed entry is an error — the entry contributes no changes to the graph', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-02-01', { reverses: 'DEC-001' }),
    dec(3, '2026-03-01', { changes: 'DEC-001' }),
  ];
  const { active, history, errors } = deriveStatus(decs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /reversed/);
  assert.equal(history.length, 1, 'DEC-001 is in history, reversed by DEC-002');
  const inHistory = history.find((h) => h.dec.id === 'DEC-001');
  assert.ok(inHistory, 'DEC-001 visible in history');
  assert.equal(active.length, 2, 'DEC-002 and DEC-003 are active');
});

test('a fabricated reversal does not move a live decision into history', () => {
  // the same file as in lib/parse.test.mjs — we check the end result, not just the parser
  const entry = (n, d, t) => [
    `## DEC-${n} — ${d}`, '**Area:** process', `**Topic:** ${t}`,
    '**Context:** C', '**Decision:** D', '**Consequences:** CO', '**Decided by:** The team', '',
  ].join('\n');
  const text = [
    '# Log', '',
    entry('001', '2026-01-01', 'First'),
    entry('002', '2026-02-01', 'Second'),
    '### Cheat sheet', '', '```markdown', '**Reverses:** DEC-001', '```', '',
  ].join('\n');

  const { decs } = parseDecisions(text);
  const { active, history } = deriveStatus(decs);
  assert.deepEqual(history, [], 'no decision may land in history because of an example in the documentation');
  assert.equal(active.length, 2, 'both decisions stay active');
});

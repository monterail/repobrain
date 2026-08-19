// lib/render.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlock, spliceBlock, OPEN_MARKER, CLOSE_MARKER } from './render.mjs';

const dec = (num, date, topic, area = []) => ({
  id: `DEC-${String(num).padStart(3, '0')}`, num, date, topic, area,
  line: num, reverses: null, changes: null, scope: null, source: null,
  context: 'C', decision: 'D', consequences: 'CO', decidedBy: 'T',
});

test('renders the table of active decisions', () => {
  const out = renderBlock({
    active: [{ dec: dec(2, '2026-02-01', 'Second topic', ['auth']), changedBy: [] }],
    history: [],
  });
  assert.match(out, /\| DEC \| Date \| Area \| Topic \|/);
  assert.match(out, /\| DEC-002 \| 2026-02-01 \| auth \| Second topic \|/);
});

test('annotates entries changed by later ones', () => {
  const out = renderBlock({
    active: [{ dec: dec(1, '2026-01-01', 'First'), changedBy: ['DEC-002'] }],
    history: [],
  });
  assert.match(out, /First \*\(changed by DEC-002\)\*/);
});

test('the history section appears only when something was reversed', () => {
  const without = renderBlock({ active: [{ dec: dec(1, '2026-01-01', 'A'), changedBy: [] }], history: [] });
  assert.doesNotMatch(without, /Reversed/);

  const with_ = renderBlock({
    active: [],
    history: [{ dec: dec(1, '2026-01-01', 'A'), reversedBy: 'DEC-002' }],
  });
  assert.match(with_, /Reversed/);
  assert.match(with_, /DEC-001.*reversed by DEC-002/);
});

test('an empty set gives a readable message, not an empty table', () => {
  const out = renderBlock({ active: [], history: [] });
  assert.match(out, /No active decisions/);
});

test('escapes the pipe character in content so the table does not break', () => {
  const out = renderBlock({
    active: [{ dec: dec(1, '2026-01-01', 'A | B'), changedBy: [] }],
    history: [],
  });
  assert.match(out, /A \\\| B/);
});

test('spliceBlock replaces the content between the markers', () => {
  const md = `# Project\n\nText before.\n\n${OPEN_MARKER}\nold content\n${CLOSE_MARKER}\n\nText after.\n`;
  const out = spliceBlock(md, 'new content');
  assert.match(out, /new content/);
  assert.doesNotMatch(out, /old content/);
  assert.match(out, /Text before\./);
  assert.match(out, /Text after\./);
  assert.equal(out.match(new RegExp(CLOSE_MARKER.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&'), 'g')).length, 1);
});

test('spliceBlock is idempotent', () => {
  const md = `${OPEN_MARKER}\nx\n${CLOSE_MARKER}\n`;
  assert.equal(spliceBlock(spliceBlock(md, 'y'), 'y'), spliceBlock(md, 'y'));
});

test('missing markers is an error pointing at init, not an append at the end', () => {
  assert.throws(() => spliceBlock('# Project\nno markers here\n', 'x'), /init/);
});

test('an opening marker without a closing one is an error', () => {
  assert.throws(() => spliceBlock(`${OPEN_MARKER}\nx\n`, 'y'), /marker/);
});

test('block content containing a marker does not break the replacement', () => {
  const malicious = renderBlock({
    active: [{ dec: dec(1, '2026-01-01', 'Marker format: <!-- /GENERATED:decisions -->'), changedBy: [] }],
    history: [],
  });
  let md = `# P\n\n${OPEN_MARKER}\nold\n${CLOSE_MARKER}\n\nafter\n`;
  const a = spliceBlock(md, malicious);
  const b = spliceBlock(a, malicious);
  const c = spliceBlock(b, malicious);

  assert.equal(b, c, 'idempotency must hold even for content containing a marker');
  const closing = (c.match(/\/GENERATED:decisions/g) || []).length;
  assert.equal(closing, 1, 'exactly one closing marker');
  assert.ok(c.includes('after'), 'text after the block is preserved');
});

test('two marker pairs is an error, not a silent replacement of the first', () => {
  const md = `${OPEN_MARKER}\na\n${CLOSE_MARKER}\n\n${OPEN_MARKER}\nb\n${CLOSE_MARKER}\n`;
  assert.throws(() => spliceBlock(md, 'x'), /ambiguous/i);
});

test('a closing marker before the opening one is an error', () => {
  const md = `${CLOSE_MARKER}\ncontent\n${OPEN_MARKER}\n`;
  assert.throws(() => spliceBlock(md, 'x'), /marker/i);
});

test('the marker text is pinned to a fixed value', () => {
  assert.equal(OPEN_MARKER, '<!-- GENERATED:decisions — do not edit. Run: node <kit>/bin/knowledge.mjs index -->');
  assert.equal(CLOSE_MARKER, '<!-- /GENERATED:decisions -->');
});

test('escapes the pipe in the Area field too', () => {
  const out = renderBlock({
    active: [{ dec: dec(1, '2026-01-01', 'Topic', ['a | b']), changedBy: [] }],
    history: [],
  });
  assert.match(out, /a \\\| b/);
});

test('a topic containing a literal opening marker raises no false alarm', () => {
  const block = renderBlock({
    active: [{ dec: dec(1, '2026-01-01', `The opening looks like this: ${OPEN_MARKER}`), changedBy: [] }],
    history: [],
  });
  const md = `# P\n\n${OPEN_MARKER}\nold\n${CLOSE_MARKER}\n\nafter\n`;

  const once = spliceBlock(md, block);
  const twice = spliceBlock(once, block);   // without neutralisation this throws "ambiguous markers"

  assert.equal(once, twice, 'idempotency with content containing an opening marker');
  assert.ok(twice.includes('after'), 'text after the block is preserved');
});

test('a stray closing marker BEFORE the opening one does not break the replacement', () => {
  // Order: a fake CLOSE, then the real OPEN..CLOSE pair.
  // Searching from the start of the document would hit the fake one and judge the pair broken.
  const md = `${CLOSE_MARKER}\n\n# P\n\n${OPEN_MARKER}\nold\n${CLOSE_MARKER}\n\nafter\n`;

  const out = spliceBlock(md, 'new content');

  assert.ok(out.includes('new content'), 'the replacement hit the real pair');
  assert.ok(!out.includes('old'), 'the old block content is gone');
  assert.ok(out.includes('after'), 'text after the block is preserved');
});

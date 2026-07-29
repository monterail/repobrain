// lib/render.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBlock, spliceBlock, OPEN_MARKER, CLOSE_MARKER } from './render.mjs';

const dec = (num, date, topic, area = []) => ({
  id: `DEC-${String(num).padStart(3, '0')}`, num, date, topic, area,
  line: num, reverses: null, changes: null, scope: null, source: null,
  context: 'K', decision: 'D', consequences: 'KO', decidedBy: 'Z',
});

test('renderuje tabelę aktywnych decyzji', () => {
  const out = renderBlock({
    active: [{ dec: dec(2, '2026-02-01', 'Drugi temat', ['auth']), changedBy: [] }],
    history: [],
  });
  assert.match(out, /\| DEC \| Data \| Obszar \| Temat \|/);
  assert.match(out, /\| DEC-002 \| 2026-02-01 \| auth \| Drugi temat \|/);
});

test('adnotuje wpisy zmienione przez późniejsze', () => {
  const out = renderBlock({
    active: [{ dec: dec(1, '2026-01-01', 'Pierwszy'), changedBy: ['DEC-002'] }],
    history: [],
  });
  assert.match(out, /Pierwszy \*\(zmienione przez DEC-002\)\*/);
});

test('sekcja historii pojawia się tylko gdy coś odwrócono', () => {
  const bez = renderBlock({ active: [{ dec: dec(1, '2026-01-01', 'A'), changedBy: [] }], history: [] });
  assert.doesNotMatch(bez, /Odwrócone/);

  const z = renderBlock({
    active: [],
    history: [{ dec: dec(1, '2026-01-01', 'A'), reversedBy: 'DEC-002' }],
  });
  assert.match(z, /Odwrócone/);
  assert.match(z, /DEC-001.*odwrócony przez DEC-002/);
});

test('pusty zbiór daje czytelny komunikat, nie pustą tabelę', () => {
  const out = renderBlock({ active: [], history: [] });
  assert.match(out, /Brak aktywnych decyzji/);
});

test('escapuje pionową kreskę w treści, żeby nie rozbić tabeli', () => {
  const out = renderBlock({
    active: [{ dec: dec(1, '2026-01-01', 'A | B'), changedBy: [] }],
    history: [],
  });
  assert.match(out, /A \\\| B/);
});

test('spliceBlock podmienia treść między znacznikami', () => {
  const md = `# Projekt\n\nTekst przed.\n\n${OPEN_MARKER}\nstara treść\n${CLOSE_MARKER}\n\nTekst po.\n`;
  const out = spliceBlock(md, 'nowa treść');
  assert.match(out, /nowa treść/);
  assert.doesNotMatch(out, /stara treść/);
  assert.match(out, /Tekst przed\./);
  assert.match(out, /Tekst po\./);
  assert.equal(out.match(new RegExp(CLOSE_MARKER.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&'), 'g')).length, 1);
});

test('spliceBlock jest idempotentny', () => {
  const md = `${OPEN_MARKER}\nx\n${CLOSE_MARKER}\n`;
  assert.equal(spliceBlock(spliceBlock(md, 'y'), 'y'), spliceBlock(md, 'y'));
});

test('brak znaczników to błąd z instrukcją init, nie dopisanie na końcu', () => {
  assert.throws(() => spliceBlock('# Projekt\nbez znacznikow\n', 'x'), /init/);
});

test('sam znacznik otwierający bez zamykającego to błąd', () => {
  assert.throws(() => spliceBlock(`${OPEN_MARKER}\nx\n`, 'y'), /znacznik/);
});

test('tresc bloku ze znacznikiem nie rozbija podmiany', () => {
  const zlosliwy = renderBlock({
    active: [{ dec: dec(1, '2026-01-01', 'Format znacznika: <!-- /WYGENEROWANE:decyzje -->'), changedBy: [] }],
    history: [],
  });
  let md = `# P\n\n${OPEN_MARKER}\nstare\n${CLOSE_MARKER}\n\npo\n`;
  const a = spliceBlock(md, zlosliwy);
  const b = spliceBlock(a, zlosliwy);
  const c = spliceBlock(b, zlosliwy);

  assert.equal(b, c, 'idempotencja musi trzymac takze przy tresci ze znacznikiem');
  const zamykajace = (c.match(/\/WYGENEROWANE:decyzje/g) || []).length;
  assert.equal(zamykajace, 1, 'dokladnie jeden znacznik zamykajacy');
  assert.ok(c.includes('po'), 'tekst za blokiem zachowany');
});

test('dwie pary znacznikow to blad, nie cicha podmiana pierwszej', () => {
  const md = `${OPEN_MARKER}\na\n${CLOSE_MARKER}\n\n${OPEN_MARKER}\nb\n${CLOSE_MARKER}\n`;
  assert.throws(() => spliceBlock(md, 'x'), /niejednoznacz/i);
});

test('znacznik zamykajacy przed otwierajacym to blad', () => {
  const md = `${CLOSE_MARKER}\ntresc\n${OPEN_MARKER}\n`;
  assert.throws(() => spliceBlock(md, 'x'), /znacznik/i);
});

test('tresc znacznikow jest przypieta do stalej wartosci', () => {
  assert.equal(OPEN_MARKER, '<!-- WYGENEROWANE:decyzje — nie edytuj. Uruchom: npx … index -->');
  assert.equal(CLOSE_MARKER, '<!-- /WYGENEROWANE:decyzje -->');
});

test('escapuje kreske takze w polu Obszar', () => {
  const out = renderBlock({
    active: [{ dec: dec(1, '2026-01-01', 'Temat', ['a | b']), changedBy: [] }],
    history: [],
  });
  assert.match(out, /a \\\| b/);
});

test('temat z doslownym znacznikiem otwierajacym nie daje falszywego alarmu', () => {
  const block = renderBlock({
    active: [{ dec: dec(1, '2026-01-01', `Otwarcie wyglada tak: ${OPEN_MARKER}`), changedBy: [] }],
    history: [],
  });
  const md = `# P\n\n${OPEN_MARKER}\nstare\n${CLOSE_MARKER}\n\npo\n`;

  const raz = spliceBlock(md, block);
  const dwa = spliceBlock(raz, block);   // bez neutralizacji rzuci "niejednoznaczne znaczniki"

  assert.equal(raz, dwa, 'idempotencja przy tresci ze znacznikiem otwierajacym');
  assert.ok(dwa.includes('po'), 'tekst za blokiem zachowany');
});

test('zbladzony znacznik zamykajacy PRZED otwierajacym nie psuje podmiany', () => {
  // Kolejnosc: falszywy CLOSE, potem prawdziwa para OPEN..CLOSE.
  // Szukanie od poczatku dokumentu trafiloby w falszywy i uznalo pare za uszkodzona.
  const md = `${CLOSE_MARKER}\n\n# P\n\n${OPEN_MARKER}\nstare\n${CLOSE_MARKER}\n\npo\n`;

  const out = spliceBlock(md, 'nowa tresc');

  assert.ok(out.includes('nowa tresc'), 'podmiana trafila w prawdziwa pare');
  assert.ok(!out.includes('stare'), 'stara tresc bloku zniknela');
  assert.ok(out.includes('po'), 'tekst za blokiem zachowany');
});

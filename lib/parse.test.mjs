import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecisions } from './parse.mjs';

const VALID = `# Decyzje

## DEC-039 — 2026-07-20
**Zmienia:** DEC-036
**Obszar:** billing, webhooki
**Scope:** w cenie
**Źródło:** Transcripts/2026-07-20-call.md
**Temat:** Faktura korygująca poza limitem
**Kontekst:** Klient doprecyzował zachowanie.
**Decyzja:** Nie wlicza się do limitu.
**Konsekwencje:** Zmiana w liczeniu limitu.
**Podjął:** Kowalska — call 2026-07-20
`;

test('parsuje kompletny wpis ze wszystkimi polami', () => {
  const { decs, errors } = parseDecisions(VALID);
  assert.deepEqual(errors, []);
  assert.equal(decs.length, 1);
  const d = decs[0];
  assert.equal(d.id, 'DEC-039');
  assert.equal(d.num, 39);
  assert.equal(d.date, '2026-07-20');
  assert.equal(d.changes, 'DEC-036');
  assert.equal(d.reverses, null);
  assert.deepEqual(d.area, ['billing', 'webhooki']);
  assert.equal(d.scope, 'w cenie');
  assert.equal(d.source, 'Transcripts/2026-07-20-call.md');
  assert.equal(d.topic, 'Faktura korygująca poza limitem');
  assert.equal(d.decidedBy, 'Kowalska — call 2026-07-20');
  assert.equal(d.line, 3);
});

test('akceptuje separator -, – oraz —', () => {
  for (const sep of ['-', '–', '—']) {
    const text = VALID.replace('—', sep);
    const { decs, errors } = parseDecisions(text);
    assert.deepEqual(errors, [], `separator ${sep}`);
    assert.equal(decs[0].date, '2026-07-20');
  }
});

test('pola opcjonalne są null lub pustą listą, gdy ich brak', () => {
  const minimal = `## DEC-001 — 2026-01-05
**Temat:** T
**Kontekst:** K
**Decyzja:** D
**Konsekwencje:** KO
**Podjął:** Zespół
`;
  const { decs, errors } = parseDecisions(minimal);
  assert.deepEqual(errors, []);
  assert.equal(decs[0].reverses, null);
  assert.equal(decs[0].changes, null);
  assert.equal(decs[0].scope, null);
  assert.equal(decs[0].source, null);
  assert.deepEqual(decs[0].area, []);
});

test('zgłasza brak pola wymaganego z numerem linii', () => {
  const missing = `## DEC-001 — 2026-01-05
**Temat:** T
**Kontekst:** K
**Decyzja:** D
**Podjął:** Zespół
`;
  const { errors } = parseDecisions(missing);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^1: /);
  assert.match(errors[0], /Konsekwencje/);
});

test('odrzuca datę bez zer wiodących', () => {
  const bad = `## DEC-041 — 2026-9-3
**Temat:** T
**Kontekst:** K
**Decyzja:** D
**Konsekwencje:** KO
**Podjął:** Z
`;
  const { decs, errors } = parseDecisions(bad);
  assert.equal(decs.length, 0);
  assert.equal(errors.length, 1);
});

test('odrzuca niedozwoloną wartość Scope', () => {
  const bad = VALID.replace('**Scope:** w cenie', '**Scope:** gratis');
  const { errors } = parseDecisions(bad);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Scope/);
});

test('normalizuje ID do trzech cyfr', () => {
  const short = `## DEC-7 — 2026-01-05
**Temat:** T
**Kontekst:** K
**Decyzja:** D
**Konsekwencje:** KO
**Podjął:** Z
`;
  const { decs } = parseDecisions(short);
  assert.equal(decs[0].id, 'DEC-007');
  assert.equal(decs[0].num, 7);
});

test('wpis z niedozwolonym Scope nie trafia do decs', () => {
  const bad = VALID.replace('**Scope:** w cenie', '**Scope:** gratis');
  const { decs, errors } = parseDecisions(bad);
  assert.equal(errors.length, 1);
  assert.equal(decs.length, 0, 'wpis z bledna wartoscia Scope nie moze przeciekac do decs');
});

test('pomija naglowki i pola wewnatrz blokow ogrodzonych', () => {
  const text = [
    '### Format wpisu',
    '',
    '```markdown',
    '## DEC-NNN — YYYY-MM-DD',
    '**Temat:** przyklad z dokumentacji',
    '```',
    '',
    '## DEC-001 — 2026-01-05',
    '**Temat:** T',
    '**Kontekst:** K',
    '**Decyzja:** D',
    '**Konsekwencje:** KO',
    '**Podjął:** Z',
    '',
  ].join('\n');

  const { decs, errors } = parseDecisions(text);
  assert.deepEqual(errors, [], 'przyklad w bloku kodu nie moze byc bledem');
  assert.equal(decs.length, 1);
  assert.equal(decs[0].id, 'DEC-001');
  assert.equal(decs[0].topic, 'T', 'pole z bloku kodu nie moze nadpisac prawdziwego wpisu');
});

test('niezamkniete ogrodzenie to blad, nie ciche polkniecie pliku', () => {
  const text = [
    '```markdown',
    '## DEC-NNN — YYYY-MM-DD',
    '',
    '## DEC-001 — 2026-01-05',
    '**Temat:** T',
    '**Kontekst:** K',
    '**Decyzja:** D',
    '**Konsekwencje:** KO',
    '**Podjął:** Z',
    '',
  ].join('\n');

  const { errors } = parseDecisions(text);
  assert.equal(errors.length, 1, 'niezamkniete ogrodzenie musi dac dokladnie jeden blad');
  assert.match(errors[0], /^1: /, 'blad wskazuje linie otwierajaca ogrodzenie');
});

test('ogrodzony fragment wewnatrz pola wpisu nie ucina bloku', () => {
  const text = [
    '## DEC-001 — 2026-01-05',
    '**Temat:** T',
    '**Kontekst:** Rozwazalismy taki naglowek w dokumentacji:',
    '```markdown',
    '## To nie jest wpis DEC',
    '```',
    '**Decyzja:** D',
    '**Konsekwencje:** KO',
    '**Podjął:** Z',
    '',
  ].join('\n');

  const { decs, errors } = parseDecisions(text);
  assert.deepEqual(errors, [], 'ogrodzony naglowek w tresci pola nie moze byc bledem');
  assert.equal(decs.length, 1);
  assert.equal(decs[0].decision, 'D', 'pola za ogrodzeniem musza sie sparsowac');
  assert.equal(decs[0].decidedBy, 'Z');
});

test('nagłówek nie-DEC to twardy błąd, nie ciche pominięcie', () => {
  const text = `## Notatki z refinementu
Coś tu piszemy.

## DEC-001 — 2026-01-05
**Temat:** T
**Kontekst:** K
**Decyzja:** D
**Konsekwencje:** KO
**Podjął:** Z
`;
  const { decs, errors } = parseDecisions(text);
  assert.equal(decs.length, 1, 'poprawny wpis nadal się parsuje');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^1: /);
  assert.match(errors[0], /nie jest poprawnym wpisem DEC/);
});

test('nagłówek pierwszego poziomu (#) nie jest błędem', () => {
  const text = `# PROJEKT — Decision Log

Preambuła.

## DEC-001 — 2026-01-05
**Temat:** T
**Kontekst:** K
**Decyzja:** D
**Konsekwencje:** KO
**Podjął:** Z
`;
  const { decs, errors } = parseDecisions(text);
  assert.deepEqual(errors, []);
  assert.equal(decs.length, 1);
});

test('zły prefiks ID to błąd nagłówka', () => {
  const { decs, errors } = parseDecisions(`## DECISION-1 — 2026-01-05
**Temat:** T
`);
  assert.equal(decs.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /nie jest poprawnym wpisem DEC/);
});

test('pusty plik nie generuje błędów', () => {
  const { decs, errors } = parseDecisions('');
  assert.deepEqual(decs, []);
  assert.deepEqual(errors, []);
});

test('blok ogrodzony po wpisie nie przejmuje jego pol', () => {
  const wpis = (n, d, t) => [
    `## DEC-${n} — ${d}`, '**Obszar:** proces', `**Temat:** ${t}`,
    '**Kontekst:** K', '**Decyzja:** D', '**Konsekwencje:** KO', '**Podjął:** Zespol', '',
  ].join('\n');

  const text = [
    '# Log', '',
    wpis('001', '2026-01-01', 'Pierwsza decyzja'),
    wpis('002', '2026-02-01', 'Druga decyzja'),
    '### Sciagawka', '', '```markdown',
    '**Odwraca:** DEC-001',
    '**Temat:** przyklad z dokumentacji',
    '```', '',
  ].join('\n');

  const { decs, errors } = parseDecisions(text);
  assert.deepEqual(errors, []);
  const dec2 = decs.find((d) => d.id === 'DEC-002');
  assert.equal(dec2.topic, 'Druga decyzja', 'temat wpisu nie moze byc nadpisany przez przyklad w bloku');
  assert.equal(dec2.reverses, null, 'przyklad w bloku nie moze sfabrykowac relacji');
});

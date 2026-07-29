import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIntegrity } from './integrity.mjs';

const dec = (extra = {}) => ({
  id: 'DEC-001', num: 1, date: '2026-01-01', line: 3,
  reverses: null, changes: null, area: [], scope: null, source: null,
  topic: 'T', context: 'K', decision: 'D', consequences: 'KO', decidedBy: 'Zespół',
  ...extra,
});

const base = { clientNames: null, fileExists: () => true, rawText: '' };

test('Źródło wskazujące na istniejący plik jest OK', () => {
  const errors = checkIntegrity({ ...base, decs: [dec({ source: 'Transcripts/a.md' })] });
  assert.deepEqual(errors, []);
});

test('Źródło wskazujące na nieistniejący plik to błąd', () => {
  const errors = checkIntegrity({
    ...base, fileExists: () => false, decs: [dec({ source: 'Transcripts/brak.md' })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Transcripts\/brak\.md/);
});

test('decyzja klienta bez Źródła to błąd, gdy podano clientNames', () => {
  const errors = checkIntegrity({
    ...base, clientNames: 'Kowalska, klient', decs: [dec({ decidedBy: 'Kowalska — call' })],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Źródło/);
});

test('decyzja zespołowa bez Źródła jest OK', () => {
  const errors = checkIntegrity({
    ...base, clientNames: 'Kowalska, klient', decs: [dec({ decidedBy: 'Zespół — standup' })],
  });
  assert.deepEqual(errors, []);
});

test('bez clientNames reguła nie działa', () => {
  const errors = checkIntegrity({ ...base, decs: [dec({ decidedBy: 'Kowalska' })] });
  assert.deepEqual(errors, []);
});

test('wykrywa placeholdery z zamkniętej listy', () => {
  const raw = `## DEC-001 — 2026-01-01
**Podjął:** [uzupełnij]
**Temat:** coś [data] tutaj
`;
  const errors = checkIntegrity({ ...base, rawText: raw, decs: [] });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /^2: /);
  assert.match(errors[0], /\[uzupełnij\]/);
  assert.match(errors[1], /^3: /);
});

test('nawias w treści nie jest placeholderem', () => {
  const raw = `**Decyzja:** Pokazujemy [modal z ostrzeżeniem] przed [usuwanie konta], pole [id] zostaje.\n`;
  const errors = checkIntegrity({ ...base, rawText: raw, decs: [] });
  assert.deepEqual(errors, [], 'legalne nawiasy w treści nie mogą dawać fałszywych alarmów');
});

test('TODO w treści jest placeholderem', () => {
  const errors = checkIntegrity({ ...base, rawText: 'TODO: dopisać\n', decs: [] });
  assert.equal(errors.length, 1);
});

// Testy bezpieczeństwa: weryfikacja że podatności zniknęły
test('niepoprawne wyrazenie regularne w nazwach nie rzuca — to zwykly tekst', () => {
  const errors = checkIntegrity({
    ...base, clientNames: '[niedomkniete', decs: [dec({ decidedBy: 'Kowalska' })],
  });
  assert.deepEqual(errors, [], 'nawias to teraz zwykly znak, nie skladnia');
});

test('wzorzec katastrofalny to zwykly podciag, nie zapetla sie', () => {
  // Ważne: na string samych 'a' wzorzec (a+)+$ dopasowuje się NATYCHMIAST
  // (wykładnicza liczba kombinacji nie jest próbowana).
  // Aby wywołać catastrophic backtracking w starej impl z RegExp,
  // potrzebny jest ciąg, na którym dopasowanie ZAWIEDZIE — wtedy silnik
  // przechodzi wszystkie możliwości. Koniec z '!' gwarantuje porażkę,
  // a 40 znaków wystarczy żeby stare wdrażanie zawieszało się przez kilka sekund.
  // NIGDY nie usuwaj tego '!' — test byłby bezużyteczny.
  const decidedByFailingMatch = 'a'.repeat(40) + '!';
  const errors = checkIntegrity({
    ...base, clientNames: '(a+)+$', decs: [dec({ decidedBy: decidedByFailingMatch })],
  });
  assert.deepEqual(errors, [], 'brak dopasowania i brak zawieszenia — zamiast backtrackingu w starej impl');
});

test('pusta lista i sama interpunkcja wylaczaja regule', () => {
  for (const wartosc of [null, '', '  ', ',', ' , , ']) {
    const errors = checkIntegrity({
      ...base, clientNames: wartosc, decs: [dec({ decidedBy: 'Kowalska' })],
    });
    assert.deepEqual(errors, [], `wartosc ${JSON.stringify(wartosc)} ma wylaczac regule`);
  }
});

test('dopasowanie po podciagu jest celowo luzne', () => {
  // Zamiana z RegExp na substring matching jest bezpieczniejsza kierunkowo:
  // fałszywy ALARM (wymagamy Źródła gdzie nie trzeba) jest gorszy niż fałszywy BRAK
  // (przeoczyliśmy decyzję klienta). Jednak to jest kompromis i musi być jawny.
  // Nazwa 'Jo' trafi w 'Jozef', 'Johanna', 'Major' — to jest akceptowane,
  // ale bez tego testu mogłoby zniknąć przy refaktorze.
  const errors = checkIntegrity({
    ...base, clientNames: 'Jo', decs: [dec({ decidedBy: 'Major Zespolu' })],
  });
  assert.equal(errors.length, 1, 'krotka nazwa trafia w szerszy ciag — kompromis przyjety swiadomie');
});

test('placeholder w bloku ogrodzonym to przyklad, nie niewypelnione pole', () => {
  const raw = [
    '# Dokumentacja formatu',
    '',
    '```markdown',
    '**Podjął:** [uzupełnij]',
    '**Temat:** [data]',
    'TODO: przyklad w dokumentacji',
    '```',
    '',
  ].join('\n');
  assert.deepEqual(
    checkIntegrity({ ...base, rawText: raw, decs: [] }),
    [],
    'blok kodu dokumentuje format — to nie sa niewypelnione pola',
  );
});

test('placeholder POZA blokiem nadal jest bledem', () => {
  const raw = ['**Podjął:** [uzupełnij]', ''].join('\n');
  const errors = checkIntegrity({ ...base, rawText: raw, decs: [] });
  assert.equal(errors.length, 1, 'poza blokiem regula obowiazuje bez zmian');
  assert.match(errors[0], /^1: /);
});

test('placeholder w ogrodzeniu WEWNĄTRZ wpisu DEC nadal jest błędem', () => {
  const raw = [
    '# Log decyzji',
    '',
    '## DEC-001 — 2026-01-05',
    '**Temat:** T',
    '**Kontekst:** K',
    '**Decyzja:** Ustalono, że:',
    '```',
    'wartosc = [TBD]',
    '```',
    '**Konsekwencje:** KO',
    '**Podjął:** Zespół',
    '',
  ].join('\n');

  const errors = checkIntegrity({ ...base, rawText: raw, decs: [] });
  assert.equal(errors.length, 1, 'blok kodu nie może być furtką do niekompletnego wpisu');
  assert.match(errors[0], /TBD/);
});

test('placeholder w ogrodzeniu w PREAMBULE to nadal przykład', () => {
  const raw = [
    '# Log decyzji',
    '',
    '### Format wpisu',
    '```markdown',
    '**Podjął:** [uzupełnij]',
    '```',
    '',
    '## DEC-001 — 2026-01-05',
    '**Temat:** T',
    '**Kontekst:** K',
    '**Decyzja:** D',
    '**Konsekwencje:** KO',
    '**Podjął:** Zespół',
    '',
  ].join('\n');

  assert.deepEqual(
    checkIntegrity({ ...base, rawText: raw, decs: [] }),
    [],
    'dokumentacja formatu przed pierwszym wpisem pozostaje wyłączona',
  );
});

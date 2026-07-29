// lib/status.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStatus } from './status.mjs';
import { parseDecisions } from './parse.mjs';

const dec = (num, date, extra = {}) => ({
  id: `DEC-${String(num).padStart(3, '0')}`,
  num, date, line: num,
  reverses: null, changes: null, area: [], scope: null, source: null,
  topic: `T${num}`, context: 'K', decision: 'D', consequences: 'KO', decidedBy: 'Z',
  ...extra,
});

test('wpis bez relacji jest aktywny', () => {
  const { active, history, errors } = deriveStatus([dec(1, '2026-01-01')]);
  assert.deepEqual(errors, []);
  assert.equal(active.length, 1);
  assert.deepEqual(active[0].changedBy, []);
  assert.equal(history.length, 0);
});

test('Odwraca przenosi cel do historii', () => {
  const decs = [dec(1, '2026-01-01'), dec(2, '2026-02-01', { reverses: 'DEC-001' })];
  const { active, history } = deriveStatus(decs);
  assert.deepEqual(active.map((a) => a.dec.id), ['DEC-002']);
  assert.equal(history.length, 1);
  assert.equal(history[0].dec.id, 'DEC-001');
  assert.equal(history[0].reversedBy, 'DEC-002');
});

test('Zmienia zostawia cel aktywnym i adnotuje go', () => {
  const decs = [dec(1, '2026-01-01'), dec(2, '2026-02-01', { changes: 'DEC-001' })];
  const { active, history } = deriveStatus(decs);
  assert.equal(history.length, 0);
  assert.equal(active.length, 2);
  const target = active.find((a) => a.dec.id === 'DEC-001');
  assert.deepEqual(target.changedBy, ['DEC-002']);
});

test('łańcuch odwróceń zostawia aktywnym tylko ostatni', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-02-01', { reverses: 'DEC-001' }),
    dec(3, '2026-03-01', { reverses: 'DEC-002' }),
  ];
  const { active } = deriveStatus(decs);
  assert.deepEqual(active.map((a) => a.dec.id), ['DEC-003']);
});

test('wiele wpisów może zmieniać ten sam cel', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-02-01', { changes: 'DEC-001' }),
    dec(3, '2026-03-01', { changes: 'DEC-001' }),
  ];
  const { active } = deriveStatus(decs);
  const target = active.find((a) => a.dec.id === 'DEC-001');
  assert.deepEqual(target.changedBy, ['DEC-002', 'DEC-003']);
});

test('aktywne są posortowane malejąco po dacie', () => {
  const decs = [dec(1, '2026-01-01'), dec(2, '2026-03-01'), dec(3, '2026-02-01')];
  const { active } = deriveStatus(decs);
  assert.deepEqual(active.map((a) => a.dec.id), ['DEC-002', 'DEC-003', 'DEC-001']);
});

test('wpis zmieniajacy, ktory sam zostal odwrocony, nie adnotuje juz celu', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-02-01', { changes: 'DEC-001' }),
    dec(3, '2026-03-01', { reverses: 'DEC-002' }),
  ];
  const { active, history } = deriveStatus(decs);

  const target = active.find((a) => a.dec.id === 'DEC-001');
  assert.ok(target, 'DEC-001 pozostaje aktywny');
  assert.deepEqual(target.changedBy, [], 'martwe doprecyzowanie nie moze adnotowac celu');

  assert.deepEqual(history.map((h) => h.dec.id), ['DEC-002']);
});

test('relacja do nieistniejącego DEC to błąd', () => {
  const { errors } = deriveStatus([dec(2, '2026-02-01', { reverses: 'DEC-999' })]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /DEC-999/);
  assert.match(errors[0], /nie istnieje/);
});

test('relacja wskazująca w przód to błąd', () => {
  const decs = [dec(1, '2026-01-01', { reverses: 'DEC-002' }), dec(2, '2026-02-01')];
  const { errors } = deriveStatus(decs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /wcześniejszy/);
});

test('przy równej dacie rozstrzyga numer ID', () => {
  const decs = [dec(1, '2026-01-01'), dec(2, '2026-01-01', { changes: 'DEC-001' })];
  assert.deepEqual(deriveStatus(decs).errors, [], 'wyższe ID może wskazywać na niższe');

  const backwards = [dec(1, '2026-01-01', { changes: 'DEC-002' }), dec(2, '2026-01-01')];
  assert.equal(deriveStatus(backwards).errors.length, 1, 'niższe ID nie może wskazywać na wyższe');
});

test('duplikat ID to błąd', () => {
  const decs = [dec(1, '2026-01-01'), { ...dec(1, '2026-02-01'), line: 20 }];
  const { errors } = deriveStatus(decs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /duplikat/i);
  assert.match(errors[0], /DEC-001/);
});

test('wpis nie może deklarować obu relacji naraz', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-01-02'),
    dec(3, '2026-02-01', { reverses: 'DEC-001', changes: 'DEC-002' }),
  ];
  const { errors } = deriveStatus(decs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /jednocześnie/);
});

test('Zmienia na wpis już odwrócony to ostrzeżenie w errors', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-02-01', { reverses: 'DEC-001' }),
    dec(3, '2026-03-01', { changes: 'DEC-001' }),
  ];
  const { errors } = deriveStatus(decs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /odwrócon/);
});

test('wpis z obiema relacjami nie wnosi zadnej z nich do grafu', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-01-02'),
    dec(3, '2026-02-01', { reverses: 'DEC-001', changes: 'DEC-002' }),
  ];
  const { active, history, errors } = deriveStatus(decs);

  assert.equal(errors.length, 1);
  assert.deepEqual(history, [], 'odrzucony wpis nie moze nikogo przenosic do historii');
  const target = active.find((a) => a.dec.id === 'DEC-002');
  assert.deepEqual(target.changedBy, [], 'odrzucony wpis nie moze adnotowac celu');
  assert.equal(active.length, 3, 'wszystkie trzy wpisy pozostaja widoczne');
});

test('relacja wskazujaca w przod nie tworzy cyklu', () => {
  const decs = [
    dec(1, '2026-01-01', { reverses: 'DEC-002' }),
    dec(2, '2026-02-01', { reverses: 'DEC-001' }),
  ];
  const { active, history, errors } = deriveStatus(decs);

  assert.equal(errors.length, 1, 'tylko wskazanie w przod jest bledem');
  assert.deepEqual(history.map((h) => h.dec.id), ['DEC-001'], 'dziala wylacznie poprawna relacja');
  assert.deepEqual(active.map((a) => a.dec.id), ['DEC-002']);
});

test('relacja na zduplikowane ID to blad, niezaleznie od kolejnosci wpisow', () => {
  const build = (order) => {
    const dupA = { ...dec(1, '2026-01-01'), line: 10 };
    const dupB = { ...dec(1, '2026-06-01'), line: 20 };
    const ref = dec(3, '2026-03-01', { changes: 'DEC-001' });
    return order === 'ab' ? [dupA, dupB, ref] : [dupB, dupA, ref];
  };

  for (const order of ['ab', 'ba']) {
    const { active, errors } = deriveStatus(build(order));
    assert.equal(errors.length, 2, `kolejnosc ${order}: duplikat + niejednoznaczny cel`);
    assert.ok(errors.some((e) => /niejednoznacz|zduplikowan/i.test(e)), `kolejnosc ${order}`);
    const target = active.find((a) => a.dec.id === 'DEC-001');
    assert.deepEqual(target.changedBy, [], `kolejnosc ${order}: relacja na niejednoznaczny cel nie dziala`);
  }
});

test('duplikat ID to błąd — nie wnosi żadnych relacji do grafu', () => {
  const decs = [dec(1, '2026-01-01'), { ...dec(1, '2026-02-01'), line: 20 }, dec(2, '2026-03-01', { changes: 'DEC-001' })];
  const { active, errors } = deriveStatus(decs);
  assert.equal(errors.length, 2, 'duplikat + relacja na zduplikowany');
  assert.ok(errors.some((e) => /duplikat/i.test(e)));
  const target = active.find((a) => a.dec.id === 'DEC-001');
  assert.deepEqual(target.changedBy, [], 'zduplikowany wpis nie wnosi relacji');
});

test('relacja do nieistniejącego DEC to błąd — wpis nie wnosi relacji', () => {
  const decs = [dec(1, '2026-01-01'), dec(2, '2026-02-01', { reverses: 'DEC-999' })];
  const { active, history, errors } = deriveStatus(decs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /DEC-999/);
  assert.deepEqual(history, [], 'wpis z błędnym reverses nie przenosi celu do historii');
  assert.equal(active.length, 2, 'oba wpisy pozostają widoczne');
});

test('Zmienia na odwrócony to błąd — wpis nie wnosi zmian do grafu', () => {
  const decs = [
    dec(1, '2026-01-01'),
    dec(2, '2026-02-01', { reverses: 'DEC-001' }),
    dec(3, '2026-03-01', { changes: 'DEC-001' }),
  ];
  const { active, history, errors } = deriveStatus(decs);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /odwrócon/);
  assert.equal(history.length, 1, 'DEC-001 jest w historii, odwrócone przez DEC-002');
  const inHistory = history.find((h) => h.dec.id === 'DEC-001');
  assert.ok(inHistory, 'DEC-001 widoczne w historii');
  assert.equal(active.length, 2, 'DEC-002 i DEC-003 w active');
});

test('sfabrykowane odwrocenie nie przenosi zywej decyzji do historii', () => {
  // ten sam plik co w lib/parse.test.mjs — sprawdzamy skutek koncowy, nie tylko parser
  const wpis = (n, d, t) => [
    `## DEC-${n} — ${d}`, '**Obszar:** proces', `**Temat:** ${t}`,
    '**Kontekst:** K', '**Decyzja:** D', '**Konsekwencje:** KO', '**Podjął:** Zespol', '',
  ].join('\n');
  const text = [
    '# Log', '',
    wpis('001', '2026-01-01', 'Pierwsza'),
    wpis('002', '2026-02-01', 'Druga'),
    '### Sciagawka', '', '```markdown', '**Odwraca:** DEC-001', '```', '',
  ].join('\n');

  const { decs } = parseDecisions(text);
  const { active, history } = deriveStatus(decs);
  assert.deepEqual(history, [], 'zadna decyzja nie moze trafic do historii przez przyklad w dokumentacji');
  assert.equal(active.length, 2, 'obie decyzje pozostaja aktywne');
});

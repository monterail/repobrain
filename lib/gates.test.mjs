import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateIntegrity, gateIndexFresh, gateDecisionRequired } from './gates.mjs';
import { OPEN_MARKER, CLOSE_MARKER } from './render.mjs';

const DECISIONS = `# Decyzje

## DEC-001 — 2026-01-05
**Obszar:** auth
**Temat:** Logowanie przez OTP
**Kontekst:** K
**Decyzja:** D
**Konsekwencje:** KO
**Podjął:** Zespół
`;

test('gateIntegrity zwraca pustą listę dla poprawnego pliku', () => {
  const errors = gateIntegrity({ decisionsText: DECISIONS, clientNames: null, fileExists: () => true });
  assert.deepEqual(errors, []);
});

test('gateIntegrity agreguje błędy parsera, relacji i integralności', () => {
  const bad = `## Notatka
## DEC-002 — 2026-02-01
**Odwraca:** DEC-999
**Temat:** [uzupełnij]
**Kontekst:** K
**Decyzja:** D
**Konsekwencje:** KO
**Podjął:** Z
`;
  const errors = gateIntegrity({ decisionsText: bad, clientNames: null, fileExists: () => true });
  assert.ok(errors.length >= 3, `oczekiwano >=3 bledow, otrzymano ${errors.length}: ${errors.join(' | ')}`);
  assert.ok(errors.some((e) => /nie jest poprawnym wpisem DEC/.test(e)));
  assert.ok(errors.some((e) => /DEC-999/.test(e)));
  assert.ok(errors.some((e) => /uzupełnij/.test(e)));
});

test('gateIndexFresh przechodzi, gdy blok jest aktualny', () => {
  const fresh = `# P\n\n${OPEN_MARKER}\n| DEC | Data | Obszar | Temat |\n|-----|------|--------|-------|\n| DEC-001 | 2026-01-05 | auth | Logowanie przez OTP |\n${CLOSE_MARKER}\n`;
  assert.deepEqual(gateIndexFresh({ decisionsText: DECISIONS, claudeMdText: fresh }), []);
});

test('gateIndexFresh wykrywa nieaktualny blok', () => {
  const stale = `# P\n\n${OPEN_MARKER}\nstare\n${CLOSE_MARKER}\n`;
  const errors = gateIndexFresh({ decisionsText: DECISIONS, claudeMdText: stale });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /index/);
});

test('gateIndexFresh zgłasza brak znaczników zamiast rzucać', () => {
  const errors = gateIndexFresh({ decisionsText: DECISIONS, claudeMdText: '# P\nbez znacznikow\n' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /init/);
});

test('gateDecisionRequired przepuszcza PR poza ścieżkami decyzyjnymi', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['src/button.tsx'], paths: ['docs/specs/**'], labels: [],
  });
  assert.deepEqual(errors, []);
});

test('gateDecisionRequired blokuje zmianę w ścieżce decyzyjnej bez DECISIONS.md', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['docs/specs/M01.md'], paths: ['docs/specs/**'], labels: [],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /docs\/specs\/M01\.md/);
  assert.match(errors[0], /no-decision/);
});

test('gateDecisionRequired przepuszcza, gdy DECISIONS.md też się zmienił', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['docs/specs/M01.md', 'docs/DECISIONS.md'], paths: ['docs/specs/**'], labels: [],
  });
  assert.deepEqual(errors, []);
});

test('etykieta no-decision otwiera furtkę', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['docs/specs/M01.md'], paths: ['docs/specs/**'], labels: ['no-decision'],
  });
  assert.deepEqual(errors, []);
});

test('wzorzec ** dopasowuje zagnieżdżone katalogi, * nie przekracza separatora', () => {
  assert.equal(gateDecisionRequired({
    changedFiles: ['a/b/c/pricing.ts'], paths: ['**/pricing*'], labels: [],
  }).length, 1);
  assert.deepEqual(gateDecisionRequired({
    changedFiles: ['a/b/x.ts'], paths: ['a/*.ts'], labels: [],
  }), []);
});

test('wiodace ./ nie powoduje falszywego alarmu', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['docs/specs/M01.md', './docs/DECISIONS.md'],
    paths: ['docs/specs/**'], labels: [],
  });
  assert.deepEqual(errors, [], 'DECISIONS.md zostal ruszony — bramka ma milczec');
});

test('wiodace ./ nie pozwala ominac bramki', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['./docs/specs/M01.md'],
    paths: ['docs/specs/**'], labels: [],
  });
  assert.equal(errors.length, 1, 'zmiana w sciezce decyzyjnej musi byc wykryta mimo prefiksu');
});

test('gateIndexFresh milczy przy bledach relacji — zglasza je integrity', () => {
  const zleRelacje = [
    '## DEC-002 — 2026-02-01',
    '**Odwraca:** DEC-999',
    '**Temat:** T',
    '**Kontekst:** K',
    '**Decyzja:** D',
    '**Konsekwencje:** KO',
    '**Podjął:** Z',
    '',
  ].join('\n');
  const stale = `# P\n\n${OPEN_MARKER}\ncelowo nieaktualne\n${CLOSE_MARKER}\n`;

  assert.deepEqual(
    gateIndexFresh({ decisionsText: zleRelacje, claudeMdText: stale }),
    [],
    'przy zepsutych relacji indeksu nie da sie porownac — brak szumu',
  );
  assert.equal(
    gateIntegrity({ decisionsText: zleRelacje, clientNames: null, fileExists: () => true }).length,
    1,
    'prawdziwy blad zglasza integrity',
  );
});

test('normalizacja domyka wszystkie warianty zapisu sciezki', () => {
  const warianty = [
    './docs/specs/M01.md',
    './/docs/specs/M01.md',
    '././docs/specs/M01.md',
    'docs/./specs/M01.md',
  ];
  for (const f of warianty) {
    assert.equal(
      gateDecisionRequired({ changedFiles: [f], paths: ['docs/specs/**'], labels: [] }).length,
      1,
      `wariant ${f} musi byc wykryty — inaczej bramka po cichu przestaje egzekwowac`,
    );
  }
});

test('normalizacja rozpoznaje DECISIONS.md w kazdym wariancie zapisu', () => {
  for (const f of ['docs/DECISIONS.md', './docs/DECISIONS.md', './/docs/DECISIONS.md', 'docs/./DECISIONS.md']) {
    assert.deepEqual(
      gateDecisionRequired({ changedFiles: ['docs/specs/M01.md', f], paths: ['docs/specs/**'], labels: [] }),
      [],
      `wariant ${f} musi byc rozpoznany jako ruszony DECISIONS.md`,
    );
  }
});

test('normalizacja nie psuje sciezek zaczynajacych sie od kropki', () => {
  assert.equal(
    gateDecisionRequired({ changedFiles: ['.github/workflows/knowledge.yml'], paths: ['.github/**'], labels: [] }).length,
    1,
    '.github nie moze byc obciete przy normalizacji',
  );
});

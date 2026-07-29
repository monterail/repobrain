# repoBrain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zbudować repoBrain — CLI + plugin Claude Code, który utrzymuje `docs/DECISIONS.md` jako jedyne źródło prawdy i generuje z niego blok aktywnych decyzji do `CLAUDE.md`, egzekwując spójność trzema bramkami CI.

**Architecture:** Czysty rdzeń w `lib/` (parser → graf relacji → render), bez zależności od API Claude Code i API GitHub Actions. Dwie ścieżki konsumpcji tego samego kodu: `bin/knowledge.mjs` uruchamiany przez `npx` w CI oraz plugin z komendami dla zespołu. Walidacja zwraca listy błędów zamiast rzucać wyjątkami — CI ma pokazać wszystkie problemy naraz, nie pierwszy.

**Tech Stack:** Node ≥20, ESM, **zero zależności produkcyjnych i deweloperskich**. Testy: wbudowany `node:test`. Bez transpilacji, bez bundlera, bez lintera.

## Global Constraints

- **Zero dependencies.** `package.json` nie ma `dependencies` ani `devDependencies`. Wyłącznie moduły wbudowane (`node:fs`, `node:path`, `node:test`, `node:assert`, `node:child_process`, `node:os`).
- **Niezmiennik architektoniczny:** `lib/` nie może importować niczego związanego z Claude Code ani GitHub Actions. Kontekst środowiska (ścieżki, zmienne, `GITHUB_EVENT_PATH`) czyta wyłącznie `bin/knowledge.mjs` i przekazuje do `lib/` jako argumenty.
- **Wszystkie pliki `.mjs`**, `"type": "module"` w `package.json`.
- **Separator daty w nagłówku DEC:** akceptowane `-`, `–`, `—`.
- **Format daty:** ściśle `YYYY-MM-DD` z zerami wiodącymi. `2026-9-3` to błąd.
- **Pola wymagane wpisu DEC:** `Temat`, `Kontekst`, `Decyzja`, `Konsekwencje`, `Podjął`.
- **Pola opcjonalne:** `Odwraca`, `Zmienia`, `Obszar`, `Scope`, `Źródło`.
- **Dozwolone wartości `Scope:`** — dokładnie: `w cenie`, `change request`, `do wyceny`.
- **Zamknięta lista placeholderów:** `[data]`, `[uzupełnij]`, `[TBD]`, `[verify]`, `TODO`. Nigdy wzorzec „dowolny `[...]`".
- **Znaczniki bloku generowanego:** otwierający `<!-- WYGENEROWANE:decyzje — nie edytuj. Uruchom: npx … index -->`, zamykający `<!-- /WYGENEROWANE:decyzje -->`.
- **Generator nigdy nie dopisuje na końcu pliku.** Brak znaczników = błąd z instrukcją uruchomienia `init`.
- **Instalator nigdy nie nadpisuje istniejących plików.**
- **Komunikaty błędów po polsku**, z numerem linii, w formacie `<linia>: <opis>`.
- **Parser pomija linie wewnątrz bloków ogrodzonych** (```` ``` ````). `DECISIONS.md` dokumentuje własny format przykładami, więc `## DEC-NNN — YYYY-MM-DD` w bloku kodu nie może być traktowane jak nagłówek. Bez tego szablon z Task 8 wywala bramkę `integrity` zaraz po instalacji.
- Wszystkie funkcje walidujące zwracają `{ errors: string[], ... }`. Wyjątki wyłącznie dla błędów programisty (brak znaczników w `CLAUDE.md`).

## File Structure

| Plik | Odpowiedzialność |
|---|---|
| `package.json` | `bin`, `type: module`, skrypt testowy. Zero zależności |
| `lib/parse.mjs` | tekst `DECISIONS.md` → obiekty DEC + błędy składniowe per wpis |
| `lib/status.mjs` | obiekty DEC → zbiór aktywnych i historia + błędy relacji między wpisami |
| `lib/render.mjs` | zbiór aktywnych → markdown; wstawienie bloku między znaczniki |
| `lib/integrity.mjs` | reguły wymagające systemu plików i polityki (`Źródło:`, placeholdery, `Scope:`) |
| `lib/gates.mjs` | trzy bramki CI złożone z powyższych |
| `lib/init.mjs` | scaffolding bez nadpisywania |
| `bin/knowledge.mjs` | jedyne miejsce znające środowisko: argv, cwd, zmienne CI |
| `templates/*` | szkielety wstawiane przez `init` |
| `lib/*.test.mjs` | testy jednostkowe obok modułów |
| `test/e2e.test.mjs` | pełna pętla w katalogu tymczasowym |
| `.claude-plugin/**` | plugin: manifest, skille, komendy |

### Kontrakt danych

Obiekt DEC produkowany przez `parseDecisions`:

```js
{
  id: 'DEC-039',        // znormalizowane do 3 cyfr
  num: 39,              // liczba, do porządkowania
  date: '2026-07-20',
  reverses: 'DEC-036' | null,   // Odwraca
  changes: 'DEC-036' | null,    // Zmienia
  area: ['billing', 'webhooki'],  // Obszar; [] gdy brak
  scope: 'w cenie' | null,
  source: 'Transcripts/x.md' | null,  // Źródło
  topic: 'tekst',       // Temat
  context: 'tekst',     // Kontekst
  decision: 'tekst',    // Decyzja
  consequences: 'tekst',// Konsekwencje
  decidedBy: 'tekst',   // Podjął
  line: 12              // linia nagłówka, 1-indeksowana
}
```

Wynik `deriveStatus`:

```js
{
  active:  [{ dec, changedBy: ['DEC-039'] }],   // changedBy: [] gdy nikt nie zmienia
  history: [{ dec, reversedBy: 'DEC-033' }],
  errors:  string[]
}
```

### Uzupełnienie specu

Spec (§3) wymaga `Źródło:`, „gdy `Podjął:` wskazuje klienta", ale nie definiuje, skąd narzędzie wie, kto jest klientem. Rozstrzygnięcie: opcjonalny argument `--client-names <lista>`. Bez niego reguła nie działa — projekt włącza ją świadomie. Zero konfiguracji domyślnej.

---

### Task 1: Szkielet pakietu i parser wpisu DEC

**Files:**
- Create: `package.json`
- Create: `lib/parse.mjs`
- Test: `lib/parse.test.mjs`

**Interfaces:**
- Consumes: nic
- Produces: `parseDecisions(text: string) → { decs: Dec[], errors: string[] }`

- [ ] **Step 1: Utwórz `package.json`**

```json
{
  "name": "repobrain",
  "version": "0.1.0",
  "description": "Warstwa wiedzy w repo, egzekwowana przez CI",
  "type": "module",
  "bin": { "repobrain": "bin/knowledge.mjs" },
  "scripts": { "test": "node --test" },
  "engines": { "node": ">=20" },
  "license": "MIT"
}
```

- [ ] **Step 2: Napisz test, który nie przechodzi**

```js
// lib/parse.test.mjs
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
```

- [ ] **Step 3: Uruchom test, upewnij się że pada**

Run: `node --test lib/parse.test.mjs`
Expected: FAIL — `Cannot find module './parse.mjs'`

- [ ] **Step 4: Zaimplementuj `lib/parse.mjs`**

```js
// lib/parse.mjs
const HEADING = /^##\s+(.+?)\s*$/;
const DEC_HEADING = /^DEC-(\d+)\s*[-–—]\s*(\d{4}-\d{2}-\d{2})$/;
const FIELD = /^\*\*([^:*]+):\*\*\s*(.*)$/;

const REQUIRED = ['Temat', 'Kontekst', 'Decyzja', 'Konsekwencje', 'Podjął'];
const OPTIONAL = ['Odwraca', 'Zmienia', 'Obszar', 'Scope', 'Źródło'];
const SCOPES = ['w cenie', 'change request', 'do wyceny'];

const KEY = {
  Temat: 'topic', Kontekst: 'context', Decyzja: 'decision',
  Konsekwencje: 'consequences', 'Podjął': 'decidedBy',
  Odwraca: 'reverses', Zmienia: 'changes', Obszar: 'area',
  Scope: 'scope', 'Źródło': 'source',
};

const normalizeId = (n) => `DEC-${String(n).padStart(3, '0')}`;

function parseFields(blockLines, headingLine) {
  const raw = {};
  const errors = [];
  let current = null;
  for (const line of blockLines) {
    const m = line.match(FIELD);
    if (m) {
      const name = m[1].trim();
      if (!KEY[name]) { current = null; continue; }
      current = name;
      raw[name] = m[2].trim();
      continue;
    }
    if (current && line.trim() !== '' && !line.startsWith('---')) {
      raw[current] = `${raw[current]} ${line.trim()}`.trim();
    }
  }
  for (const name of REQUIRED) {
    if (!raw[name]) errors.push(`${headingLine}: brak wymaganego pola ${name}`);
  }
  return { raw, errors };
}

export function parseDecisions(text) {
  const lines = text.split('\n');
  const decs = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(HEADING);
    if (!h) continue;

    let j = i + 1;
    while (j < lines.length && !HEADING.test(lines[j])) j++;

    const m = h[1].match(DEC_HEADING);
    if (!m) {
      errors.push(`${i + 1}: nagłówek "## ${h[1]}" nie jest poprawnym wpisem DEC`);
      i = j - 1;
      continue;
    }

    const { raw, errors: fieldErrors } = parseFields(lines.slice(i + 1, j), i + 1);
    errors.push(...fieldErrors);

    if (raw.Scope && !SCOPES.includes(raw.Scope)) {
      errors.push(`${i + 1}: niedozwolona wartość Scope "${raw.Scope}" (dozwolone: ${SCOPES.join(', ')})`);
    }

    if (fieldErrors.length === 0) {
      const dec = {
        id: normalizeId(m[1]),
        num: Number(m[1]),
        date: m[2],
        line: i + 1,
        area: raw.Obszar ? raw.Obszar.split(',').map((s) => s.trim()).filter(Boolean) : [],
      };
      for (const name of [...REQUIRED, ...OPTIONAL]) {
        if (name === 'Obszar') continue;
        const key = KEY[name];
        let value = raw[name] ?? null;
        if ((name === 'Odwraca' || name === 'Zmienia') && value) {
          const n = value.match(/DEC-(\d+)/);
          value = n ? normalizeId(n[1]) : value;
        }
        dec[key] = value;
      }
      decs.push(dec);
    }

    i = j - 1;
  }

  return { decs, errors };
}
```

- [ ] **Step 5: Uruchom testy, upewnij się że przechodzą**

Run: `node --test lib/parse.test.mjs`
Expected: PASS — 7 testów

- [ ] **Step 6: Commit**

```bash
git add package.json lib/parse.mjs lib/parse.test.mjs
git commit -m "feat: parser wpisow DEC z walidacja pol wymaganych"
```

---

### Task 2: Twardy błąd na nieparsowalnym nagłówku

Reguła §4.2 specu: nagłówek `## `, który nie jest poprawnym wpisem DEC, musi być twardym błędem. Bez tego literówka powoduje ciche zniknięcie decyzji przy zielonym CI — stan gorszy niż kłamiące `Status:` z tamten projekt. Task 1 zwraca już błąd; ten task pokrywa go testami i domyka przypadki brzegowe.

**Files:**
- Modify: `lib/parse.test.mjs` (dopisz testy)
- Modify: `lib/parse.mjs` (jeśli testy wykażą lukę)

**Interfaces:**
- Consumes: `parseDecisions` z Task 1
- Produces: brak nowych

- [ ] **Step 1: Dopisz testy**

```js
// lib/parse.test.mjs — dopisz na końcu

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
  const text = `# tamten projekt — Decision Log

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
```

- [ ] **Step 2: Uruchom testy**

Run: `node --test lib/parse.test.mjs`
Expected: PASS — implementacja z Task 1 spełnia te reguły. Jeśli któryś pada, popraw `lib/parse.mjs` i uruchom ponownie.

- [ ] **Step 3: Commit**

```bash
git add lib/parse.test.mjs lib/parse.mjs
git commit -m "test: twardy blad na nieparsowalnym nagłowku DEC"
```

---

### Task 3: Derywacja statusu z relacji Odwraca i Zmienia

**Files:**
- Create: `lib/status.mjs`
- Test: `lib/status.test.mjs`

**Interfaces:**
- Consumes: `Dec[]` z `parseDecisions`
- Produces: `deriveStatus(decs: Dec[]) → { active: {dec, changedBy: string[]}[], history: {dec, reversedBy: string}[], errors: string[] }`

- [ ] **Step 1: Napisz test, który nie przechodzi**

```js
// lib/status.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStatus } from './status.mjs';

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
```

- [ ] **Step 2: Uruchom test, upewnij się że pada**

Run: `node --test lib/status.test.mjs`
Expected: FAIL — `Cannot find module './status.mjs'`

- [ ] **Step 3: Zaimplementuj `lib/status.mjs`**

```js
// lib/status.mjs
export function deriveStatus(decs) {
  const errors = [];
  const byId = new Map(decs.map((d) => [d.id, d]));
  const reversedBy = new Map();
  const changedBy = new Map();

  for (const d of decs) {
    if (d.reverses) reversedBy.set(d.reverses, d.id);
    if (d.changes) {
      if (!changedBy.has(d.changes)) changedBy.set(d.changes, []);
      changedBy.get(d.changes).push(d.id);
    }
  }

  const order = (d) => `${d.date}#${String(d.num).padStart(6, '0')}`;
  const sorted = [...decs].sort((a, b) => (order(a) < order(b) ? 1 : -1));

  const active = [];
  const history = [];
  for (const d of sorted) {
    if (reversedBy.has(d.id)) {
      history.push({ dec: d, reversedBy: reversedBy.get(d.id) });
    } else {
      active.push({ dec: d, changedBy: (changedBy.get(d.id) ?? []).slice().sort() });
    }
  }

  // assert: przy egzekwowanym "tylko wstecz" cykl jest niemożliwy.
  // Ten warunek nie jest funkcją produktu — to zabezpieczenie przed regresją reguły.
  for (const d of decs) {
    const t = d.reverses ?? d.changes;
    if (t && byId.get(t)?.reverses === d.id) {
      errors.push(`${d.line}: cykl relacji ${d.id} ↔ ${t}`);
    }
  }

  return { active, history, errors };
}
```

- [ ] **Step 4: Uruchom testy**

Run: `node --test lib/status.test.mjs`
Expected: PASS — 6 testów

- [ ] **Step 5: Commit**

```bash
git add lib/status.mjs lib/status.test.mjs
git commit -m "feat: derywacja statusu z relacji Odwraca i Zmienia"
```

---

### Task 4: Walidacja relacji między wpisami

**Files:**
- Modify: `lib/status.mjs`
- Modify: `lib/status.test.mjs`

**Interfaces:**
- Consumes: `deriveStatus` z Task 3
- Produces: bez zmian w sygnaturze; rozszerzona lista `errors`

- [ ] **Step 1: Dopisz testy, które nie przechodzą**

```js
// lib/status.test.mjs — dopisz na końcu

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
```

- [ ] **Step 2: Uruchom testy, upewnij się że padają**

Run: `node --test lib/status.test.mjs`
Expected: FAIL — 6 nowych testów pada, 6 z Task 3 przechodzi

- [ ] **Step 3: Zastąp `lib/status.mjs` w całości**

Poniższa wersja zastępuje plik z Task 3. Blok „assert: cykl" z Task 3 znika — przy egzekwowanym „tylko wstecz" cykl jest matematycznie niemożliwy, a martwy kod myli czytelnika.

```js
// lib/status.mjs
const order = (d) => `${d.date}#${String(d.num).padStart(6, '0')}`;

export function deriveStatus(decs) {
  const errors = [];
  const byId = new Map(decs.map((d) => [d.id, d]));

  // --- walidacja poprzedza budowę grafu ---
  const seen = new Set();
  for (const d of decs) {
    if (seen.has(d.id)) errors.push(`${d.line}: duplikat ID ${d.id}`);
    seen.add(d.id);
  }

  for (const d of decs) {
    if (d.reverses && d.changes) {
      errors.push(`${d.line}: ${d.id} deklaruje jednocześnie Odwraca i Zmienia — dozwolona jest jedna relacja`);
      continue;
    }
    const target = d.reverses ?? d.changes;
    if (!target) continue;
    const t = byId.get(target);
    if (!t) {
      errors.push(`${d.line}: ${d.id} wskazuje na ${target}, który nie istnieje`);
      continue;
    }
    if (order(t) >= order(d)) {
      errors.push(`${d.line}: ${d.id} musi wskazywać na wpis wcześniejszy niż ${target}`);
    }
  }

  // Cykl relacji jest niemożliwy: każda relacja musi wskazywać wstecz wg pary
  // (data, ID), a ten porządek jest liniowy. Walidacja wyżej to gwarantuje.

  // --- budowa grafu ---
  const reversedBy = new Map();
  const changedBy = new Map();
  for (const d of decs) {
    if (d.reverses) reversedBy.set(d.reverses, d.id);
    if (d.changes) {
      if (!changedBy.has(d.changes)) changedBy.set(d.changes, []);
      changedBy.get(d.changes).push(d.id);
    }
  }

  for (const d of decs) {
    if (d.changes && reversedBy.has(d.changes)) {
      errors.push(`${d.line}: ${d.id} zmienia ${d.changes}, który został odwrócony przez ${reversedBy.get(d.changes)}`);
    }
  }

  // --- podział na aktywne i historię, najnowsze pierwsze ---
  const sorted = [...decs].sort((a, b) => (order(a) < order(b) ? 1 : -1));
  const active = [];
  const history = [];
  for (const d of sorted) {
    if (reversedBy.has(d.id)) {
      history.push({ dec: d, reversedBy: reversedBy.get(d.id) });
    } else {
      // Wpis, ktory sam zostal odwrocony, nie moze dalej "zmieniac" celu —
      // jego doprecyzowanie umiera razem z nim.
      const changers = (changedBy.get(d.id) ?? []).filter((id) => !reversedBy.has(id));
      active.push({ dec: d, changedBy: changers.sort() });
    }
  }

  return { active, history, errors };
}
```

- [ ] **Step 4: Uruchom testy**

Run: `node --test lib/status.test.mjs`
Expected: PASS — 12 testów

- [ ] **Step 5: Commit**

```bash
git add lib/status.mjs lib/status.test.mjs
git commit -m "feat: walidacja relacji miedzy wpisami DEC"
```

---

### Task 5: Render bloku i wstawianie między znaczniki

**Files:**
- Create: `lib/render.mjs`
- Test: `lib/render.test.mjs`

**Interfaces:**
- Consumes: wynik `deriveStatus`
- Produces:
  - `renderBlock({active, history}) → string` — sama treść bloku, bez znaczników
  - `spliceBlock(claudeMd: string, block: string) → string` — rzuca `Error`, gdy brak znaczników
  - `OPEN_MARKER`, `CLOSE_MARKER` — stałe eksportowane

- [ ] **Step 1: Napisz test, który nie przechodzi**

```js
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
```

- [ ] **Step 2: Uruchom test, upewnij się że pada**

Run: `node --test lib/render.test.mjs`
Expected: FAIL — `Cannot find module './render.mjs'`

- [ ] **Step 3: Zaimplementuj `lib/render.mjs`**

```js
// lib/render.mjs
export const OPEN_MARKER = '<!-- WYGENEROWANE:decyzje — nie edytuj. Uruchom: npx … index -->';
export const CLOSE_MARKER = '<!-- /WYGENEROWANE:decyzje -->';

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|');

export function renderBlock({ active, history }) {
  const out = [];

  if (active.length === 0) {
    out.push('_Brak aktywnych decyzji._');
  } else {
    out.push('| DEC | Data | Obszar | Temat |');
    out.push('|-----|------|--------|-------|');
    for (const { dec, changedBy } of active) {
      const suffix = changedBy.length ? ` *(zmienione przez ${changedBy.join(', ')})*` : '';
      out.push(`| ${dec.id} | ${dec.date} | ${cell(dec.area.join(', '))} | ${cell(dec.topic)}${suffix} |`);
    }
  }

  if (history.length > 0) {
    out.push('');
    out.push('**Odwrócone (historia):**');
    out.push('');
    for (const { dec, reversedBy } of history) {
      out.push(`- ${dec.id} (${dec.date}) — odwrócony przez ${reversedBy}`);
    }
  }

  return out.join('\n');
}

export function spliceBlock(claudeMd, block) {
  const start = claudeMd.indexOf(OPEN_MARKER);
  const end = claudeMd.indexOf(CLOSE_MARKER);

  if (start === -1 && end === -1) {
    throw new Error(
      'Brak znaczników WYGENEROWANE:decyzje w CLAUDE.md. Uruchom `repobrain init`, ' +
      'żeby je dodać. Generator nigdy nie dopisuje bloku na końcu pliku.',
    );
  }
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Uszkodzona para znaczników WYGENEROWANE:decyzje w CLAUDE.md — napraw ręcznie.');
  }

  const before = claudeMd.slice(0, start + OPEN_MARKER.length);
  const after = claudeMd.slice(end);
  return `${before}\n${block}\n${after}`;
}
```

- [ ] **Step 4: Uruchom testy**

Run: `node --test lib/render.test.mjs`
Expected: PASS — 9 testów

- [ ] **Step 5: Commit**

```bash
git add lib/render.mjs lib/render.test.mjs
git commit -m "feat: render bloku decyzji i wstawianie miedzy znaczniki"
```

---

### Task 6: Reguły integralności zależne od systemu plików

**Files:**
- Create: `lib/integrity.mjs`
- Test: `lib/integrity.test.mjs`

**Interfaces:**
- Consumes: `Dec[]` z `parseDecisions`
- Produces: `checkIntegrity({ decs, rawText, clientNames, fileExists }) → string[]`
  - `fileExists` to wstrzykiwana funkcja `(path: string) => boolean` — pozwala testować bez dotykania dysku; `bin/` wstrzykuje wersję opartą na `node:fs`.
  - `clientNames` to **lista nazw rozdzielona przecinkami** (`string | null`), **nie wyrażenie regularne**. Dopasowanie po podciągu, bez rozróżniania wielkości liter. Gdy `null`, pusty string albo sama interpunkcja — reguła nie działa.

- [ ] **Step 1: Napisz test, który nie przechodzi**

```js
// lib/integrity.test.mjs
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
```

- [ ] **Step 2: Uruchom test, upewnij się że pada**

Run: `node --test lib/integrity.test.mjs`
Expected: FAIL — `Cannot find module './integrity.mjs'`

- [ ] **Step 3: Zaimplementuj `lib/integrity.mjs`**

```js
// lib/integrity.mjs
const PLACEHOLDERS = ['[data]', '[uzupełnij]', '[TBD]', '[verify]', 'TODO'];

export function checkIntegrity({ decs, rawText, clientNames, fileExists }) {
  const errors = [];

  // Lista nazw, nie wyrazenie regularne. Wejscie pochodzi z CLI, a RegExp
  // przyjmuje od uzytkownika zarowno bledy skladni (wyjatek — lamie kontrakt
  // "nie rzucamy"), jak i wzorce o katastrofalnym backtrackingu (zawieszenie
  // procesu CI). Dopasowanie po podciagu pokrywa realny przypadek — wskazanie
  // klienta po nazwisku — a obie podatnosci znikaja konstrukcyjnie.
  //
  // Kompromis przyjety swiadomie: dopasowanie po podciagu jest luzniejsze niz
  // wyrazenie regularne. Nazwa "Jo" trafi w "Jozef", "Johanna" i "Major".
  // Kierunek bledu jest bezpieczny — narzedzie zazada pola Zrodlo tam, gdzie
  // nie musi, zamiast przeoczyc decyzje klienta. Operator dobiera nazwy
  // wystarczajaco dlugie, zeby uniknac kolizji.
  const names = (clientNames ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const d of decs) {
    if (d.source && !fileExists(d.source)) {
      errors.push(`${d.line}: ${d.id} — Źródło wskazuje na nieistniejący plik ${d.source}`);
    }
    if (names.length) {
      const decidedBy = String(d.decidedBy ?? '').toLowerCase();
      if (names.some((n) => decidedBy.includes(n)) && !d.source) {
        errors.push(`${d.line}: ${d.id} — decyzja klienta wymaga pola Źródło`);
      }
    }
  }

  rawText.split('\n').forEach((line, idx) => {
    for (const p of PLACEHOLDERS) {
      if (line.includes(p)) {
        errors.push(`${idx + 1}: niewypełniony placeholder ${p}`);
      }
    }
  });

  return errors;
}
```

- [ ] **Step 4: Uruchom testy**

Run: `node --test lib/integrity.test.mjs`
Expected: PASS — 8 testów

- [ ] **Step 5: Commit**

```bash
git add lib/integrity.mjs lib/integrity.test.mjs
git commit -m "feat: reguly integralnosci - Zrodlo, decyzje klienta, placeholdery"
```

---

### Task 7: Trzy bramki CI

**Files:**
- Create: `lib/gates.mjs`
- Test: `lib/gates.test.mjs`

**Interfaces:**
- Consumes: `parseDecisions`, `deriveStatus`, `renderBlock`, `spliceBlock`, `checkIntegrity`
- Produces:
  - `gateIntegrity({ decisionsText, clientNames, fileExists }) → string[]`
  - `gateIndexFresh({ decisionsText, claudeMdText }) → string[]`
  - `gateDecisionRequired({ changedFiles, paths, labels }) → string[]`

- [ ] **Step 1: Napisz test, który nie przechodzi**

```js
// lib/gates.test.mjs
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
```

- [ ] **Step 2: Uruchom test, upewnij się że pada**

Run: `node --test lib/gates.test.mjs`
Expected: FAIL — `Cannot find module './gates.mjs'`

- [ ] **Step 3: Zaimplementuj `lib/gates.mjs`**

```js
// lib/gates.mjs
import { parseDecisions } from './parse.mjs';
import { deriveStatus } from './status.mjs';
import { renderBlock, spliceBlock, OPEN_MARKER, CLOSE_MARKER } from './render.mjs';
import { checkIntegrity } from './integrity.mjs';

const DECISIONS_PATH = 'docs/DECISIONS.md';

export function gateIntegrity({ decisionsText, clientNames, fileExists }) {
  const { decs, errors: parseErrors } = parseDecisions(decisionsText);
  const { errors: statusErrors } = deriveStatus(decs);
  const integrityErrors = checkIntegrity({
    decs, rawText: decisionsText, clientNames, fileExists,
  });
  return [...parseErrors, ...statusErrors, ...integrityErrors];
}

export function gateIndexFresh({ decisionsText, claudeMdText }) {
  const { decs } = parseDecisions(decisionsText);
  const { active, history, errors } = deriveStatus(decs);

  // Przy bledach relacji indeks nie da sie sensownie porownac — zglasza je
  // bramka integrity. Milczymy, zeby nie dokladac myllacego "indeks nieaktualny".
  if (errors.length) return [];

  const expected = renderBlock({ active, history });

  let updated;
  try {
    updated = spliceBlock(claudeMdText, expected);
  } catch (err) {
    return [err.message];
  }

  if (updated !== claudeMdText) {
    return ['Blok WYGENEROWANE:decyzje w CLAUDE.md jest nieaktualny — uruchom `npx … index` i zacommituj wynik.'];
  }
  return [];
}

// Minimalny matcher glob: ** przekracza separatory, * nie.
// Skanujemy znak po znaku zamiast lancucha .replace() z sentinelami —
// sentinel zawsze da sie wpisac w dane wejsciowe i wtedy translacja klamie.
const SPECIAL = new Set(['.', '+', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\', '?']);

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c !== '*') {
      re += SPECIAL.has(c) ? `\\${c}` : c;
      continue;
    }
    if (glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else { re += '.*'; }
    } else {
      re += '[^/]*';
    }
  }
  return new RegExp(`^${re}$`);
}

export function gateDecisionRequired({ changedFiles, paths, labels }) {
  if (labels.includes('no-decision')) return [];
  if (changedFiles.includes(DECISIONS_PATH)) return [];

  const matchers = paths.map(globToRegExp);
  const hits = changedFiles.filter((f) => matchers.some((re) => re.test(f)));
  if (hits.length === 0) return [];

  return [
    `PR zmienia ścieżki decyzyjne (${hits.join(', ')}), ale nie rusza ${DECISIONS_PATH}. ` +
    'Dodaj wpis DEC albo oznacz PR etykietą `no-decision`.',
  ];
}

export { OPEN_MARKER, CLOSE_MARKER };
```

- [ ] **Step 4: Uruchom testy**

Run: `node --test lib/gates.test.mjs`
Expected: PASS — 10 testów

- [ ] **Step 5: Uruchom cały zestaw**

Run: `npm test`
Expected: PASS — wszystkie testy z Tasków 1-7

- [ ] **Step 6: Commit**

```bash
git add lib/gates.mjs lib/gates.test.mjs
git commit -m "feat: trzy bramki CI - integrity, index-fresh, decision-required"
```

---

### Task 8: Szablony i scaffolding bez nadpisywania

**Files:**
- Create: `templates/DECISIONS.md`
- Create: `templates/knowledge.yml`
- Create: `templates/CLAUDE-section.md`
- Create: `lib/init.mjs`
- Test: `lib/init.test.mjs`

**Interfaces:**
- Consumes: `OPEN_MARKER`, `CLOSE_MARKER` z `render.mjs`
- Produces: `planInit({ existing: string[] }) → { create: {path, template}[], skip: string[], appendToClaudeMd: boolean }`
  - Czysta funkcja planująca; zapis na dysk robi `bin/knowledge.mjs`. Dzięki temu reguła „nigdy nie nadpisuj" jest testowalna bez systemu plików.

- [ ] **Step 1: Utwórz `templates/DECISIONS.md`**

````markdown
# Decision Log

Jedno źródło prawdy o decyzjach projektu. Skrót aktywnych decyzji generuje się
z tego pliku do `CLAUDE.md` — nie edytuj go tam ręcznie.

### Format wpisu

Nagłówek tej sekcji jest celowo trzeciego poziomu: każdy nagłówek `## ` w tym pliku
musi być kompletnym wpisem DEC, inaczej bramka `integrity` odrzuca plik.

```markdown
## DEC-NNN — YYYY-MM-DD
**Odwraca:** DEC-XXX      (opcjonalne — XXX przestaje obowiązywać w całości)
**Zmienia:** DEC-XXX      (opcjonalne — XXX obowiązuje dalej, ten wpis doprecyzowuje fragment)
**Obszar:** tag, tag      (opcjonalne)
**Scope:** w cenie        (opcjonalne — w cenie | change request | do wyceny)
**Źródło:** Transcripts/YYYY-MM-DD-slug.md   (opcjonalne; wymagane dla decyzji klienta)
**Temat:** jedno zdanie
**Kontekst:** dlaczego temat w ogóle się pojawił
**Decyzja:** co ustalono
**Konsekwencje:** co to zmienia w kodzie, kosztach, harmonogramie
**Podjął:** kto i gdzie
```

Zasady:

- Nowe wpisy dopisuj **na końcu pliku** — dzięki temu równoległe PR-y dają konflikt tekstowy zamiast cichego auto-merge.
- Statusu się nie zapisuje. Wynika z pól `Odwraca:` i `Zmienia:` późniejszych wpisów.
- Zmiana merytoryczna = nowy wpis. Edycja korygująca (literówka, data, dopisanie `Źródło:`) jest dozwolona w miejscu.

---

## DEC-001 — 2026-01-01
**Obszar:** proces
**Temat:** Decyzje projektu żyją w tym pliku
**Kontekst:** Wiedza rozproszona po Slacku i transkryptach nie przeżywa rotacji w zespole.
**Decyzja:** Każda decyzja mająca wpływ na zakres, koszt lub architekturę trafia tutaj jako wpis DEC.
**Konsekwencje:** CI blokuje PR-y w ścieżkach decyzyjnych bez wpisu. Skrót aktywnych decyzji generuje się do CLAUDE.md.
**Podjął:** Zespół — instalacja repoBrain
````

- [ ] **Step 2: Utwórz `templates/knowledge.yml`**

```yaml
name: knowledge

on:
  pull_request:
    # labeled/unlabeled sa OBOWIAZKOWE: bez nich dodanie etykiety
    # `no-decision` nie retriggeruje builda i PR zostaje czerwony.
    types: [opened, synchronize, reopened, labeled, unlabeled]
  push:
    branches: [main]

jobs:
  knowledge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      # Pin po pelnym SHA, nigdy po tagu - tagi gita sa mutowalne,
      # a to jest zdalny kod wykonywany w CI z flaga --yes.
      - run: npx --yes github:monterail/repobrain#<PELNY_SHA> check
             --paths 'docs/specs/**,**/pricing*'
```

- [ ] **Step 3: Utwórz `templates/CLAUDE-section.md`**

```markdown
## Źródła prawdy

1. `docs/DECISIONS.md` — pełna treść decyzji; `Odwraca:`/`Zmienia:` rozstrzygają aktualność
2. blok `WYGENEROWANE:decyzje` poniżej — skrót aktywnych, zawsze zgodny z (1)
3. `docs/specs/` — kontrakt implementacyjny
4. `Transcripts/` — materiał dowodowy, gdy 1-3 milczą

Wszystko poza tą listą to notatki robocze, nie źródło prawdy.

<!-- WYGENEROWANE:decyzje — nie edytuj. Uruchom: npx … index -->
_Brak aktywnych decyzji._
<!-- /WYGENEROWANE:decyzje -->
```

- [ ] **Step 4: Napisz test, który nie przechodzi**

```js
// lib/init.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInit } from './init.mjs';

test('w pustym repo planuje wszystkie pliki', () => {
  const plan = planInit({ existing: [] });
  const paths = plan.create.map((c) => c.path);
  assert.deepEqual(paths.sort(), ['.github/workflows/knowledge.yml', 'CLAUDE.md', 'docs/DECISIONS.md'].sort());
  assert.deepEqual(plan.skip, []);
});

test('nigdy nie nadpisuje istniejących plików', () => {
  const plan = planInit({ existing: ['docs/DECISIONS.md'] });
  const paths = plan.create.map((c) => c.path);
  assert.ok(!paths.includes('docs/DECISIONS.md'));
  assert.deepEqual(plan.skip, ['docs/DECISIONS.md']);
});

test('istniejący CLAUDE.md jest rozszerzany, nie tworzony', () => {
  const plan = planInit({ existing: ['CLAUDE.md'] });
  assert.ok(!plan.create.some((c) => c.path === 'CLAUDE.md'));
  assert.equal(plan.appendToClaudeMd, true);
  assert.deepEqual(plan.skip, []);
});

test('gdy CLAUDE.md nie istnieje, jest tworzony i nie doklejany', () => {
  const plan = planInit({ existing: [] });
  assert.ok(plan.create.some((c) => c.path === 'CLAUDE.md'));
  assert.equal(plan.appendToClaudeMd, false);
});

test('każdy wpis create ma nazwę szablonu', () => {
  for (const c of planInit({ existing: [] }).create) {
    assert.ok(typeof c.template === 'string' && c.template.length > 0, c.path);
  }
});
```

- [ ] **Step 5: Uruchom test, upewnij się że pada**

Run: `node --test lib/init.test.mjs`
Expected: FAIL — `Cannot find module './init.mjs'`

- [ ] **Step 6: Zaimplementuj `lib/init.mjs`**

```js
// lib/init.mjs
const FILES = [
  { path: 'docs/DECISIONS.md', template: 'DECISIONS.md' },
  { path: '.github/workflows/knowledge.yml', template: 'knowledge.yml' },
];

export function planInit({ existing }) {
  const has = new Set(existing);
  const create = [];
  const skip = [];

  for (const f of FILES) {
    if (has.has(f.path)) skip.push(f.path);
    else create.push(f);
  }

  const claudeExists = has.has('CLAUDE.md');
  if (!claudeExists) create.push({ path: 'CLAUDE.md', template: 'CLAUDE-section.md' });

  return { create, skip, appendToClaudeMd: claudeExists };
}
```

- [ ] **Step 7: Uruchom testy**

Run: `node --test lib/init.test.mjs`
Expected: PASS — 5 testów

- [ ] **Step 8: Commit**

```bash
git add templates lib/init.mjs lib/init.test.mjs
git commit -m "feat: szablony i planowanie instalacji bez nadpisywania"
```

---

### Task 9: CLI

**Files:**
- Create: `bin/knowledge.mjs`

**Interfaces:**
- Consumes: wszystko z `lib/`
- Produces: komendy `init`, `index`, `check`. Kod wyjścia `1`, gdy którakolwiek bramka zgłosi błąd.

Jedyny moduł znający środowisko. `lib/` pozostaje czyste — to niezmiennik architektoniczny ze specu.

- [ ] **Step 1: Zaimplementuj `bin/knowledge.mjs`**

```js
#!/usr/bin/env node
// bin/knowledge.mjs — jedyne miejsce, które zna system plików, argv i zmienne CI.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { parseDecisions } from '../lib/parse.mjs';
import { deriveStatus } from '../lib/status.mjs';
import { renderBlock, spliceBlock } from '../lib/render.mjs';
import { gateIntegrity, gateIndexFresh, gateDecisionRequired } from '../lib/gates.mjs';
import { planInit } from '../lib/init.mjs';

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.cwd();
const DECISIONS = join(REPO, 'docs/DECISIONS.md');
const CLAUDE_MD = join(REPO, 'CLAUDE.md');

function flag(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function readEvent() {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p || !existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function changedFiles(event) {
  const base = event?.pull_request?.base?.sha;
  const head = event?.pull_request?.head?.sha ?? 'HEAD';
  if (!base) return null;
  const out = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function fail(errors) {
  console.error(`\n✗ repoBrain — ${errors.length} ${errors.length === 1 ? 'błąd' : 'błędów'}:\n`);
  for (const e of errors) console.error(`  ${e}`);
  console.error('');
  process.exit(1);
}

function cmdInit() {
  const candidates = ['docs/DECISIONS.md', '.github/workflows/knowledge.yml', 'CLAUDE.md'];
  const existing = candidates.filter((p) => existsSync(join(REPO, p)));
  const plan = planInit({ existing });

  for (const { path, template } of plan.create) {
    const target = join(REPO, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(KIT_ROOT, 'templates', template), 'utf8'));
    console.log(`  + ${path}`);
  }
  for (const path of plan.skip) console.log(`  = ${path} (istnieje, pominięto)`);

  if (plan.appendToClaudeMd) {
    const section = readFileSync(join(KIT_ROOT, 'templates/CLAUDE-section.md'), 'utf8');
    if (readFileSync(CLAUDE_MD, 'utf8').includes('WYGENEROWANE:decyzje')) {
      console.log('  = CLAUDE.md (znaczniki już są, pominięto)');
    } else {
      appendFileSync(CLAUDE_MD, `\n${section}`);
      console.log('  ~ CLAUDE.md (dopisano sekcję Źródła prawdy)');
    }
  }

  console.log('\nDo uzupełnienia ręcznie:');
  console.log('  1. ścieżki decyzyjne w .github/workflows/knowledge.yml');
  console.log('  2. pełny SHA repoBrain w tym samym pliku (nigdy tag)');
  console.log('  3. branch protection: require branches to be up to date');
}

function cmdIndex() {
  const text = readFileSync(DECISIONS, 'utf8');
  const { decs, errors } = parseDecisions(text);
  if (errors.length) fail(errors);

  const { active, history, errors: statusErrors } = deriveStatus(decs);
  if (statusErrors.length) fail(statusErrors);

  const claudeMd = readFileSync(CLAUDE_MD, 'utf8');
  let updated;
  try {
    updated = spliceBlock(claudeMd, renderBlock({ active, history }));
  } catch (err) {
    fail([err.message]);
  }

  if (updated === claudeMd) {
    console.log('✓ CLAUDE.md już aktualny');
    return;
  }
  writeFileSync(CLAUDE_MD, updated);
  console.log(`✓ CLAUDE.md zaktualizowany — ${active.length} aktywnych, ${history.length} w historii`);
}

function cmdCheck() {
  const decisionsText = readFileSync(DECISIONS, 'utf8');
  const errors = [
    ...gateIntegrity({
      decisionsText,
      clientNames: flag('client-names'),
      fileExists: (p) => existsSync(join(REPO, p)),
    }),
    ...gateIndexFresh({ decisionsText, claudeMdText: readFileSync(CLAUDE_MD, 'utf8') }),
  ];

  const event = readEvent();
  const files = event ? changedFiles(event) : null;
  if (files) {
    errors.push(...gateDecisionRequired({
      changedFiles: files,
      paths: (flag('paths', '') || '').split(',').map((s) => s.trim()).filter(Boolean),
      labels: (event.pull_request?.labels ?? []).map((l) => l.name),
    }));
  }

  if (errors.length) fail(errors);
  console.log('✓ repoBrain — wszystkie bramki zielone');
}

const COMMANDS = { init: cmdInit, index: cmdIndex, check: cmdCheck };
const command = process.argv[2];

if (!COMMANDS[command]) {
  console.error('Użycie: repobrain <init|index|check> [--paths <globy>] [--client-names <lista>]');
  process.exit(2);
}
COMMANDS[command]();
```

- [ ] **Step 2: Nadaj prawo wykonywania i sprawdź komunikat pomocy**

```bash
chmod +x bin/knowledge.mjs
node bin/knowledge.mjs
```
Expected: komunikat `Użycie: repobrain <init|index|check> …`, kod wyjścia 2

- [ ] **Step 3: Sprawdź, że `lib/` nie zna środowiska**

```bash
grep -rnE "process\.(env|argv|cwd)|node:fs|node:child_process" lib/*.mjs | grep -v '\.test\.mjs'
```
Expected: **brak wyjścia**. Jakiekolwiek trafienie łamie niezmiennik architektoniczny — przenieś ten kod do `bin/`.

- [ ] **Step 4: Commit**

```bash
git add bin/knowledge.mjs
git commit -m "feat: CLI init, index, check"
```

---

### Task 10: Test end-to-end w katalogu tymczasowym

**Files:**
- Create: `test/e2e.test.mjs`

**Interfaces:**
- Consumes: `bin/knowledge.mjs` jako proces potomny
- Produces: brak

Pokrywa scenariusz z §7 specu — jedyny sprawdzian „gotowe na kickoff".

- [ ] **Step 1: Napisz test**

```js
// test/e2e.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(KIT, 'bin/knowledge.mjs');

function run(cwd, args, env = {}) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, encoding: 'utf8', env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.status, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

const ENTRY = (n, date, extra = '') => `
## DEC-${String(n).padStart(3, '0')} — ${date}
${extra}**Obszar:** proces
**Temat:** Temat ${n}
**Kontekst:** K
**Decyzja:** D
**Konsekwencje:** KO
**Podjął:** Zespół
`;

test('pełna pętla: init, index, odwrócenie, zmiana, bramki', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'repobrain-e2e-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  // 1. init w pustym repo
  assert.equal(run(repo, ['init']).code, 0);
  const claude = join(repo, 'CLAUDE.md');
  const decisions = join(repo, 'docs/DECISIONS.md');
  assert.match(readFileSync(claude, 'utf8'), /WYGENEROWANE:decyzje/);
  assert.match(readFileSync(decisions, 'utf8'), /DEC-001/);

  // 2. index — DEC-001 z szablonu ląduje w bloku
  assert.equal(run(repo, ['index']).code, 0);
  assert.match(readFileSync(claude, 'utf8'), /DEC-001/);

  // 3. DEC-002 odwraca DEC-001
  appendFileSync(decisions, ENTRY(2, '2026-02-01', '**Odwraca:** DEC-001\n'));
  assert.equal(run(repo, ['index']).code, 0);
  let block = readFileSync(claude, 'utf8');
  assert.match(block, /Odwrócone/);
  assert.match(block, /DEC-001.*odwrócony przez DEC-002/);

  // 4. DEC-003 zmienia DEC-002 — oba zostają aktywne
  appendFileSync(decisions, ENTRY(3, '2026-03-01', '**Zmienia:** DEC-002\n'));
  assert.equal(run(repo, ['index']).code, 0);
  block = readFileSync(claude, 'utf8');
  assert.match(block, /DEC-002.*zmienione przez DEC-003/);
  assert.match(block, /DEC-003/);

  // 5. check po regeneracji — zielone
  assert.equal(run(repo, ['check']).code, 0);

  // 6. nieaktualny blok — czerwone
  appendFileSync(decisions, ENTRY(4, '2026-04-01'));
  const stale = run(repo, ['check']);
  assert.equal(stale.code, 1);
  assert.match(stale.stderr, /nieaktualny/);

  assert.equal(run(repo, ['index']).code, 0);
  assert.equal(run(repo, ['check']).code, 0);
});

test('bramka decision-required blokuje i ustępuje przy etykiecie', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'repobrain-gate-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  execFileSync('git', ['init', '-q', '.'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: repo });

  run(repo, ['init']);
  run(repo, ['index']);
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: repo });
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();

  mkdirSync(join(repo, 'docs/specs'), { recursive: true });
  writeFileSync(join(repo, 'docs/specs/M01.md'), '# Spec\n');
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['commit', '-qm', 'spec bez decyzji'], { cwd: repo });
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();

  const eventPath = join(repo, 'event.json');
  const writeEvent = (labels) => writeFileSync(eventPath, JSON.stringify({
    pull_request: { base: { sha: base }, head: { sha: head }, labels: labels.map((name) => ({ name })) },
  }));

  writeEvent([]);
  const blocked = run(repo, ['check', '--paths', 'docs/specs/**'], { GITHUB_EVENT_PATH: eventPath });
  assert.equal(blocked.code, 1);
  assert.match(blocked.stderr, /no-decision/);

  writeEvent(['no-decision']);
  const allowed = run(repo, ['check', '--paths', 'docs/specs/**'], { GITHUB_EVENT_PATH: eventPath });
  assert.equal(allowed.code, 0);
});
```

- [ ] **Step 2: Uruchom test**

Run: `node --test test/e2e.test.mjs`
Expected: PASS — 2 testy

- [ ] **Step 3: Uruchom cały zestaw**

Run: `npm test`
Expected: PASS — wszystkie testy jednostkowe + e2e

- [ ] **Step 4: Commit**

```bash
git add test/e2e.test.mjs
git commit -m "test: pelna petla e2e w katalogu tymczasowym"
```

---

### Task 11: Plugin Claude Code

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/skills/decisions-format/SKILL.md`
- Create: `.claude-plugin/skills/knowledge-audit/SKILL.md`
- Create: `.claude-plugin/commands/knowledge-init.md`
- Create: `.claude-plugin/commands/transcript-extract.md`

**Interfaces:**
- Consumes: CLI z Task 9
- Produces: brak API dla kodu

- [ ] **Step 1: Utwórz manifest**

```json
{
  "name": "repobrain",
  "version": "0.1.0",
  "description": "Warstwa wiedzy w repo: DECISIONS.md jako zrodlo prawdy, skrot generowany do CLAUDE.md, egzekwowanie w CI"
}
```

- [ ] **Step 2: Utwórz skill formatu decyzji**

````markdown
---
name: decisions-format
description: Use when writing or editing an entry in docs/DECISIONS.md, when recording a project decision, or when a decision changes or reverses an earlier one. Defines the DEC entry format that repoBrain's CI gates validate.
---

# Format wpisu DEC

Wpisy żyją w `docs/DECISIONS.md`. Bramka CI `integrity` odrzuca każdy nagłówek `## `,
który nie jest kompletnym wpisem — nie ma cichego pomijania.

## Szablon

```markdown
## DEC-NNN — YYYY-MM-DD
**Odwraca:** DEC-XXX
**Zmienia:** DEC-XXX
**Obszar:** tag, tag
**Scope:** w cenie
**Źródło:** Transcripts/YYYY-MM-DD-slug.md
**Temat:** jedno zdanie
**Kontekst:** dlaczego temat się pojawił
**Decyzja:** co ustalono
**Konsekwencje:** co to zmienia w kodzie, kosztach, harmonogramie
**Podjął:** kto i gdzie
```

## Reguły twarde

- Wymagane: `Temat`, `Kontekst`, `Decyzja`, `Konsekwencje`, `Podjął`.
- Data ściśle `YYYY-MM-DD` z zerami wiodącymi. Separator `-`, `–` lub `—`.
- `Scope:` przyjmuje wyłącznie `w cenie`, `change request`, `do wyceny`.
- **Nigdy nie dopisuj pola `Status:`** — status wynika z relacji i jest wyliczany.
- Nowy wpis dopisuj **na końcu pliku**.
- Nigdy nie edytuj bloku `WYGENEROWANE:decyzje` w `CLAUDE.md`. Uruchom `npx … index`.

## Którą relację wybrać

| Sytuacja | Pole |
|---|---|
| Poprzednia decyzja przestaje obowiązywać w całości | `Odwraca:` |
| Poprzednia obowiązuje dalej, doprecyzowujesz fragment | `Zmienia:` |
| Temat niezwiązany z żadną wcześniejszą | żadne |

Wpis nie może deklarować obu relacji naraz. Relacja musi wskazywać na wpis wcześniejszy
wg pary (data, numer ID).

Przy wątpliwości między `Odwraca:` a `Zmienia:` zadaj pytanie: *czy po tej zmianie
ktokolwiek nadal działa według starego wpisu?* Jeśli tak — `Zmienia:`.

## Po edycji

Uruchom `npx … index` i zacommituj `CLAUDE.md` razem z `DECISIONS.md`. Bez tego
bramka `index-fresh` zablokuje merge.
````

- [ ] **Step 3: Utwórz skill audytu**

````markdown
---
name: knowledge-audit
description: Use when asked to audit the repo's knowledge layer, check for documentation drift, find orphaned documents, or review how often the no-decision label is being used. Reports problems that CI gates deliberately do not block on.
---

# Audyt warstwy wiedzy

Bramki CI łapią pojedyncze zdarzenia. Ten audyt łapie dryf systemowy — rzeczy,
których blokowanie dałoby fałszywe alarmy.

## Zakres

**1. Zgubione decyzje.** Dla każdego `Transcripts/*.md` z sekcją „Key Decisions"
sprawdź, czy istnieje wpis DEC z `Źródło:` wskazującym na ten plik. Brak = ostrzeżenie,
nie błąd — nie każda decyzja z callu zasługuje na wpis.

**2. Użycia furtki.** Policz PR-y z etykietą `no-decision` z ostatnich 30 dni:

```bash
gh pr list --label no-decision --state all --limit 100 \
  --json number,title,mergedAt,author
```

Rosnąca liczba oznacza, że ścieżki decyzyjne są za szerokie albo bramka jest obchodzona.
Zaraportuj liczbę i listę — to jedyna obrona przed cichym znormalizowaniem furtki.

**3. Dokumenty bez odsyłaczy.** Pliki w `docs/`, do których nic w repo nie linkuje:

```bash
git ls-files 'docs/*' | grep -E '\.(md|html)$' | while read -r f; do
  n=$(grep -rl --exclude-dir=.git -F "$(basename "$f")" . | grep -v "^./$f$" | wc -l)
  [ "$n" = 0 ] && echo "$f"
done
```

Raportuj listę do przejrzenia. Nie proponuj hurtowego kasowania — część to legalne archiwum.

**4. Martwe linki wewnętrzne.** Odsyłacze w `docs/`, które się nie rozwiązują.
Świadomie poza bramką CI: część to ścieżki względne rozwiązywane z innych katalogów,
więc blokowanie dawałoby fałszywe alarmy.

## Format raportu

Sekcje wyżej, każde znalezisko z ustaloną wagą (`błąd` / `ostrzeżenie` / `do przejrzenia`)
i konkretną ścieżką. Bez propozycji zmian, dopóki użytkownik o nie nie poprosi.
````

- [ ] **Step 4: Utwórz komendę instalacji**

```markdown
---
description: Zainstaluj repoBrain w bieżącym repo — DECISIONS.md, workflow CI, sekcja w CLAUDE.md
allowed-tools: Bash, Read, Edit
---

Zainstaluj repoBrain w tym repozytorium.

## Krok 1 — uruchom instalator

```bash
npx --yes github:monterail/repobrain init
```

Instalator nigdy nie nadpisuje istniejących plików. Raportuje, co dołożył (`+`),
a co pominął (`=`).

## Krok 2 — uzupełnij to, czego instalator nie mógł zgadnąć

1. **Ścieżki decyzyjne** w `.github/workflows/knowledge.yml`. Zacznij wąsko —
   `docs/specs/**` i pliki cenowe. Nie dodawaj katalogu migracji na starcie: większość
   migracji nie ma za sobą decyzji klienckiej, a złapanie ich zamieni etykietę
   `no-decision` w odruch.
2. **Pełny SHA** repoBrain w tym samym pliku. Nigdy tag — tagi gita są mutowalne,
   a to zdalny kod wykonywany w CI.
3. **Branch protection**: „require branches to be up to date before merging". Bez tego
   dwa PR-y mogą dodać ten sam numer DEC i auto-zmergować się, psując `main`.

## Krok 3 — pierwsza generacja

```bash
npx --yes github:monterail/repobrain index
```

Zacommituj `docs/DECISIONS.md` i `CLAUDE.md` razem.

## Krok 4 — zaraportuj użytkownikowi

Co powstało, co zostało pominięte i które z trzech uzupełnień z kroku 2 nadal czekają.
```

- [ ] **Step 5: Utwórz komendę ekstrakcji transkryptu**

````markdown
---
description: Wyciągnij z transkryptu decyzje, niepewności i zadania; rozwieź je do właściwych miejsc
argument-hint: <ścieżka do transkryptu>
allowed-tools: Read, Write, Edit, Bash
---

Przetwórz transkrypt: **$ARGUMENTS**

## Krok 1 — przeczytaj i podsumuj

Zapisz podsumowanie do `Transcripts/YYYY-MM-DD-slug.md` (datę weź z nazwy pliku
lub treści). Katalog utwórz, jeśli nie istnieje. Szablon:

```markdown
# Podsumowanie — [data] — [temat]

**Typ:** klient / wewnętrzne / discovery / vendor
**Uczestnicy:** …
**Język:** PL / EN

## Kontekst
[1-2 zdania: po co było to spotkanie]

## Decyzje
| # | Decyzja | Kto | Uwagi |
|---|---------|-----|-------|

## Zadania
| Zadanie | Kto | Termin | Priorytet |
|---------|-----|--------|-----------|

## Otwarte pytania
- …

## Cytaty
> "[dokładny cytat]" — [kto]
```

Nie zmyślaj. Cokolwiek niejasne oznacz `[verify]` i zgłoś użytkownikowi —
bramka `integrity` odrzuci `[verify]`, który zostanie w `DECISIONS.md`.

## Krok 2 — sklasyfikuj według trwałości

Kryterium routingu to **cykl życia pozycji**, nie jej typ. Decyzja obowiązuje,
aż ktoś ją odwróci; zadanie umiera po wykonaniu.

| Typ | Cel |
|---|---|
| Decyzja | draft wpisu DEC → `docs/DECISIONS.md` |
| Niepewność, założenie | `HYPOTHESES.md` |
| Zadanie | lista do wklejenia w Jirę — **nie do repo** |
| Cytat | zostaje w podsumowaniu jako dowód |

Zadania nie trafiają do repo: jako listy TODO w `docs/` nikt ich nie zamyka.

## Krok 3 — przygotuj drafty wpisów DEC

Format wg skilla `decisions-format`. W każdym drafcie ustaw `Źródło:` na plik
podsumowania z kroku 1. Gdy decyzję podjął klient, `Źródło:` jest wymagane.
Ustaw `Scope:`, jeśli z rozmowy wynika, czy rzecz jest w cenie.

Jeśli decyzja modyfikuje wcześniejszą — dobierz `Odwraca:` albo `Zmienia:` wg pytania:
*czy ktokolwiek nadal działa według starego wpisu?*

## Krok 4 — pokaż i poczekaj

**Nie zapisuj niczego poza podsumowaniem z kroku 1 bez zgody użytkownika.**
Pokaż drafty, zapytaj, które zastosować. Po akceptacji dopisz je na końcu
`docs/DECISIONS.md`, uruchom `npx --yes github:monterail/repobrain index`
i pokaż, co się zmieniło.
````

- [ ] **Step 6: Sprawdź poprawność JSON i uruchom pełny zestaw**

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); console.log('plugin.json OK')"
npm test
```
Expected: `plugin.json OK` + wszystkie testy przechodzą

- [ ] **Step 7: Commit**

```bash
git add .claude-plugin
git commit -m "feat: plugin Claude Code - skille formatu i audytu, komendy init i transcript-extract"
```

---

## Kolejność i zależności

```
Task 1 (parser) ──► Task 2 (twardy błąd nagłówka)
       │
       ├──► Task 3 (derywacja) ──► Task 4 (walidacja relacji)
       │                                    │
       ├──► Task 5 (render) ────────────────┤
       │                                    ▼
       ├──► Task 6 (integralność) ──► Task 7 (bramki) ──► Task 9 (CLI) ──► Task 10 (e2e)
       │                                                        ▲
       └──► Task 8 (szablony, init) ────────────────────────────┘
                                                                 
Task 11 (plugin) — po Task 9
```

Taski 5, 6 i 8 są niezależne od siebie i mogą powstać równolegle.

## Definition of done

- [ ] `npm test` zielone — wszystkie testy jednostkowe i e2e
- [ ] `grep -rnE "process\.(env|argv|cwd)|node:fs|node:child_process" lib/*.mjs` (bez testów) nie zwraca nic
- [ ] `npx --yes github:<org>/repobrain#<SHA> check` działa w świeżym klonie
- [ ] `package.json` nadal bez `dependencies` i `devDependencies`
- [ ] Anonimizacja `docs/design/` przed upublicznieniem repo (patrz README)

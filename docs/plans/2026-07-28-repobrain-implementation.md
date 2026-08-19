# repoBrain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build repoBrain — a CLI plus a Claude Code plugin that keeps `docs/DECISIONS.md` as the single source of truth and generates from it a block of active decisions into `CLAUDE.md`, enforcing consistency with three CI gates.

**Architecture:** A pure core in `lib/` (parser → relation graph → render), with no dependency on the Claude Code API or the GitHub Actions API. Two consumption paths for the same code: `bin/knowledge.mjs` run through `npx` in CI, and a plugin with commands for the team. Validation returns lists of errors instead of throwing — CI should show every problem at once, not the first one.

**Tech Stack:** Node ≥20, ESM, **zero production and development dependencies**. Tests: the built-in `node:test`. No transpilation, no bundler, no linter.

## Global Constraints

- **Zero dependencies.** `package.json` has neither `dependencies` nor `devDependencies`. Built-in modules only (`node:fs`, `node:path`, `node:test`, `node:assert`, `node:child_process`, `node:os`).
- **The architectural invariant:** `lib/` may not import anything tied to Claude Code or GitHub Actions. Environment context (paths, variables, `GITHUB_EVENT_PATH`) is read exclusively by `bin/knowledge.mjs` and passed into `lib/` as arguments.
- **All files are `.mjs`**, `"type": "module"` in `package.json`.
- **Date separator in the DEC heading:** `-`, `–`, `—` are accepted.
- **Date format:** strictly `YYYY-MM-DD` with leading zeros. `2026-9-3` is an error.
- **Required DEC entry fields:** `Topic`, `Context`, `Decision`, `Consequences`, `Decided by`.
- **Optional fields:** `Reverses`, `Changes`, `Area`, `Scope`, `Source`.
- **Allowed `Scope:` values** — exactly: `in scope`, `change request`, `needs estimate`.
- **A closed list of placeholders:** `[date]`, `[fill in]`, `[TBD]`, `[verify]`, `TODO`. Never an "any `[...]`" pattern.
- **Markers of the generated block:** opening `<!-- GENERATED:decisions — do not edit. Run: node <kit>/bin/knowledge.mjs index -->`, closing `<!-- /GENERATED:decisions -->`.
- **The generator never appends at the end of the file.** Missing markers = an error telling you to run `init`.
- **The installer never overwrites existing files.**
- **Error messages in English**, with a line number, in the format `<line>: <description>`.
- **The parser skips lines inside fenced blocks** (```` ``` ````). `DECISIONS.md` documents its own format with examples, so `## DEC-NNN — YYYY-MM-DD` inside a code block must not be treated as a heading. Without this the template from Task 8 breaks the `integrity` gate right after installation.
- Every validating function returns `{ errors: string[], ... }`. Exceptions are reserved for programmer errors (missing markers in `CLAUDE.md`).

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | `bin`, `type: module`, the test script. Zero dependencies |
| `lib/parse.mjs` | `DECISIONS.md` text → DEC objects + syntax errors per entry |
| `lib/status.mjs` | DEC objects → the active set and history + relation errors between entries |
| `lib/render.mjs` | the active set → markdown; splicing the block between the markers |
| `lib/integrity.mjs` | rules that need the filesystem and policy (`Source:`, placeholders, `Scope:`) |
| `lib/gates.mjs` | the three CI gates composed from the above |
| `lib/init.mjs` | scaffolding without overwriting |
| `bin/knowledge.mjs` | the only place that knows the environment: argv, cwd, CI variables |
| `templates/*` | the skeletons `init` inserts |
| `lib/*.test.mjs` | unit tests next to the modules |
| `test/e2e.test.mjs` | the full loop in a temporary directory |
| `.claude-plugin/**` | the plugin: manifest, skills, commands |

### Kontrakt danych

The DEC object produced by `parseDecisions`:

```js
{
  id: 'DEC-039',        // znormalizowane do 3 cyfr
  num: 39,              // a number, for ordering
  date: '2026-07-20',
  reverses: 'DEC-036' | null,   // Reverses
  changes: 'DEC-036' | null,    // Changes
  area: ['billing', 'webhooks'],  // Area; [] when absent
  scope: 'in scope' | null,
  source: 'Transcripts/x.md' | null,  // Source
  topic: 'tekst',       // Topic
  context: 'tekst',     // Context
  decision: 'tekst',    // Decision
  consequences: 'tekst',// Consequences
  decidedBy: 'text',    // Decided by
  line: 12              // the heading's line, 1-indexed
}
```

Wynik `deriveStatus`:

```js
{
  active:  [{ dec, changedBy: ['DEC-039'] }],   // changedBy: [] when nobody changes it
  history: [{ dec, reversedBy: 'DEC-033' }],
  errors:  string[]
}
```

### Filling a gap in the spec

The spec (§3) requires `Source:` "when `Decided by:` names the client", but does not define how the tool knows who the client is. The resolution: an optional `--client-names <list>` argument. Without it the rule does not apply — a project enables it deliberately. Zero default configuration.

---

### Task 1: Package skeleton and the DEC entry parser

**Files:**
- Create: `package.json`
- Create: `lib/parse.mjs`
- Test: `lib/parse.test.mjs`

**Interfaces:**
- Consumes: nic
- Produces: `parseDecisions(text: string) → { decs: Dec[], errors: string[] }`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "repobrain",
  "version": "0.1.0",
  "description": "A knowledge layer inside the repo, enforced by CI",
  "type": "module",
  "bin": { "repobrain": "bin/knowledge.mjs" },
  "scripts": { "test": "node --test" },
  "engines": { "node": ">=20" },
  "license": "MIT"
}
```

- [ ] **Step 2: Write a failing test**

```js
// lib/parse.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecisions } from './parse.mjs';

const VALID = `# Decisions

## DEC-039 — 2026-07-20
**Changes:** DEC-036
**Area:** billing, webhooki
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
**Context:** K
**Decision:** D
**Consequences:** KO
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
**Context:** K
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
**Context:** K
**Decision:** D
**Consequences:** KO
**Decided by:** Z
`;
  const { decs, errors } = parseDecisions(bad);
  assert.equal(decs.length, 0);
  assert.equal(errors.length, 1);
});

test('rejects an invalid Scope value', () => {
  const bad = VALID.replace('**Scope:** in scope', '**Scope:** gratis');
  const { errors } = parseDecisions(bad);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Scope/);
});

test('normalises the ID to three digits', () => {
  const short = `## DEC-7 — 2026-01-05
**Topic:** T
**Context:** K
**Decision:** D
**Consequences:** KO
**Decided by:** Z
`;
  const { decs } = parseDecisions(short);
  assert.equal(decs[0].id, 'DEC-007');
  assert.equal(decs[0].num, 7);
});
```

- [ ] **Step 3: Run the test, confirm it fails**

Run: `node --test lib/parse.test.mjs`
Expected: FAIL — `Cannot find module './parse.mjs'`

- [ ] **Step 4: Implement `lib/parse.mjs`**

```js
// lib/parse.mjs
const HEADING = /^##\s+(.+?)\s*$/;
const DEC_HEADING = /^DEC-(\d+)\s*[-–—]\s*(\d{4}-\d{2}-\d{2})$/;
const FIELD = /^\*\*([^:*]+):\*\*\s*(.*)$/;

const REQUIRED = ['Topic', 'Context', 'Decision', 'Consequences', 'Decided by'];
const OPTIONAL = ['Reverses', 'Changes', 'Area', 'Scope', 'Source'];
const SCOPES = ['in scope', 'change request', 'needs estimate'];

const KEY = {
  Topic: 'topic', Context: 'context', Decision: 'decision',
  Consequences: 'consequences', 'Decided by': 'decidedBy',
  Reverses: 'reverses', Changes: 'changes', Area: 'area',
  Scope: 'scope', 'Source': 'source',
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
    if (!raw[name]) errors.push(`${headingLine}: missing required field ${name}`);
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
      errors.push(`${i + 1}: heading "## ${h[1]}" is not a valid DEC entry`);
      i = j - 1;
      continue;
    }

    const { raw, errors: fieldErrors } = parseFields(lines.slice(i + 1, j), i + 1);
    errors.push(...fieldErrors);

    if (raw.Scope && !SCOPES.includes(raw.Scope)) {
      errors.push(`${i + 1}: invalid Scope value "${raw.Scope}" (allowed: ${SCOPES.join(', ')})`);
    }

    if (fieldErrors.length === 0) {
      const dec = {
        id: normalizeId(m[1]),
        num: Number(m[1]),
        date: m[2],
        line: i + 1,
        area: raw.Area ? raw.Area.split(',').map((s) => s.trim()).filter(Boolean) : [],
      };
      for (const name of [...REQUIRED, ...OPTIONAL]) {
        if (name === 'Area') continue;
        const key = KEY[name];
        let value = raw[name] ?? null;
        if ((name === 'Reverses' || name === 'Changes') && value) {
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

- [ ] **Step 5: Run the tests, confirm they pass**

Run: `node --test lib/parse.test.mjs`
Expected: PASS — 7 tests

- [ ] **Step 6: Commit**

```bash
git add package.json lib/parse.mjs lib/parse.test.mjs
git commit -m "feat: DEC entry parser with required-field validation"
```

---

### Task 2: A hard error on an unparseable heading

The spec's rule §4.2: a `## ` heading that is not a valid DEC entry must be a hard error. Without it a typo makes a decision vanish silently under a green CI — a state worse than the lying `Status:` from that project. Task 1 already returns the error; this task covers it with tests and closes the edge cases.

**Files:**
- Modify: `lib/parse.test.mjs` (append tests)
- Modify: `lib/parse.mjs` (if the tests reveal a gap)

**Interfaces:**
- Consumes: `parseDecisions` z Task 1
- Produces: nothing new

- [ ] **Step 1: Add tests**

```js
// lib/parse.test.mjs — append at the end

test('a non-DEC heading is a hard error, not a silent skip', () => {
  const text = `## Refinement notes
Some text here.

## DEC-001 — 2026-01-05
**Topic:** T
**Context:** K
**Decision:** D
**Consequences:** KO
**Decided by:** Z
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
**Context:** K
**Decision:** D
**Consequences:** KO
**Decided by:** Z
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
```

- [ ] **Step 2: Run the tests**

Run: `node --test lib/parse.test.mjs`
Expected: PASS — the implementation from Task 1 satisfies these rules. If one fails, fix `lib/parse.mjs` and run again.

- [ ] **Step 3: Commit**

```bash
git add lib/parse.test.mjs lib/parse.mjs
git commit -m "test: hard error on an unparseable DEC heading"
```

---

### Task 3: Derywacja statusu z relacji Reverses i Changes

**Files:**
- Create: `lib/status.mjs`
- Test: `lib/status.test.mjs`

**Interfaces:**
- Consumes: `Dec[]` z `parseDecisions`
- Produces: `deriveStatus(decs: Dec[]) → { active: {dec, changedBy: string[]}[], history: {dec, reversedBy: string}[], errors: string[] }`

- [ ] **Step 1: Write a failing test**

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
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `node --test lib/status.test.mjs`
Expected: FAIL — `Cannot find module './status.mjs'`

- [ ] **Step 3: Implement `lib/status.mjs`**

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

  // assert: with "backwards only" enforced, a cycle is impossible.
  // This check is not a product feature — it guards the rule against regression.
  for (const d of decs) {
    const t = d.reverses ?? d.changes;
    if (t && byId.get(t)?.reverses === d.id) {
      errors.push(`${d.line}: cykl relacji ${d.id} ↔ ${t}`);
    }
  }

  return { active, history, errors };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test lib/status.test.mjs`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add lib/status.mjs lib/status.test.mjs
git commit -m "feat: derive status from the Reverses and Changes relations"
```

---

### Task 4: Validating relations between entries

**Files:**
- Modify: `lib/status.mjs`
- Modify: `lib/status.test.mjs`

**Interfaces:**
- Consumes: `deriveStatus` z Task 3
- Produces: no signature change; an extended `errors` list

- [ ] **Step 1: Add failing tests**

```js
// lib/status.test.mjs — append at the end

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
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `node --test lib/status.test.mjs`
Expected: FAIL — the 6 new tests fail, the 6 from Task 3 pass

- [ ] **Step 3: Replace `lib/status.mjs` entirely**

The version below replaces the file from Task 3. The "assert: cycle" block from Task 3 disappears — with "backwards only" enforced a cycle is mathematically impossible, and dead code misleads the reader.

```js
// lib/status.mjs
const order = (d) => `${d.date}#${String(d.num).padStart(6, '0')}`;

export function deriveStatus(decs) {
  const errors = [];
  const byId = new Map(decs.map((d) => [d.id, d]));

  // --- validation runs before the graph is built ---
  const seen = new Set();
  for (const d of decs) {
    if (seen.has(d.id)) errors.push(`${d.line}: duplikat ID ${d.id}`);
    seen.add(d.id);
  }

  for (const d of decs) {
    if (d.reverses && d.changes) {
      errors.push(`${d.line}: ${d.id} declares both Reverses and Changes — only one relation is allowed`);
      continue;
    }
    const target = d.reverses ?? d.changes;
    if (!target) continue;
    const t = byId.get(target);
    if (!t) {
      errors.push(`${d.line}: ${d.id} points at ${target}, which does not exist`);
      continue;
    }
    if (order(t) >= order(d)) {
      errors.push(`${d.line}: ${d.id} must point at an entry earlier than ${target}`);
    }
  }

  // A relation cycle is impossible: every relation must point backwards by the
  // (date, ID) pair, and that order is linear. The validation above guarantees it.

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
      errors.push(`${d.line}: ${d.id} changes ${d.changes}, which was reversed by ${reversedBy.get(d.changes)}`);
    }
  }

  // --- split into active and history, newest first ---
  const sorted = [...decs].sort((a, b) => (order(a) < order(b) ? 1 : -1));
  const active = [];
  const history = [];
  for (const d of sorted) {
    if (reversedBy.has(d.id)) {
      history.push({ dec: d, reversedBy: reversedBy.get(d.id) });
    } else {
      // An entry that was itself reversed can no longer "change" its target —
      // jego doprecyzowanie umiera razem z nim.
      const changers = (changedBy.get(d.id) ?? []).filter((id) => !reversedBy.has(id));
      active.push({ dec: d, changedBy: changers.sort() });
    }
  }

  return { active, history, errors };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test lib/status.test.mjs`
Expected: PASS — 12 tests

- [ ] **Step 5: Commit**

```bash
git add lib/status.mjs lib/status.test.mjs
git commit -m "feat: validation of relations between DEC entries"
```

---

### Task 5: Rendering the block and splicing it between the markers

**Files:**
- Create: `lib/render.mjs`
- Test: `lib/render.test.mjs`

**Interfaces:**
- Consumes: wynik `deriveStatus`
- Produces:
  - `renderBlock({active, history}) → string` — the block content itself, without markers
  - `spliceBlock(claudeMd: string, block: string) → string` — throws `Error` when the markers are missing
  - `OPEN_MARKER`, `CLOSE_MARKER` — exported constants

- [ ] **Step 1: Write a failing test**

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

test('renders the table of active decisions', () => {
  const out = renderBlock({
    active: [{ dec: dec(2, '2026-02-01', 'Second topic', ['auth']), changedBy: [] }],
    history: [],
  });
  assert.match(out, /\| DEC \| Data \| Area \| Topic \|/);
  assert.match(out, /\| DEC-002 \| 2026-02-01 \| auth \| Second topic \|/);
});

test('annotates entries changed by later ones', () => {
  const out = renderBlock({
    active: [{ dec: dec(1, '2026-01-01', 'Pierwszy'), changedBy: ['DEC-002'] }],
    history: [],
  });
  assert.match(out, /First \*\(changed by DEC-002\)\*/);
});

test('the history section appears only when something was reversed', () => {
  const without = renderBlock({ active: [{ dec: dec(1, '2026-01-01', 'A'), changedBy: [] }], history: [] });
  assert.doesNotMatch(without, /Reversed/);

  const z = renderBlock({
    active: [],
    history: [{ dec: dec(1, '2026-01-01', 'A'), reversedBy: 'DEC-002' }],
  });
  assert.match(z, /Reversed/);
  assert.match(z, /DEC-001.*reversed by DEC-002/);
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
  assert.match(out, /Tekst przed\./);
  assert.match(out, /Tekst po\./);
  assert.equal(out.match(new RegExp(CLOSE_MARKER.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&'), 'g')).length, 1);
});

test('spliceBlock is idempotent', () => {
  const md = `${OPEN_MARKER}\nx\n${CLOSE_MARKER}\n`;
  assert.equal(spliceBlock(spliceBlock(md, 'y'), 'y'), spliceBlock(md, 'y'));
});

test('missing markers is an error pointing at init, not an append at the end', () => {
  assert.throws(() => spliceBlock('# Projekt\nbez znacznikow\n', 'x'), /init/);
});

test('an opening marker without a closing one is an error', () => {
  assert.throws(() => spliceBlock(`${OPEN_MARKER}\nx\n`, 'y'), /znacznik/);
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `node --test lib/render.test.mjs`
Expected: FAIL — `Cannot find module './render.mjs'`

- [ ] **Step 3: Implement `lib/render.mjs`**

```js
// lib/render.mjs
export const OPEN_MARKER = '<!-- GENERATED:decisions — do not edit. Run: node <kit>/bin/knowledge.mjs index -->';
export const CLOSE_MARKER = '<!-- /GENERATED:decisions -->';

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|');

export function renderBlock({ active, history }) {
  const out = [];

  if (active.length === 0) {
    out.push('_No active decisions._');
  } else {
    out.push('| DEC | Data | Area | Topic |');
    out.push('|-----|------|--------|-------|');
    for (const { dec, changedBy } of active) {
      const suffix = changedBy.length ? ` *(changed by ${changedBy.join(', ')})*` : '';
      out.push(`| ${dec.id} | ${dec.date} | ${cell(dec.area.join(', '))} | ${cell(dec.topic)}${suffix} |`);
    }
  }

  if (history.length > 0) {
    out.push('');
    out.push('**Reversed (history):**');
    out.push('');
    for (const { dec, reversedBy } of history) {
      out.push(`- ${dec.id} (${dec.date}) — reversed by ${reversedBy}`);
    }
  }

  return out.join('\n');
}

export function spliceBlock(claudeMd, block) {
  const start = claudeMd.indexOf(OPEN_MARKER);
  const end = claudeMd.indexOf(CLOSE_MARKER);

  if (start === -1 && end === -1) {
    throw new Error(
      'No GENERATED:decisions markers in CLAUDE.md. Run `repobrain init` to add them. ' +
      'The generator never appends the block at the end of the file.',
    );
  }
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Broken GENERATED:decisions marker pair in CLAUDE.md — fix it manually.');
  }

  const before = claudeMd.slice(0, start + OPEN_MARKER.length);
  const after = claudeMd.slice(end);
  return `${before}\n${block}\n${after}`;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test lib/render.test.mjs`
Expected: PASS — 9 tests

- [ ] **Step 5: Commit**

```bash
git add lib/render.mjs lib/render.test.mjs
git commit -m "feat: render the decision block and splice it between the markers"
```

---

### Task 6: Integrity rules that depend on the filesystem

**Files:**
- Create: `lib/integrity.mjs`
- Test: `lib/integrity.test.mjs`

**Interfaces:**
- Consumes: `Dec[]` z `parseDecisions`
- Produces: `checkIntegrity({ decs, rawText, clientNames, fileExists }) → string[]`
  - `fileExists` is an injected function `(path: string) => boolean` — it allows testing without touching the disk; `bin/` injects a `node:fs`-based version.
  - `clientNames` is a **comma-separated list of names** (`string | null`), **not a regular expression**. Matching is by substring, case-insensitive. When `null`, an empty string or punctuation alone — the rule does not apply.

- [ ] **Step 1: Write a failing test**

```js
// lib/integrity.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIntegrity } from './integrity.mjs';

const dec = (extra = {}) => ({
  id: 'DEC-001', num: 1, date: '2026-01-01', line: 3,
  reverses: null, changes: null, area: [], scope: null, source: null,
  topic: 'T', context: 'K', decision: 'D', consequences: 'KO', decidedBy: 'The team',
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
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `node --test lib/integrity.test.mjs`
Expected: FAIL — `Cannot find module './integrity.mjs'`

- [ ] **Step 3: Implement `lib/integrity.mjs`**

```js
// lib/integrity.mjs
const PLACEHOLDERS = ['[date]', '[fill in]', '[TBD]', '[verify]', 'TODO'];

export function checkIntegrity({ decs, rawText, clientNames, fileExists }) {
  const errors = [];

  // A list of names, not a regular expression. The input comes from the CLI, and
  // RegExp accepts from the user both syntax errors (an exception — it breaks the
  // breaks the "we never throw" contract) and patterns with catastrophic
  // procesu CI). Dopasowanie po podciagu pokrywa realny przypadek — wskazanie
  // klienta po nazwisku — a obie podatnosci znikaja konstrukcyjnie.
  //
  // A deliberately accepted trade-off: substring matching is looser than
  // wyrazenie regularne. Nazwa "Jo" trafi w "Jozef", "Johanna" i "Major".
  // The direction of the error is safe — the tool demands a Source field where
  // it need not, instead of overlooking a client decision. The operator picks
  // names long enough to avoid collisions.
  const names = (clientNames ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const d of decs) {
    if (d.source && !fileExists(d.source)) {
      errors.push(`${d.line}: ${d.id} — Source points at a missing file ${d.source}`);
    }
    if (names.length) {
      const decidedBy = String(d.decidedBy ?? '').toLowerCase();
      if (names.some((n) => decidedBy.includes(n)) && !d.source) {
        errors.push(`${d.line}: ${d.id} — a client decision requires the Source field`);
      }
    }
  }

  rawText.split('\n').forEach((line, idx) => {
    for (const p of PLACEHOLDERS) {
      if (line.includes(p)) {
        errors.push(`${idx + 1}: unfilled placeholder ${p}`);
      }
    }
  });

  return errors;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test lib/integrity.test.mjs`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add lib/integrity.mjs lib/integrity.test.mjs
git commit -m "feat: integrity rules - Source, client decisions, placeholders"
```

---

### Task 7: The three CI gates

**Files:**
- Create: `lib/gates.mjs`
- Test: `lib/gates.test.mjs`

**Interfaces:**
- Consumes: `parseDecisions`, `deriveStatus`, `renderBlock`, `spliceBlock`, `checkIntegrity`
- Produces:
  - `gateIntegrity({ decisionsText, clientNames, fileExists }) → string[]`
  - `gateIndexFresh({ decisionsText, claudeMdText }) → string[]`
  - `gateDecisionRequired({ changedFiles, paths, labels }) → string[]`

- [ ] **Step 1: Write a failing test**

```js
// lib/gates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateIntegrity, gateIndexFresh, gateDecisionRequired } from './gates.mjs';
import { OPEN_MARKER, CLOSE_MARKER } from './render.mjs';

const DECISIONS = `# Decisions

## DEC-001 — 2026-01-05
**Area:** auth
**Topic:** OTP login
**Context:** K
**Decision:** D
**Consequences:** KO
**Decided by:** The team
`;

test('gateIntegrity returns an empty list for a valid file', () => {
  const errors = gateIntegrity({ decisionsText: DECISIONS, clientNames: null, fileExists: () => true });
  assert.deepEqual(errors, []);
});

test('gateIntegrity aggregates parser, relation and integrity errors', () => {
  const bad = `## Notatka
## DEC-002 — 2026-02-01
**Reverses:** DEC-999
**Topic:** [fill in]
**Context:** K
**Decision:** D
**Consequences:** KO
**Decided by:** Z
`;
  const errors = gateIntegrity({ decisionsText: bad, clientNames: null, fileExists: () => true });
  assert.ok(errors.length >= 3, `oczekiwano >=3 bledow, otrzymano ${errors.length}: ${errors.join(' | ')}`);
  assert.ok(errors.some((e) => /is not a valid DEC entry/.test(e)));
  assert.ok(errors.some((e) => /DEC-999/.test(e)));
  assert.ok(errors.some((e) => /fill in/.test(e)));
});

test('gateIndexFresh passes when the block is up to date', () => {
  const fresh = `# P\n\n${OPEN_MARKER}\n| DEC | Data | Area | Topic |\n|-----|------|--------|-------|\n| DEC-001 | 2026-01-05 | auth | OTP login |\n${CLOSE_MARKER}\n`;
  assert.deepEqual(gateIndexFresh({ decisionsText: DECISIONS, claudeMdText: fresh }), []);
});

test('gateIndexFresh detects a stale block', () => {
  const stale = `# P\n\n${OPEN_MARKER}\nstare\n${CLOSE_MARKER}\n`;
  const errors = gateIndexFresh({ decisionsText: DECISIONS, claudeMdText: stale });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /index/);
});

test('gateIndexFresh reports missing markers instead of throwing', () => {
  const errors = gateIndexFresh({ decisionsText: DECISIONS, claudeMdText: '# P\nbez znacznikow\n' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /init/);
});

test('gateDecisionRequired lets through a PR outside the decision paths', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['src/button.tsx'], paths: ['docs/specs/**'], labels: [],
  });
  assert.deepEqual(errors, []);
});

test('gateDecisionRequired blocks a change on a decision path without DECISIONS.md', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['docs/specs/M01.md'], paths: ['docs/specs/**'], labels: [],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /docs\/specs\/M01\.md/);
  assert.match(errors[0], /no-decision/);
});

test('gateDecisionRequired lets through when DECISIONS.md changed too', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['docs/specs/M01.md', 'docs/DECISIONS.md'], paths: ['docs/specs/**'], labels: [],
  });
  assert.deepEqual(errors, []);
});

test('the no-decision label opens the back door', () => {
  const errors = gateDecisionRequired({
    changedFiles: ['docs/specs/M01.md'], paths: ['docs/specs/**'], labels: ['no-decision'],
  });
  assert.deepEqual(errors, []);
});

test('the ** pattern matches nested directories, * does not cross the separator', () => {
  assert.equal(gateDecisionRequired({
    changedFiles: ['a/b/c/pricing.ts'], paths: ['**/pricing*'], labels: [],
  }).length, 1);
  assert.deepEqual(gateDecisionRequired({
    changedFiles: ['a/b/x.ts'], paths: ['a/*.ts'], labels: [],
  }), []);
});
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `node --test lib/gates.test.mjs`
Expected: FAIL — `Cannot find module './gates.mjs'`

- [ ] **Step 3: Implement `lib/gates.mjs`**

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

  // With relation errors the index cannot be compared meaningfully — the
  // integrity gate reports them. We stay silent so as not to pile on a misleading "index is stale".
  if (errors.length) return [];

  const expected = renderBlock({ active, history });

  let updated;
  try {
    updated = spliceBlock(claudeMdText, expected);
  } catch (err) {
    return [err.message];
  }

  if (updated !== claudeMdText) {
    return ['The GENERATED:decisions block in CLAUDE.md is stale — run `node <kit>/bin/knowledge.mjs index` and commit the result.'];
  }
  return [];
}

// Minimal glob matcher: ** crosses separators, * does not.
// Skanujemy znak po znaku zamiast lancucha .replace() z sentinelami —
// a sentinel can always be typed into the input data, and then the translation lies.
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
    `The PR touches decision paths (${hits.join(', ')}) but leaves ${DECISIONS_PATH} untouched. ` +
    'Add a DEC entry or label the PR `no-decision`.',
  ];
}

export { OPEN_MARKER, CLOSE_MARKER };
```

- [ ] **Step 4: Run the tests**

Run: `node --test lib/gates.test.mjs`
Expected: PASS — 10 tests

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — every test from Tasks 1-7

- [ ] **Step 6: Commit**

```bash
git add lib/gates.mjs lib/gates.test.mjs
git commit -m "feat: three CI gates - integrity, index-fresh, decision-required"
```

---

### Task 8: Templates and scaffolding without overwriting

**Files:**
- Create: `templates/DECISIONS.md`
- Create: `templates/knowledge.yml`
- Create: `templates/CLAUDE-section.md`
- Create: `lib/init.mjs`
- Test: `lib/init.test.mjs`

**Interfaces:**
- Consumes: `OPEN_MARKER`, `CLOSE_MARKER` z `render.mjs`
- Produces: `planInit({ existing: string[] }) → { create: {path, template}[], skip: string[], appendToClaudeMd: boolean }`
  - A pure planning function; writing to disk is done by `bin/knowledge.mjs`. That makes the "never overwrite" rule testable without a filesystem.

- [ ] **Step 1: Create `templates/DECISIONS.md`**

````markdown
# Decision Log

The single source of truth about this project's decisions. A digest of the active
ones is generated from this file into `CLAUDE.md` — do not edit it there by hand.

### Entry format

This section's heading is deliberately third level: every `## ` heading in this file
must be a complete DEC entry, otherwise the `integrity` gate rejects the file.

```markdown
## DEC-NNN — YYYY-MM-DD
**Reverses:** DEC-XXX     (optional — XXX stops applying entirely)
**Changes:** DEC-XXX      (optional — XXX still applies, this entry refines part of it)
**Area:** tag, tag      (opcjonalne)
**Scope:** in scope        (opcjonalne — in scope | change request | needs estimate)
**Source:** Transcripts/YYYY-MM-DD-slug.md   (optional; required for client decisions)
**Topic:** one sentence
**Context:** why the topic came up at all
**Decision:** co ustalono
**Consequences:** co to zmienia w kodzie, kosztach, harmonogramie
**Decided by:** kto i gdzie
```

Zasady:

- Append new entries **at the end of the file** — that way parallel PRs produce a text conflict instead of a silent auto-merge.
- Status is never written down. It follows from the `Reverses:` and `Changes:` fields of later entries.
- A substantive change means a new entry. A corrective edit (typo, date, adding `Source:`) is allowed in place.

---

## DEC-001 — 2026-01-01
**Area:** proces
**Topic:** Project decisions live in this file
**Context:** Knowledge scattered across Slack and transcripts does not survive team rotation.
**Decision:** Every decision that affects scope, cost or architecture lands here as a DEC entry.
**Consequences:** CI blocks PRs on decision paths that carry no entry. A digest of the active decisions is generated into CLAUDE.md.
**Decided by:** The team — repoBrain installation
````

- [ ] **Step 2: Create `templates/knowledge.yml`**

```yaml
name: knowledge

on:
  pull_request:
    # labeled/unlabeled are MANDATORY: without them, adding the
    # `no-decision` label does not retrigger the build and the PR stays red.
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
      # and this is remote code executed in CI with the --yes flag.
      - run: npx --yes github:monterail/repobrain#<PELNY_SHA> check
             --paths 'docs/specs/**,**/pricing*'
```

- [ ] **Step 3: Create `templates/CLAUDE-section.md`**

```markdown
## Sources of truth

1. `docs/DECISIONS.md` — the full text of each decision; `Reverses:`/`Changes:` settle what is current
2. the `GENERATED:decisions` block below — a digest of the active ones, always consistent with (1)
3. `docs/specs/` — kontrakt implementacyjny
4. `Transcripts/` — supporting evidence, when 1-3 are silent

Anything outside this list is a working note, not a source of truth.

<!-- GENERATED:decisions — do not edit. Run: node <kit>/bin/knowledge.mjs index -->
_No active decisions._
<!-- /GENERATED:decisions -->
```

- [ ] **Step 4: Write a failing test**

```js
// lib/init.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInit } from './init.mjs';

test('in an empty repo it plans every file', () => {
  const plan = planInit({ existing: [] });
  const paths = plan.create.map((c) => c.path);
  assert.deepEqual(paths.sort(), ['.github/workflows/knowledge.yml', 'CLAUDE.md', 'docs/DECISIONS.md'].sort());
  assert.deepEqual(plan.skip, []);
});

test('it never overwrites existing files', () => {
  const plan = planInit({ existing: ['docs/DECISIONS.md'] });
  const paths = plan.create.map((c) => c.path);
  assert.ok(!paths.includes('docs/DECISIONS.md'));
  assert.deepEqual(plan.skip, ['docs/DECISIONS.md']);
});

test('an existing CLAUDE.md is appended to, not created', () => {
  const plan = planInit({ existing: ['CLAUDE.md'] });
  assert.ok(!plan.create.some((c) => c.path === 'CLAUDE.md'));
  assert.equal(plan.appendToClaudeMd, true);
  assert.deepEqual(plan.skip, []);
});

test('when CLAUDE.md does not exist it is created, not appended to', () => {
  const plan = planInit({ existing: [] });
  assert.ok(plan.create.some((c) => c.path === 'CLAUDE.md'));
  assert.equal(plan.appendToClaudeMd, false);
});

test('every create entry carries a template name', () => {
  for (const c of planInit({ existing: [] }).create) {
    assert.ok(typeof c.template === 'string' && c.template.length > 0, c.path);
  }
});
```

- [ ] **Step 5: Run the test, confirm it fails**

Run: `node --test lib/init.test.mjs`
Expected: FAIL — `Cannot find module './init.mjs'`

- [ ] **Step 6: Implement `lib/init.mjs`**

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

- [ ] **Step 7: Run the tests**

Run: `node --test lib/init.test.mjs`
Expected: PASS — 5 tests

- [ ] **Step 8: Commit**

```bash
git add templates lib/init.mjs lib/init.test.mjs
git commit -m "feat: templates and installation planning without overwriting"
```

---

### Task 9: CLI

**Files:**
- Create: `bin/knowledge.mjs`

**Interfaces:**
- Consumes: everything from `lib/`
- Produces: the `init`, `index`, `check` commands. Exit code `1` when any gate reports an error.

The only module that knows the environment. `lib/` stays pure — that is the architectural invariant from the spec.

- [ ] **Step 1: Implement `bin/knowledge.mjs`**

```js
#!/usr/bin/env node
// bin/knowledge.mjs — the only place that knows the filesystem, argv and CI env vars.
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
  console.error(`\n✗ repoBrain — ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}:\n`);
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
  for (const path of plan.skip) console.log(`  = ${path} (exists, skipped)`);

  if (plan.appendToClaudeMd) {
    const section = readFileSync(join(KIT_ROOT, 'templates/CLAUDE-section.md'), 'utf8');
    if (readFileSync(CLAUDE_MD, 'utf8').includes('GENERATED:decisions')) {
      console.log('  = CLAUDE.md (markers already present, skipped)');
    } else {
      appendFileSync(CLAUDE_MD, `\n${section}`);
      console.log('  ~ CLAUDE.md (appended the Sources of truth section)');
    }
  }

  console.log('\nStill to fill in by hand:');
  console.log('  1. decision paths in .github/workflows/knowledge.yml');
  console.log('  2. the full repoBrain SHA in the same file (never a tag)');
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
    console.log('✓ CLAUDE.md already up to date');
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
  console.log('✓ repoBrain — all gates green');
}

const COMMANDS = { init: cmdInit, index: cmdIndex, check: cmdCheck };
const command = process.argv[2];

if (!COMMANDS[command]) {
  console.error('Usage: repobrain <init|index|check> [--paths <globs>] [--client-names <list>]');
  process.exit(2);
}
COMMANDS[command]();
```

- [ ] **Step 2: Make it executable and check the help message**

```bash
chmod +x bin/knowledge.mjs
node bin/knowledge.mjs
```
Expected: the message `Usage: repobrain <init|index|check> …`, exit code 2

- [ ] **Step 3: Check that `lib/` knows nothing about the environment**

```bash
grep -rnE "process\.(env|argv|cwd)|node:fs|node:child_process" lib/*.mjs | grep -v '\.test\.mjs'
```
Expected: **no output**. Any hit breaks the architectural invariant — move that code into `bin/`.

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
- Consumes: `bin/knowledge.mjs` as a child process
- Produces: nothing

Pokrywa scenariusz z §7 specu — jedyny sprawdzian „gotowe na kickoff".

- [ ] **Step 1: Write test**

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
${extra}**Area:** proces
**Topic:** Topic ${n}
**Context:** K
**Decision:** D
**Consequences:** KO
**Decided by:** The team
`;

test('full loop: init, index, reversal, change, gates', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'repobrain-e2e-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  // 1. init w pustym repo
  assert.equal(run(repo, ['init']).code, 0);
  const claude = join(repo, 'CLAUDE.md');
  const decisions = join(repo, 'docs/DECISIONS.md');
  assert.match(readFileSync(claude, 'utf8'), /GENERATED:decisions/);
  assert.match(readFileSync(decisions, 'utf8'), /DEC-001/);

  // 2. index — DEC-001 from the template lands in the block
  assert.equal(run(repo, ['index']).code, 0);
  assert.match(readFileSync(claude, 'utf8'), /DEC-001/);

  // 3. DEC-002 odwraca DEC-001
  appendFileSync(decisions, ENTRY(2, '2026-02-01', '**Reverses:** DEC-001\n'));
  assert.equal(run(repo, ['index']).code, 0);
  let block = readFileSync(claude, 'utf8');
  assert.match(block, /Reversed/);
  assert.match(block, /DEC-001.*reversed by DEC-002/);

  // 4. DEC-003 changes DEC-002 — both stay active
  appendFileSync(decisions, ENTRY(3, '2026-03-01', '**Changes:** DEC-002\n'));
  assert.equal(run(repo, ['index']).code, 0);
  block = readFileSync(claude, 'utf8');
  assert.match(block, /DEC-002.*changed by DEC-003/);
  assert.match(block, /DEC-003/);

  // 5. check po regeneracji — zielone
  assert.equal(run(repo, ['check']).code, 0);

  // 6. stale block — red
  appendFileSync(decisions, ENTRY(4, '2026-04-01'));
  const stale = run(repo, ['check']);
  assert.equal(stale.code, 1);
  assert.match(stale.stderr, /stale/);

  assert.equal(run(repo, ['index']).code, 0);
  assert.equal(run(repo, ['check']).code, 0);
});

test('the decision-required gate blocks and yields to the label', (t) => {
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
  execFileSync('git', ['commit', '-qm', 'spec without a decision'], { cwd: repo });
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

- [ ] **Step 2: Run the test**

Run: `node --test test/e2e.test.mjs`
Expected: PASS — 2 testy

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS — every unit test + e2e

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
- Produces: no API for code

- [ ] **Step 1: Create the manifest**

```json
{
  "name": "repobrain",
  "version": "0.1.0",
  "description": "A knowledge layer inside the repo: DECISIONS.md as the source of truth, a digest generated into CLAUDE.md, enforced in CI"
}
```

- [ ] **Step 2: Create the decision-format skill**

````markdown
---
name: decisions-format
description: Use when writing or editing an entry in docs/DECISIONS.md, when recording a project decision, or when a decision changes or reverses an earlier one. Defines the DEC entry format that repoBrain's CI gates validate.
---

# DEC entry format

Entries live in `docs/DECISIONS.md`. The `integrity` CI gate rejects every `## ` heading
that is not a complete entry — nothing is skipped silently.

## Template

```markdown
## DEC-NNN — YYYY-MM-DD
**Reverses:** DEC-XXX
**Changes:** DEC-XXX
**Area:** tag, tag
**Scope:** in scope
**Source:** Transcripts/YYYY-MM-DD-slug.md
**Topic:** one sentence
**Context:** why the topic came up
**Decision:** co ustalono
**Consequences:** co to zmienia w kodzie, kosztach, harmonogramie
**Decided by:** kto i gdzie
```

## Hard rules

- Wymagane: `Topic`, `Context`, `Decision`, `Consequences`, `Decided by`.
- The date is strictly `YYYY-MM-DD` with leading zeros. Separator `-`, `–` or `—`.
- `Scope:` accepts only `in scope`, `change request`, `needs estimate`.
- **Never add a `Status:` field** — status follows from the relations and is derived.
- Append a new entry **at the end of the file**.
- Never edit the `GENERATED:decisions` block in `CLAUDE.md`. Run `node <kit>/bin/knowledge.mjs index`.

## Which relation to pick

| Situation | Field |
|---|---|
| The previous decision stops applying entirely | `Reverses:` |
| The previous one still applies, you are refining part of it | `Changes:` |
| A topic unrelated to any earlier one | neither |

An entry may not declare both relations at once. The relation must point at an earlier
wg pary (data, numer ID).

When torn between `Reverses:` and `Changes:`, ask: *after this change, is anyone still
operating under the old entry?* If yes — `Changes:`.

## Po edycji

Run `node <kit>/bin/knowledge.mjs index` and commit `CLAUDE.md` together with `DECISIONS.md`. Without that
the `index-fresh` gate blocks the merge.
````

- [ ] **Step 3: Create the audit skill**

````markdown
---
name: knowledge-audit
description: Use when asked to audit the repo's knowledge layer, check for documentation drift, find orphaned documents, or review how often the no-decision label is being used. Reports problems that CI gates deliberately do not block on.
---

# Audyt warstwy wiedzy

CI gates catch single events. This audit catches systemic drift — the things that would
produce false alarms if you blocked on them.

## Zakres

**1. Lost decisions.** For every `Transcripts/*.md` with a "Key Decisions" section,
check whether a DEC entry exists whose `Source:` points at that file. Missing = a warning,
not an error — not every decision from a call deserves an entry.

**2. Back door usage.** Count PRs labelled `no-decision` from the last 30 days:

```bash
gh pr list --label no-decision --state all --limit 100 \
  --json number,title,mergedAt,author
```

A rising count means the decision paths are too broad or the gate is being worked around.
Report the count and the list — this is the only defence against the back door being quietly normalised.

**3. Unreferenced documents.** Files in `docs/` that nothing in the repo links to:

```bash
git ls-files 'docs/*' | grep -E '\.(md|html)$' | while read -r f; do
  n=$(grep -rl --exclude-dir=.git -F "$(basename "$f")" . | grep -v "^./$f$" | wc -l)
  [ "$n" = 0 ] && echo "$f"
done
```

Report the list for review. Do not propose deleting them wholesale — some are a legitimate archive.

**4. Dead internal links.** References inside `docs/` that do not resolve.
Deliberately outside the CI gate: some are relative paths resolved from other directories,
so blocking on them would produce false alarms.

## Format raportu

The sections above, each finding with an assigned severity (`error` / `warning` / `review`)
and a concrete path. No proposed changes until the user asks for them.
````

- [ ] **Step 4: Create the installation command**

```markdown
---
description: Install repoBrain in the current repo — DECISIONS.md, CI workflow, CLAUDE.md section
allowed-tools: Bash, Read, Edit
---

Install repoBrain in this repository.

## Step 1 — run the installer

```bash
npx --yes github:monterail/repobrain init
```

The installer never overwrites existing files. It reports what it added (`+`)
and what it skipped (`=`).

## Step 2 — fill in what the installer could not guess

1. **Decision paths** in `.github/workflows/knowledge.yml`. Start narrow —
   `docs/specs/**` and pricing files. Do not add the migrations directory on day one: most
   migrations have no client decision behind them, and catching them turns the
   `no-decision` label into a reflex.
2. **The full SHA** of repoBrain in the same file. Never a tag — git tags are mutable,
   and this is remote code executed in CI.
3. **Branch protection**: "require branches to be up to date before merging". Without it
   two PRs can add the same DEC number and auto-merge, breaking `main`.

## Step 3 — first generation

```bash
npx --yes github:monterail/repobrain index
```

Commit `docs/DECISIONS.md` and `CLAUDE.md` together.

## Step 4 — report back to the user

What was created, what was skipped, and which of the three items from step 2 are still pending.
```

- [ ] **Step 5: Create the transcript-extraction command**

````markdown
---
description: Extract decisions, uncertainties and tasks from a transcript; route them to the right places
argument-hint: <path to transcript>
allowed-tools: Read, Write, Edit, Bash
---

Process the transcript: **$ARGUMENTS**

## Step 1 — read and summarise

Write the summary to `Transcripts/YYYY-MM-DD-slug.md` (take the date from the file name
or the content). Create the directory if it does not exist. Template:

```markdown
# Summary — [date] — [topic]

**Type:** client / internal / discovery / vendor
**Participants:** …
**Language:** PL / EN

## Context
[1-2 sentences: why this meeting happened]

## Decisions
| # | Decision | Who | Notes |
|---|----------|-----|-------|

## Tasks
| Task | Who | Due | Priority |
|------|-----|-----|----------|

## Open questions
- …

## Quotes
> "[exact quote]" — [who]
```

Do not invent anything. Mark whatever is unclear with `[verify]` and report it to the user —
the `integrity` gate rejects a `[verify]` left in `DECISIONS.md`.

## Step 2 — classify by lifespan

The routing criterion is an item's **lifecycle**, not its type. A decision holds
until someone reverses it; a task dies once it is done.

| Type | Destination |
|---|---|
| Decision | a DEC entry draft → `docs/DECISIONS.md` |
| Uncertainty, assumption | `HYPOTHESES.md` |
| Task | a list to paste into Jira — **not into the repo** |
| Quote | stays in the summary as evidence |

Tasks do not go into the repo: as TODO lists in `docs/` nobody ever closes them.

## Step 3 — prepare DEC entry drafts

Follow the format from the `decisions-format` skill. In every draft set `Source:` to the
summary file from step 1. When the client made the decision, `Source:` is required.
Set `Scope:` if the conversation makes clear whether the thing is in scope.

If a decision modifies an earlier one, pick `Reverses:` or `Changes:` by asking:
*is anyone still operating under the old entry?*

## Step 4 — show and wait

**Do not save anything beyond the step 1 summary without the user's consent.**
Show the drafts, ask which to apply. Once approved, append them to the end of
`docs/DECISIONS.md`, run `npx --yes github:monterail/repobrain index`
and show what changed.
````

- [ ] **Step 6: Validate the JSON and run the full suite**

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); console.log('plugin.json OK')"
npm test
```
Expected: `plugin.json OK` + every test passes

- [ ] **Step 7: Commit**

```bash
git add .claude-plugin
git commit -m "feat: Claude Code plugin - format and audit skills, init and transcript-extract commands"
```

---

## Order and dependencies

```
Task 1 (parser) ──► Task 2 (hard heading error)
       │
       ├──► Task 3 (derivation) ──► Task 4 (relation validation)
       │                                    │
       ├──► Task 5 (render) ────────────────┤
       │                                    ▼
       ├──► Task 6 (integrity) ──► Task 7 (gates) ──► Task 9 (CLI) ──► Task 10 (e2e)
       │                                                        ▲
       └──► Task 8 (templates, init) ─────────────────────────────┘
                                                                 
Task 11 (plugin) — po Task 9
```

Tasks 5, 6 and 8 are independent of each other and can be built in parallel.

## Definition of done

- [ ] `npm test` green — every unit test and e2e
- [ ] `grep -rnE "process\.(env|argv|cwd)|node:fs|node:child_process" lib/*.mjs` (excluding tests) returns nothing
- [ ] `npx --yes github:<org>/repobrain#<SHA> check` works in a fresh clone
- [ ] `package.json` still has no `dependencies` and no `devDependencies`
- [ ] Anonimizacja `docs/design/` przed upublicznieniem repo (patrz README)

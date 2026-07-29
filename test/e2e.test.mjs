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
  const envToPass = { ...process.env, ...env };
  // Jeśli GITHUB_EVENT_PATH nie został jawnie podany w env, usuń go
  // (żeby nie dziedziczyć zmiennej z CI, np. GitHub Actions)
  if (!('GITHUB_EVENT_PATH' in env)) {
    delete envToPass.GITHUB_EVENT_PATH;
  }
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd, encoding: 'utf8', env: envToPass,
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
  assert.match(allowed.stdout, /bramki zielone: integrity, index-fresh, decision-required/,
    'gdy jest kontekst PR i --paths, decision-required naprawde biegnie i jest wymienione');

  // Kontekst PR jest, ale brak --paths — bramka nie moze nic sensownie sprawdzic,
  // wiec komunikat sukcesu musi to przyznac zamiast udawac pelna ochrone.
  const noPaths = run(repo, ['check'], { GITHUB_EVENT_PATH: eventPath });
  assert.equal(noPaths.code, 0);
  assert.match(noPaths.stdout, /bramki zielone: integrity, index-fresh/);
  assert.match(noPaths.stdout, /pominięte.*decision-required.*brak --paths/);
});

test('nieznana flaga jest odrzucana, nie po cichu ignorowana', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'repobrain-flags-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  assert.equal(run(repo, ['init']).code, 0);
  assert.equal(run(repo, ['index']).code, 0);

  const typo = run(repo, ['check', '--pahts', 'docs/specs/**']);
  assert.equal(typo.code, 1, 'literowka we fladze nie moze dac zielonego wyniku');
  assert.match(typo.stderr, /Nieznana flaga/);
  assert.match(typo.stderr, /--pahts/);

  const unknownOnInit = run(repo, ['init', '--client-names', 'Kowalski']);
  assert.equal(unknownOnInit.code, 1, 'init nie przyjmuje --client-names');
  assert.match(unknownOnInit.stderr, /Nieznana flaga/);
});

test('komunikat sukcesu wylicza, ktore bramki faktycznie bieganly', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'repobrain-gate-summary-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  assert.equal(run(repo, ['init']).code, 0);
  assert.equal(run(repo, ['index']).code, 0);

  // Bez --paths i bez kontekstu PR — decision-required nie bieglo naprawde.
  const noContext = run(repo, ['check']);
  assert.equal(noContext.code, 0);
  assert.match(noContext.stdout, /bramki zielone: integrity, index-fresh/);
  assert.match(noContext.stdout, /pominięte/);
  assert.match(noContext.stdout, /brak kontekstu PR/);

  // Bez --client-names — informacja o wylaczonej regule, nie blad.
  assert.match(noContext.stdout, /decyzja klienta wymaga pola Źródło.*wyłączona/);
});

test('niepodmieniony placeholder w --client-names dziala jak brak flagi, nie jak cicho wylaczona regula', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'repobrain-placeholder-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  assert.equal(run(repo, ['init']).code, 0);

  // Decyzja klienta bez pola Źródło — dokladnie przypadek, ktory regula
  // ma wylapac, gdy --client-names jest realnie skonfigurowane.
  const decisions = join(repo, 'docs/DECISIONS.md');
  appendFileSync(decisions, ENTRY(2, '2026-02-01', '').replace('**Podjął:** Zespół', '**Podjął:** Kowalski (klient)'));
  assert.equal(run(repo, ['index']).code, 0);

  // 1. Bez flagi — ostrzezenie, zielone.
  const noFlag = run(repo, ['check']);
  assert.equal(noFlag.code, 0);
  assert.match(noFlag.stdout, /reguła.*wyłączona.*brak --client-names/);

  // 2. Prawdziwe nazwisko — blokuje.
  const realName = run(repo, ['check', '--client-names', 'Kowalski']);
  assert.equal(realName.code, 1, 'prawdziwe nazwisko klienta musi nadal blokowac');
  assert.match(realName.stderr, /Źródło/);

  // 3. Niepodmieniony placeholder z templates/knowledge.yml — musi zachowywac
  // sie jak (1), NIE jak cicho zielony sukces bez ostrzezenia.
  const placeholder = run(repo, [
    'check', '--client-names', '<nazwiska klienta po przecinku, np. Kowalski, Nowak>',
  ]);
  assert.equal(placeholder.code, 0, 'placeholder nie moze blokowac — traktowany jak brak flagi');
  assert.match(
    placeholder.stdout,
    /reguła.*wyłączona.*niepodmieniony placeholder/,
    'placeholder musi jawnie ostrzegac, nie byc cicho martwy',
  );
});

test('run() nie przekazuje GITHUB_EVENT_PATH z otoczenia, chyba ze podano jawnie', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'repobrain-e2e-env-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  assert.equal(run(repo, ['init']).code, 0);
  assert.equal(run(repo, ['index']).code, 0);

  const fakeEvent = join(repo, 'leaked-event.json');
  writeFileSync(fakeEvent, JSON.stringify({
    pull_request: { base: { sha: 'x' }, head: { sha: 'y' }, labels: [] },
  }));

  // Symulacja: zmienna JEST ustawiona w srodowisku wywolujacego proces testowy —
  // dokladnie tak, jak GitHub Actions ustawia ja w kazdym kroku kazdego joba.
  const originalEnv = process.env.GITHUB_EVENT_PATH;
  process.env.GITHUB_EVENT_PATH = fakeEvent;
  try {
    const result = run(repo, ['check']);
    assert.equal(result.code, 0, 'check nie moze przejac cudzego zdarzenia PR z otoczenia procesu testowego');
  } finally {
    if (originalEnv === undefined) delete process.env.GITHUB_EVENT_PATH;
    else process.env.GITHUB_EVENT_PATH = originalEnv;
  }
});

#!/usr/bin/env node
// bin/knowledge.mjs — jedyne miejsce, które zna system plików, argv i zmienne CI.
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { parseDecisions } from '../lib/parse.mjs';
import { deriveStatus } from '../lib/status.mjs';
import { renderBlock, spliceBlock, OPEN_MARKER } from '../lib/render.mjs';
import { gateIntegrity, gateIndexFresh, gateDecisionRequired } from '../lib/gates.mjs';
import { planInit } from '../lib/init.mjs';

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.cwd();
const DECISIONS = join(REPO, 'docs/DECISIONS.md');
const CLAUDE_MD = join(REPO, 'CLAUDE.md');

function flag(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;

  // Check if next argument is missing or is another flag
  if (i + 1 >= process.argv.length) {
    fail([`Flaga --${name} wymaga wartości.`]);
  }
  const value = process.argv[i + 1];
  if (value.startsWith('--')) {
    fail([`Flaga --${name} wymaga wartości (podana kolejna flaga: ${value}).`]);
  }

  // Check for duplicate flags
  if (process.argv.indexOf(`--${name}`, i + 1) !== -1) {
    fail([`Flaga --${name} podana wielokrotnie. Użyj tylko raz.`]);
  }

  return value;
}

// Odrzuca flagi, ktorych dana komenda nie zna (np. literowka --pahts zamiast
// --paths) — bez tego nierozpoznana flaga jest po cichu ignorowana i bramka,
// ktora mialaby jej uzyc, nigdy realnie nie biegnie, mimo "wszystko zielone".
function validateFlags(allowed) {
  const known = new Set(allowed);
  const unknown = [];
  for (let i = 3; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--') && !known.has(arg.slice(2))) unknown.push(arg);
  }
  if (unknown.length) {
    const allowedList = allowed.length ? allowed.map((a) => `--${a}`).join(', ') : '(brak flag dla tej komendy)';
    fail([
      `Nieznana flaga: ${unknown.join(', ')}.\nDostępne dla \`${process.argv[2]}\`: ${allowedList}.`,
    ]);
  }
}

function readEvent() {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p) return null;  // Env var not set — no CI context, OK to skip

  if (!existsSync(p)) {
    fail([`GITHUB_EVENT_PATH wskazuje na nieistniejący plik: ${p}`]);
  }

  let event;
  try {
    event = JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    fail([`Nie udało się sparsować GITHUB_EVENT_PATH (${p}): ${err.message}`]);
  }

  return event;
}

function changedFiles(event) {
  const base = event?.pull_request?.base?.sha;
  const head = event?.pull_request?.head?.sha ?? 'HEAD';
  if (!base) return null;  // No PR context, OK to skip

  try {
    const out = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out.split('\n').filter(Boolean);
  } catch (err) {
    let stderr = err.stderr ? err.stderr.toString().trim() : '';

    // Limit stderr to first 2 non-empty lines to avoid overwhelming output
    if (stderr) {
      const lines = stderr.split('\n').filter(line => line.trim());
      if (lines.length > 2) {
        stderr = lines.slice(0, 2).join('\n') + '\n    (wyjście git skrócone)';
      } else {
        stderr = lines.join('\n');
      }
    }

    const gitMsg = stderr ? `git: ${stderr}` : err.message;
    fail([
      `Nie udało się ustalić listy zmienionych plików dla zakresu ${base}...${head}.\n${gitMsg}\n\nTypowe przyczyny:\n  - brak \`fetch-depth: 0\` w kroku actions/checkout\n  - commit bazowy nie istnieje w repozytorium (np. po force push)`,
    ]);
  }
}

function fail(errors) {
  console.error(`\n✗ repoBrain — ${errors.length} ${errors.length === 1 ? 'błąd' : 'błędów'}:\n`);
  for (const e of errors) {
    for (const line of e.split('\n')) {
      console.error(`  ${line}`);
    }
  }
  console.error('');
  process.exit(1);
}

function cmdInit() {
  validateFlags([]);
  const candidates = ['docs/DECISIONS.md', '.github/workflows/knowledge.yml', 'CLAUDE.md'];
  const existing = candidates.filter((p) => existsSync(join(REPO, p)));
  const plan = planInit({ existing });

  const created = [];
  try {
    for (const { path, template } of plan.create) {
      const target = join(REPO, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(join(KIT_ROOT, 'templates', template), 'utf8'));
      console.log(`  + ${path}`);
      created.push(path);
    }
  } catch (err) {
    const lines = [
      'Błąd podczas tworzenia plików (instalacja niepełna):',
      err.message,
      '',
      'Powstały już:',
    ];
    for (const p of created) lines.push(`  - ${p}`);
    lines.push('');
    lines.push('Posprzątaj ręcznie i spróbuj ponownie.');
    fail([lines.join('\n')]);
  }

  for (const path of plan.skip) console.log(`  = ${path} (istnieje, pominięto)`);

  if (plan.appendToClaudeMd) {
    try {
      const section = readFileSync(join(KIT_ROOT, 'templates/CLAUDE-section.md'), 'utf8');
      if (readFileSync(CLAUDE_MD, 'utf8').includes(OPEN_MARKER)) {
        console.log('  = CLAUDE.md (znaczniki już są, pominięto)');
      } else {
        appendFileSync(CLAUDE_MD, `\n${section}`);
        console.log('  ~ CLAUDE.md (dopisano sekcję Źródła prawdy)');
      }
    } catch (err) {
      fail([
        `Błąd podczas pracy z CLAUDE.md:\n${err.message}\n\nWymagane pliki powstały. Dopisz sekcję ręcznie lub spróbuj ponownie.`,
      ]);
    }
  }

  console.log('\nDo uzupełnienia ręcznie:');
  console.log('  1. ścieżki decyzyjne w .github/workflows/knowledge.yml');
  console.log('  2. pełny SHA repoBrain w tym samym pliku (nigdy tag)');
  console.log('  3. branch protection: require branches to be up to date');
  console.log('  4. nazwiska klienta w --client-names w tym samym pliku —');
  console.log('     bez tego bramka integrity nigdy nie wymaga pola Źródło dla decyzji klienta');
}

function cmdIndex() {
  validateFlags([]);
  if (!existsSync(DECISIONS)) {
    fail([
      `${DECISIONS} nie istnieje. Uruchom \`repobrain init\`, żeby go utworzyć.`,
    ]);
  }

  if (!existsSync(CLAUDE_MD)) {
    fail([
      `${CLAUDE_MD} nie istnieje. Uruchom \`repobrain init\`, żeby go utworzyć.`,
    ]);
  }

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
  validateFlags(['paths', 'client-names']);

  if (!existsSync(DECISIONS)) {
    fail([
      `${DECISIONS} nie istnieje. Uruchom \`repobrain init\`, żeby go utworzyć.`,
    ]);
  }

  if (!existsSync(CLAUDE_MD)) {
    fail([
      `${CLAUDE_MD} nie istnieje. Uruchom \`repobrain init\`, żeby go utworzyć.`,
    ]);
  }

  // Validate flags early, even if they won't be used (improves UX)
  const clientNamesRaw = flag('client-names');
  const pathsArg = flag('paths', '');

  // Placeholder z templates/knowledge.yml (np. '<nazwiska klienta po przecinku,
  // np. Kowalski, Nowak>') niepodmieniony przez operatora nie moze udawac
  // skonfigurowanej listy nazwisk — inaczej reguła jest cicho wylaczona bez
  // ostrzezenia. Heurystyka: '<' i '>' razem w wartosci nigdy nie wystapia
  // w prawdziwym nazwisku.
  const isUnfilledPlaceholder = (v) => v != null && v.includes('<') && v.includes('>');
  const clientNames = isUnfilledPlaceholder(clientNamesRaw) ? null : clientNamesRaw;

  if (!clientNames) {
    const reason = isUnfilledPlaceholder(clientNamesRaw)
      ? ' — --client-names zawiera niepodmieniony placeholder z konfiguracji (templates/knowledge.yml), traktowany jak brak flagi.'
      : ' — brak --client-names.';
    console.log(`ℹ reguła „decyzja klienta wymaga pola Źródło" jest wyłączona${reason}`);
  }

  const decisionsText = readFileSync(DECISIONS, 'utf8');
  const claudeMdText = readFileSync(CLAUDE_MD, 'utf8');

  const errors = [
    ...gateIntegrity({
      decisionsText,
      clientNames,
      fileExists: (p) => existsSync(join(REPO, p)),
    }),
    ...gateIndexFresh({ decisionsText, claudeMdText }),
  ];
  const ranGates = ['integrity', 'index-fresh'];
  const skippedGates = [];

  const event = readEvent();
  const files = event ? changedFiles(event) : null;
  const paths = (pathsArg || '').split(',').map((s) => s.trim()).filter(Boolean);

  if (!files) {
    skippedGates.push('decision-required (brak kontekstu PR)');
  } else if (paths.length === 0) {
    skippedGates.push('decision-required (brak --paths — żadna ścieżka nie jest chroniona)');
  } else {
    errors.push(...gateDecisionRequired({
      changedFiles: files,
      paths,
      labels: (event.pull_request?.labels ?? []).map((l) => l.name),
    }));
    ranGates.push('decision-required');
  }

  if (errors.length) fail(errors);

  const skippedNote = skippedGates.length ? ` (pominięte: ${skippedGates.join('; ')})` : '';
  console.log(`✓ repoBrain — bramki zielone: ${ranGates.join(', ')}${skippedNote}`);
}

const COMMANDS = { init: cmdInit, index: cmdIndex, check: cmdCheck };
const command = process.argv[2];

if (!COMMANDS[command]) {
  console.error('Użycie: repobrain <init|index|check> [--paths <globy>] [--client-names <lista>]');
  process.exit(2);
}
COMMANDS[command]();

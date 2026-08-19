#!/usr/bin/env node
// bin/knowledge.mjs — the only place that knows the filesystem, argv and CI env vars.
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
    fail([`Flag --${name} requires a value.`]);
  }
  const value = process.argv[i + 1];
  if (value.startsWith('--')) {
    fail([`Flag --${name} requires a value (got another flag: ${value}).`]);
  }

  // Check for duplicate flags
  if (process.argv.indexOf(`--${name}`, i + 1) !== -1) {
    fail([`Flag --${name} given more than once. Use it only once.`]);
  }

  return value;
}

// Rejects flags a command does not know (e.g. the typo --pahts instead of
// --paths) — without this an unrecognised flag is silently ignored and the gate
// that was meant to use it never really runs, despite "everything green".
function validateFlags(allowed) {
  const known = new Set(allowed);
  const unknown = [];
  for (let i = 3; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg.startsWith('--') && !known.has(arg.slice(2))) unknown.push(arg);
  }
  if (unknown.length) {
    const allowedList = allowed.length ? allowed.map((a) => `--${a}`).join(', ') : '(this command takes no flags)';
    fail([
      `Unknown flag: ${unknown.join(', ')}.\nAvailable for \`${process.argv[2]}\`: ${allowedList}.`,
    ]);
  }
}

function readEvent() {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p) return null;  // Env var not set — no CI context, OK to skip

  if (!existsSync(p)) {
    fail([`GITHUB_EVENT_PATH points at a missing file: ${p}`]);
  }

  let event;
  try {
    event = JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    fail([`Failed to parse GITHUB_EVENT_PATH (${p}): ${err.message}`]);
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
        stderr = lines.slice(0, 2).join('\n') + '\n    (git output truncated)';
      } else {
        stderr = lines.join('\n');
      }
    }

    const gitMsg = stderr ? `git: ${stderr}` : err.message;
    fail([
      `Failed to determine the list of changed files for range ${base}...${head}.\n${gitMsg}\n\nUsual causes:\n  - missing \`fetch-depth: 0\` in the actions/checkout step\n  - the base commit is absent from the repository (e.g. after a force push)`,
    ]);
  }
}

function fail(errors) {
  console.error(`\n✗ repoBrain — ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}:\n`);
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
      'Error while creating files (installation incomplete):',
      err.message,
      '',
      'Already created:',
    ];
    for (const p of created) lines.push(`  - ${p}`);
    lines.push('');
    lines.push('Clean up manually and try again.');
    fail([lines.join('\n')]);
  }

  for (const path of plan.skip) console.log(`  = ${path} (exists, skipped)`);

  if (plan.appendToClaudeMd) {
    try {
      const section = readFileSync(join(KIT_ROOT, 'templates/CLAUDE-section.md'), 'utf8');
      if (readFileSync(CLAUDE_MD, 'utf8').includes(OPEN_MARKER)) {
        console.log('  = CLAUDE.md (markers already present, skipped)');
      } else {
        appendFileSync(CLAUDE_MD, `\n${section}`);
        console.log('  ~ CLAUDE.md (appended the Sources of truth section)');
      }
    } catch (err) {
      fail([
        `Error while working with CLAUDE.md:\n${err.message}\n\nThe required files were created. Append the section manually or try again.`,
      ]);
    }
  }

  console.log('\nStill to fill in by hand:');
  console.log('  1. decision paths in .github/workflows/knowledge.yml');
  console.log('  2. the full repoBrain SHA in the same file (never a tag)');
  console.log('  3. branch protection: require branches to be up to date');
  console.log('  4. client names in --client-names in the same file —');
  console.log('     without them the integrity gate never requires Source on a client decision');
}

function cmdIndex() {
  validateFlags([]);
  if (!existsSync(DECISIONS)) {
    fail([
      `${DECISIONS} does not exist. Run \`repobrain init\` to create it.`,
    ]);
  }

  if (!existsSync(CLAUDE_MD)) {
    fail([
      `${CLAUDE_MD} does not exist. Run \`repobrain init\` to create it.`,
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
    console.log('✓ CLAUDE.md already up to date');
    return;
  }
  writeFileSync(CLAUDE_MD, updated);
  console.log(`✓ CLAUDE.md updated — ${active.length} active, ${history.length} in history`);
}

function cmdCheck() {
  validateFlags(['paths', 'client-names']);

  if (!existsSync(DECISIONS)) {
    fail([
      `${DECISIONS} does not exist. Run \`repobrain init\` to create it.`,
    ]);
  }

  if (!existsSync(CLAUDE_MD)) {
    fail([
      `${CLAUDE_MD} does not exist. Run \`repobrain init\` to create it.`,
    ]);
  }

  // Validate flags early, even if they won't be used (improves UX)
  const clientNamesRaw = flag('client-names');
  const pathsArg = flag('paths', '');

  // A placeholder from templates/knowledge.yml (e.g. '<comma-separated client
  // names, e.g. Smith, Jones>') left unreplaced by the operator must not pose as
  // a configured list of names — otherwise the rule is silently disabled with no
  // warning. Heuristic: '<' and '>' together never occur in a real surname.
  const isUnfilledPlaceholder = (v) => v != null && v.includes('<') && v.includes('>');
  const clientNames = isUnfilledPlaceholder(clientNamesRaw) ? null : clientNamesRaw;

  if (!clientNames) {
    const reason = isUnfilledPlaceholder(clientNamesRaw)
      ? ' — --client-names still holds the unreplaced placeholder from the config (templates/knowledge.yml), treated as no flag at all.'
      : ' — no --client-names.';
    console.log(`ℹ the "a client decision requires the Source field" rule is disabled${reason}`);
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
    skippedGates.push('decision-required (no PR context)');
  } else if (paths.length === 0) {
    skippedGates.push('decision-required (no --paths — no path is protected)');
  } else {
    errors.push(...gateDecisionRequired({
      changedFiles: files,
      paths,
      labels: (event.pull_request?.labels ?? []).map((l) => l.name),
    }));
    ranGates.push('decision-required');
  }

  if (errors.length) fail(errors);

  const skippedNote = skippedGates.length ? ` (skipped: ${skippedGates.join('; ')})` : '';
  console.log(`✓ repoBrain — gates green: ${ranGates.join(', ')}${skippedNote}`);
}

const COMMANDS = { init: cmdInit, index: cmdIndex, check: cmdCheck };
const command = process.argv[2];

if (!COMMANDS[command]) {
  console.error('Usage: repobrain <init|index|check> [--paths <globs>] [--client-names <list>]');
  process.exit(2);
}
COMMANDS[command]();

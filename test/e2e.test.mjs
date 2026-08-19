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
  // If GITHUB_EVENT_PATH was not passed explicitly in env, drop it
  // (so we do not inherit the variable from CI, e.g. GitHub Actions)
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
${extra}**Area:** process
**Topic:** Topic ${n}
**Context:** C
**Decision:** D
**Consequences:** CO
**Decided by:** The team
`;

test('full loop: init, index, reversal, change, gates', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'repobrain-e2e-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  // 1. init in an empty repo
  assert.equal(run(repo, ['init']).code, 0);
  const claude = join(repo, 'CLAUDE.md');
  const decisions = join(repo, 'docs/DECISIONS.md');
  assert.match(readFileSync(claude, 'utf8'), /GENERATED:decisions/);
  assert.match(readFileSync(decisions, 'utf8'), /DEC-001/);

  // 2. index — DEC-001 from the template lands in the block
  assert.equal(run(repo, ['index']).code, 0);
  assert.match(readFileSync(claude, 'utf8'), /DEC-001/);

  // 3. DEC-002 reverses DEC-001
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

  // 5. check after regeneration — green
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
  assert.match(allowed.stdout, /gates green: integrity, index-fresh, decision-required/,
    'with PR context and --paths, decision-required really runs and is listed');

  // There is PR context but no --paths — the gate cannot check anything meaningful,
  // so the success message must admit it instead of faking full protection.
  const noPaths = run(repo, ['check'], { GITHUB_EVENT_PATH: eventPath });
  assert.equal(noPaths.code, 0);
  assert.match(noPaths.stdout, /gates green: integrity, index-fresh/);
  assert.match(noPaths.stdout, /skipped.*decision-required.*no --paths/);
});

test('an unknown flag is rejected, not silently ignored', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'repobrain-flags-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  assert.equal(run(repo, ['init']).code, 0);
  assert.equal(run(repo, ['index']).code, 0);

  const typo = run(repo, ['check', '--pahts', 'docs/specs/**']);
  assert.equal(typo.code, 1, 'a typo in a flag must not produce a green result');
  assert.match(typo.stderr, /Unknown flag/);
  assert.match(typo.stderr, /--pahts/);

  const unknownOnInit = run(repo, ['init', '--client-names', 'Smith']);
  assert.equal(unknownOnInit.code, 1, 'init does not accept --client-names');
  assert.match(unknownOnInit.stderr, /Unknown flag/);
});

test('the success message lists which gates actually ran', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'repobrain-gate-summary-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  assert.equal(run(repo, ['init']).code, 0);
  assert.equal(run(repo, ['index']).code, 0);

  // No --paths and no PR context — decision-required did not really run.
  const noContext = run(repo, ['check']);
  assert.equal(noContext.code, 0);
  assert.match(noContext.stdout, /gates green: integrity, index-fresh/);
  assert.match(noContext.stdout, /skipped/);
  assert.match(noContext.stdout, /no PR context/);

  // No --client-names — a notice about the disabled rule, not an error.
  assert.match(noContext.stdout, /a client decision requires the Source field.*is disabled/);
});

test('an unreplaced placeholder in --client-names acts like a missing flag, not a silently disabled rule', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'repobrain-placeholder-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  assert.equal(run(repo, ['init']).code, 0);

  // A client decision with no Source field — exactly the case the rule is meant
  // to catch when --client-names is genuinely configured.
  const decisions = join(repo, 'docs/DECISIONS.md');
  appendFileSync(decisions, ENTRY(2, '2026-02-01', '').replace('**Decided by:** The team', '**Decided by:** Smith (client)'));
  assert.equal(run(repo, ['index']).code, 0);

  // 1. No flag — a warning, green.
  const noFlag = run(repo, ['check']);
  assert.equal(noFlag.code, 0);
  assert.match(noFlag.stdout, /rule is disabled.*no --client-names/);

  // 2. A real name — blocks.
  const realName = run(repo, ['check', '--client-names', 'Smith']);
  assert.equal(realName.code, 1, 'a real client name must still block');
  assert.match(realName.stderr, /Source/);

  // 3. The unreplaced placeholder from templates/knowledge.yml — must behave
  // like (1), NOT like a quietly green success with no warning.
  const placeholder = run(repo, [
    'check', '--client-names', '<comma-separated client names, e.g. Smith, Jones>',
  ]);
  assert.equal(placeholder.code, 0, 'a placeholder must not block — it is treated as a missing flag');
  assert.match(
    placeholder.stdout,
    /rule is disabled.*unreplaced placeholder/,
    'a placeholder must warn explicitly, not be silently dead',
  );
});

test('run() does not pass GITHUB_EVENT_PATH from the environment unless given explicitly', (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'repobrain-e2e-env-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  assert.equal(run(repo, ['init']).code, 0);
  assert.equal(run(repo, ['index']).code, 0);

  const fakeEvent = join(repo, 'leaked-event.json');
  writeFileSync(fakeEvent, JSON.stringify({
    pull_request: { base: { sha: 'x' }, head: { sha: 'y' }, labels: [] },
  }));

  // Simulation: the variable IS set in the environment of the calling test process —
  // exactly the way GitHub Actions sets it in every step of every job.
  const originalEnv = process.env.GITHUB_EVENT_PATH;
  process.env.GITHUB_EVENT_PATH = fakeEvent;
  try {
    const result = run(repo, ['check']);
    assert.equal(result.code, 0, 'check must not hijack somebody else\'s PR event from the test process environment');
  } finally {
    if (originalEnv === undefined) delete process.env.GITHUB_EVENT_PATH;
    else process.env.GITHUB_EVENT_PATH = originalEnv;
  }
});

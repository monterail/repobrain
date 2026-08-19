# repoBrain

A knowledge layer for client projects, kept in the repo and enforced by CI.

One source of truth (`docs/DECISIONS.md`), from which a digest of the active decisions is
generated straight into `CLAUDE.md`. The two cannot drift apart for longer than a single PR,
because a CI gate regenerates and compares — the same way a lockfile check does.

Distributed along two paths from one repo: a **Claude Code plugin** (skills + commands for the
team) and a **CLI run straight through `node`** (the gates in GitHub Actions, with no dependency
on Claude Code and no package manager — the kit has no dependencies at all).

---

## Table of contents

1. [Where this came from](#1-where-this-came-from)
2. [The model: source versus derivative](#2-the-model-source-versus-derivative)
3. [What is manual, what is automatic — a summary table](#3-what-is-manual-what-is-automatic--a-summary-table)
4. [Installation](#4-installation)
5. [How documentation gets written — three paths](#5-how-documentation-gets-written--three-paths)
6. [Routing team documents](#6-routing-team-documents)
7. [DEC entry format](#7-dec-entry-format)
8. [Status is derived, not written down](#8-status-is-derived-not-written-down)
9. [CI gates](#9-ci-gates)
10. [CLI commands](#10-cli-commands)
11. [Working rhythm and ownership](#11-working-rhythm-and-ownership)
12. [What repoBrain does not do](#12-what-repobrain-does-not-do)
13. [Developing the kit](#13-developing-the-kit)

---

## 1. Where this came from

From an audit of the knowledge layer in a finished client project: five parallel stores,
hand-maintained copies drifted away from the source, and a syncing hook committed somebody
else's work under a misleading message. Every defect had the same root cause —
**a hand-maintained copy always drifts**. repoBrain replaces copies with a derivative.

The whole shape of the tool follows from that:

- a copy is not maintained — a copy is **generated** and compared in CI,
- a decision's status is not written down — status **follows** from the relations between entries,
- no automation writes to the repo without a human — because that was the cause of the defect, not its cure.

---

## 2. The model: source versus derivative

This is the split everything below follows from.

```
┌─ SOURCE (written by a human, reviewed in the PR) ────────────┐
│                                                              │
│  docs/DECISIONS.md      the full text of each decision       │
│  Transcripts/*.md       meeting summaries (evidence)         │
│  HYPOTHESES.md          uncertainties to be settled          │
│  docs/specs/            the implementation contract          │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │   knowledge.mjs index
                           ▼
┌─ DERIVATIVE (machine-generated, NOBODY edits by hand) ───────┐
│                                                              │
│  CLAUDE.md → the <!-- GENERATED:decisions --> block          │
│              table of active decisions + list of reversed    │
│                                                              │
└──────────────────────────┬───────────────────────────────────┘
                           │   knowledge.mjs check  (index-fresh gate)
                           ▼
                  drift = red PR, it cannot be merged
```

The precedence rule the installer appends to `CLAUDE.md`:

1. `docs/DECISIONS.md` — the full text; `Reverses:`/`Changes:` settle what is current
2. the `GENERATED:decisions` block — a digest of the active ones, always consistent with (1)
3. `docs/specs/` — the implementation contract
4. `Transcripts/` — supporting evidence, when 1–3 are silent

**Anything outside this list is a working note, not a source of truth.**

---

## 3. What is manual, what is automatic — a summary table

| Action | Who | When |
|---|---|---|
| Writing a DEC entry | **human** (the agent proposes a draft) | on every scope, cost or architecture decision |
| Summarising a transcript | agent (`/transcript-extract`) | after a client call |
| Choosing which DEC drafts to apply | **human** | step 4 of `/transcript-extract` |
| Choosing `Reverses:` vs `Changes:` | **human** | when a decision touches an earlier one |
| Deriving status (active / reversed) | machine (`lib/status.mjs`) | on every `index` and `check` |
| Generating the table in `CLAUDE.md` | machine (`knowledge.mjs index`) | after every edit of `DECISIONS.md` |
| Running `index` | **human** (locally, before committing) | after editing `DECISIONS.md` |
| Checking that `CLAUDE.md` is fresh | machine (the `index-fresh` gate) | every PR and push to `main` |
| Checking entry completeness | machine (the `integrity` gate) | every PR and push to `main` |
| The reminder "this change needs a decision" | machine (the `decision-required` gate) | a PR touching decision paths |
| Reacting to a red gate | **human** | adds an entry or the `no-decision` label |
| Auditing systemic drift | agent (`/knowledge-audit`) | once a sprint, run by hand |
| Widening the decision paths | **human** (the owner) | when the audit shows the back door is being normalised |

**The overriding rule:** no tool in this kit writes to `docs/DECISIONS.md` without a human
explicitly approving it. The only file an agent writes on its own is the transcript summary
in `Transcripts/` — an archive, not a source of decisions.

---

## 4. Installation

Six steps, ~15 minutes. Steps 1–5 are mandatory, step 6 (the Claude Code plugin) is optional.

### Prerequisites

| What you need | What for | How to check |
|---|---|---|
| Node.js ≥ 20 | the CLI uses `node:test` and native ESM | `node --version` |
| a GitHub repo with Actions enabled | the gates run as a workflow | Settings → Actions |
| **admin** rights on the repo | branch protection (step 4) | Settings → Branches is visible |
| `gh` CLI (optional) | a faster way to set branch protection | `gh auth status` |

The kit has **no** dependencies — neither runtime nor development ones. You run it straight
through `node`, with no `npm install` and no `npx`.

> **Why not `npx github:…`.** Earlier versions of these instructions used
> `npx --yes github:monterail/repobrain#<SHA>`. That route **blows up in GitHub Actions**
> with `GitFetcher requires an Arborist constructor` — a defect in npm 10.x, which is
> exactly the version `actions/setup-node` installs alongside node 20 and 22.
> Since the kit has no dependencies, npm was purely a middleman in that chain:
> removing it fixes the error and shortens the job. Details in [§13](#13-developing-the-kit).

### Step 1 — determine the full SHA

The workflow **pins the commit by full SHA, never by tag**. Git tags are mutable: anyone with
push rights to the kit repo could move `v1.0.0` and execute arbitrary code — with the `--yes`
flag — in the CI of every project in the agency.

```bash
git ls-remote https://github.com/monterail/repobrain.git main
# 85d7898f…  refs/heads/main   ← this is the SHA you paste in steps 2 and 3
```

Write it down — it shows up in three places. Below it is referred to as `<SHA>`.

### Step 2 — run the installer

Fetch the kit at the SHA you determined and run the installer in your project directory:

```bash
git clone https://github.com/monterail/repobrain.git ~/.repobrain
git -C ~/.repobrain checkout <SHA>

cd /path/to/project
node ~/.repobrain/bin/knowledge.mjs init
```

The CLI always operates on the **current working directory**, no matter where you ran the
file from — which is why the kit can live anywhere.

With the Claude Code plugin the equivalent is: `/knowledge-init`.

The installer **never overwrites existing files** — it reports what it added (`+`) and what it
skipped (`=`). Thanks to that rule the same code handles an empty repo and a two-year-old one,
with no separate "retrofit" mode.

```
  + docs/DECISIONS.md
  + .github/workflows/knowledge.yml
  ~ CLAUDE.md (appended the Sources of truth section)
```

| File | Content | If it already exists |
|---|---|---|
| `docs/DECISIONS.md` | the format description + `DEC-001` as a working example | skipped entirely |
| `.github/workflows/knowledge.yml` | the workflow that fetches the kit via `actions/checkout` pinned by SHA | skipped entirely |
| `CLAUDE.md` | the precedence rule + an empty marker pair | **appended at the end**, not overwritten |

If `CLAUDE.md` already contains the `GENERATED:decisions` markers, the installer leaves those
alone too — it prints `= CLAUDE.md (markers already present, skipped)`.

`Transcripts/` and `HYPOTHESES.md` are **not scaffolded** — they come into existence the first
time `/transcript-extract` is used. An empty directory is an orphan, and orphans are the very
problem this kit exists to remove.

> **Installation interrupted halfway?** The installer prints which files it managed to create
> and tells you to clean up by hand. There is no automatic rollback: deleting files in somebody
> else's repo is a worse default than a message.

### Step 3 — fill in three things in the workflow

The installer cannot guess them. **Until you do, some of the gates are disabled.**

Open `.github/workflows/knowledge.yml` and replace three values:

```yaml
# BEFORE (straight from the installer)
      - uses: actions/checkout@v4
        with:
          repository: monterail/repobrain
          ref: <FULL_SHA>                     # ①
          path: .repobrain
      …
      - run: node .repobrain/bin/knowledge.mjs check
             --paths 'docs/specs/**,**/pricing*'                          # ②
             --client-names '<comma-separated client names, e.g. Smith, Jones>' # ③

# AFTER (filled in)
      - uses: actions/checkout@v4
        with:
          repository: monterail/repobrain
          ref: 85d7898f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d
          path: .repobrain
      …
      - run: node .repobrain/bin/knowledge.mjs check
             --paths 'docs/specs/**,docs/api-contract.md,**/pricing*'
             --client-names 'Jones, Whitfield'
```

| # | What | Consequence of skipping it |
|---|---|---|
| ① | **`ref:`** → the full SHA from step 1 | the checkout fails on a non-existent reference |
| ② | **`--paths`** → this project's decision paths | the `decision-required` gate protects nothing |
| ③ | **`--client-names`** → the names of the decision-makers on the client side | `integrity` never requires `Source:` for a client decision |

> **Do not change the order of the steps.** The project checkout must come first:
> `actions/checkout` cleans the target directory by default with `git clean -ffdx`, so the
> reverse order would wipe out the kit fetched earlier.

**How to choose `--paths`.** Start **narrow**: `docs/specs/**` and pricing files. Do not add the
migrations directory on day one — most migrations have no client decision behind them, and
catching them turns the `no-decision` label into a reflex. You widen the paths later, when the
audit shows something important is getting through without an entry. Glob syntax: `*` does not
cross `/`, `**` does.

**How to choose `--client-names`.** Matching is **by substring, case-insensitive**, and
deliberately loose — `Jones` also hits `Jonesborough`. The direction of the error is safe:
a false alarm ("we demand `Source:` where it is not needed") is cheaper than an overlooked
client decision with no evidence.

**The safety catch.** If you leave the placeholder unreplaced (`<comma-separated client names…>`),
the CLI treats it as a missing flag and **says so out loud**:

```
ℹ the "a client decision requires the Source field" rule is disabled — --client-names still
  holds the unreplaced placeholder from the config, treated as no flag at all.
```

A rule dying quietly under a green CI is worse than no rule. For the same reason the CLI
rejects unknown flags — the typo `--pahts` stops the build instead of being ignored.

### Step 4 — enable branch protection

**This is an installation precondition, not a recommendation.** Without "require branches to be
up to date", two PRs can add an entry with the same DEC number and auto-merge (they insert text
in different places in the file, so git sees no conflict). The second merge turns `main` red,
and fixing it by renumbering invalidates references that already went out in Slack and in
`Reverses:` fields.

Through the UI: **Settings → Branches → Add branch protection rule** for `main`:

- ✅ Require status checks to pass before merging
- ✅ **Require branches to be up to date before merging** ← this is the critical one
- in the list of checks pick `knowledge`

Through the `gh` CLI:

```bash
gh api -X PUT repos/OWNER/REPO/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["knowledge"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

`"strict": true` is exactly "require branches to be up to date".

### Step 5 — first generation and commit

```bash
node ~/.repobrain/bin/knowledge.mjs index
```

```
✓ CLAUDE.md updated — 1 active, 0 in history
```

Commit **both files together** — splitting them into two commits gives a red `index-fresh`
gate on the first one:

```bash
git add docs/DECISIONS.md CLAUDE.md .github/workflows/knowledge.yml
git commit -m "chore: install repoBrain"
```

### Verification — is it actually working

Run the gates locally, exactly the way CI will:

```bash
node ~/.repobrain/bin/knowledge.mjs check \
  --paths 'docs/specs/**' --client-names 'Jones'
```

```
✓ repoBrain — gates green: integrity, index-fresh
  (skipped: decision-required (no PR context))
```

Locally `decision-required` is always skipped — it needs `GITHUB_EVENT_PATH` and pull request
context. **That is expected.** To check it for real, open a trial PR touching a decision path
and see whether it goes red.

Post-installation checklist:

- [ ] `knowledge.mjs check` green locally
- [ ] the workflow passed on the first PR (Actions tab)
- [ ] the CI log **does not** carry the message about the disabled `--client-names` rule
- [ ] in the CI log the `decision-required` gate is among the "green" ones, not the "skipped" ones
- [ ] a trial PR in `docs/specs/**` with no DEC entry → red
- [ ] the same PR with the `no-decision` label → green (and the build retriggered)
- [ ] `main` has branch protection with `strict: true`
- [ ] `DECISIONS.md` has an assigned owner (see §11)

### Step 6 — the Claude Code plugin (optional)

The plugin gives the team the `/knowledge-init` and `/transcript-extract` commands and the
`decisions-format`, `knowledge-audit` skills. It is **not required** — the CI gates work
independently of Claude Code, which was the architectural invariant.

The simplest route today: copy the contents of `.claude-plugin/` into the target project's
`.claude/` directory and commit it — the skills and commands then work for the whole team:

```bash
mkdir -p .claude/skills .claude/commands
cp -r ~/.repobrain/.claude-plugin/skills/* .claude/skills/
cp -r ~/.repobrain/.claude-plugin/commands/* .claude/commands/
```

In the copied files replace `<PATH_TO_KIT>` with wherever you keep the kit (e.g. `~/.repobrain`)
— the commands call the same CLI you do by hand.

> The repo does not have a `.claude-plugin/marketplace.json` yet, so installing through
> `/plugin marketplace add` will not work. That is a known gap, not a misconfiguration on your side.

### Updating the kit

A fix in repoBrain does not propagate on its own — that is the deliberate cost of pinning by
SHA. To bump the version in a project: take the new SHA (step 1), replace `ref:` in
`.github/workflows/knowledge.yml`, open a PR. A green build on that PR is the confirmation that
the new version does not break the existing entries.

Locally, refresh your copy of the kit to the same SHA:

```bash
git -C ~/.repobrain fetch && git -C ~/.repobrain checkout <NEW_SHA>
```

**The SHA in CI is the source of truth, the local copy is a convenience.** If they diverge, the
`index-fresh` gate catches it — you generate the block with an older version and CI compares it
against the output of a newer one. Divergence does not pass silently.

### Migrating an installation from before the English switch

The DEC vocabulary used to be Polish. Repos installed before that change carry entries with
`Temat:`/`Kontekst:`/`Decyzja:`/`Konsekwencje:`/`Podjął:` and a `WYGENEROWANE:decyzje` block in
`CLAUDE.md`. The current parser knows only the English names — there is no compatibility layer,
deliberately, because a permanent dual vocabulary is the same "two stores" defect the kit exists
to remove. Bumping `ref:` to a post-switch SHA therefore requires a one-off rewrite:

| Old | New |
|---|---|
| `**Temat:**` | `**Topic:**` |
| `**Kontekst:**` | `**Context:**` |
| `**Decyzja:**` | `**Decision:**` |
| `**Konsekwencje:**` | `**Consequences:**` |
| `**Podjął:**` | `**Decided by:**` |
| `**Odwraca:**` | `**Reverses:**` |
| `**Zmienia:**` | `**Changes:**` |
| `**Obszar:**` | `**Area:**` |
| `**Źródło:**` | `**Source:**` |
| `**Scope:** w cenie` | `**Scope:** in scope` |
| `**Scope:** do wyceny` | `**Scope:** needs estimate` |
| placeholders `[data]`, `[uzupełnij]` | `[date]`, `[fill in]` |

Then delete the whole old `WYGENEROWANE:decyzje` block from `CLAUDE.md` (both markers included),
run `init` to append the new section, and run `index` to fill it in:

```bash
node ~/.repobrain/bin/knowledge.mjs init    # appends the new marker pair
node ~/.repobrain/bin/knowledge.mjs index   # generates the block
node ~/.repobrain/bin/knowledge.mjs check   # must be green before the PR
```

Do the rewrite and the `ref:` bump **in one PR**. Split across two, the first one is red either
way: an old kit does not understand the new entries, and a new kit does not understand the old ones.

---

## 5. How documentation gets written — three paths

### Path A — after a client call: `/transcript-extract`

The main path. One command, four steps, a human approves every write to the source.

```
raw recording (PDF / VTT, named by the vendor)
   │
   ▼  /transcript-extract <path>
   │
[1] summary → Transcripts/YYYY-MM-DD-slug.md          ← THE ONLY automatic write
   │   (context, decisions, tasks, open questions, quotes)
   │
[2] items classified by LIFESPAN, not by content type:
   │
   ├─ decision      → a DEC entry draft         durable, versioned
   ├─ uncertainty   → HYPOTHESES.md             to be settled
   ├─ task          → a list to paste into Jira    NOT into the repo
   └─ quote         → stays in the summary      archive
   │
[3] DEC drafts shown in the reply — NOT written to disk
   │
[4] a human picks what to apply
   │   → appended at the end of docs/DECISIONS.md
   │   → knowledge.mjs index
   │   → commit both files
   ▼
```

**Why tasks do not go into the repo.** In a transcript a decision and a task look alike. What
separates them is lifecycle: a decision holds until someone reverses it; a task dies once it is
done. Tasks in `docs/` turn into TODO lists nobody ever closes.

**Uncertainty has a safety catch.** The command is forbidden from inventing anything — whatever
is unclear gets marked `[verify]`. That is one of the placeholders that block CI, so an
uncertainty pulled out of a transcript physically cannot reach a merge.

### Path B — a decision alongside a code change: the `decision-required` gate

```
a PR touches docs/specs/** or **/pricing*
   │
   ├─ does the PR touch docs/DECISIONS.md too?  → green, passes
   ├─ does the PR carry the `no-decision` label? → green, passes (the back door)
   └─ neither of the two                         → RED, the merge is blocked
                                                    │
                                                    ▼
                                 a human adds a DEC entry or deliberately
                                 labels the PR `no-decision`
```

The gate **does not write the entry** — it merely refuses to let things through without a human
decision. The `no-decision` label is a legitimate back door (not every spec change is a project
decision), but its uses are counted by `/knowledge-audit`.

### Path C — by hand, with the `decisions-format` skill

A decision that came out of neither a transcript nor a PR — an agreement on Slack, say. You write
the entry straight into `docs/DECISIONS.md`. The `decisions-format` skill loads automatically in
Claude Code when you write or edit an entry, and it enforces the format before CI does.

Every path ends the same way:

```bash
node ~/.repobrain/bin/knowledge.mjs index
git add docs/DECISIONS.md CLAUDE.md && git commit
```

To avoid retyping the path after every edit, add an alias in the project —
in `package.json`:

```json
"scripts": { "knowledge:index": "node ~/.repobrain/bin/knowledge.mjs index" }
```

or in a `Makefile`, if the project is not a node one:

```make
knowledge-index:
	node ~/.repobrain/bin/knowledge.mjs index
```

---

## 6. Routing team documents

A team produces more than call transcripts: BA papers, refinement notes, architecture
documentation, research. This section says where each of those should live.

### One question settles everything

> **Does this thing hold until someone reverses it?**

```
                    ┌─ YES ──────────────▶ a DEC entry in docs/DECISIONS.md
                    │
does it hold        ├─ NO, but it is evidence of where a decision came from
until reversed?     │                    ▶ Transcripts/YYYY-MM-DD-slug.md
                    │
                    ├─ NO, it is a contract: what exactly we are building
                    │                    ▶ docs/specs/
                    │
                    ├─ NO, it is an uncertainty to be settled
                    │                    ▶ HYPOTHESES.md
                    │
                    └─ NO, it is simply useful
                                         ▶ ordinary docs/, no ceremony
```

**The criterion is lifecycle, not document type.** A decision and a task look alike in a note;
what separates them is that a decision holds until someone reverses it, while a task dies once
it is done.

### Routing table

| Document | Where | Why |
|---|---|---|
| A BA paper defining **what we are building** | `docs/specs/` + a DEC entry for the contested calls | the implementation contract — level 3 of the precedence rule |
| An **analytical** BA paper (options, comparisons, research) | ordinary `docs/`; the outcome → a DEC entry | it goes stale the moment the decision is made |
| Refinement notes | `Transcripts/YYYY-MM-DD-refinement-slug.md`, `Type: internal` | the same lifecycle as a transcript: evidence, upstream of a decision |
| A discovery workshop | `Transcripts/…`, `Type: discovery` | same as above |
| Agreements with a vendor | `Transcripts/…`, `Type: vendor` | same as above |
| Open questions from a refinement | `HYPOTHESES.md` | they are meant to be settled, not archived |
| "this is in scope / this is a change request" calls | a DEC entry with `Scope:` | exactly what `Scope:` protects you from in a dispute |
| An architectural decision (ADR-shaped) | a DEC entry — **not a separate ADR** | duplicating stores is the defect this kit removes |
| Estimates, schedule | outside the repo (Jira) — the consequences → the `Consequences:` field of a DEC entry | they expire faster than a PR |
| Action items from any meeting | Jira — **not the repo** | TODO lists in `docs/` are lists nobody closes |
| A runbook, onboarding, a module README | ordinary `docs/` | nobody has to police their freshness |

### Three things that work even though the names suggest otherwise

**1. `Transcripts/` is not only for the client.** The summary template has a `Type:` field with
four values — `client / internal / discovery / vendor`. A refinement is `internal`, a BA workshop
is `discovery`. The directory holds summaries of **any meeting**, not only client calls.

**2. `/transcript-extract` accepts any file.** Refinement notes, a Miro export, a Confluence
summary — the command turns them into a summary in the standard format and proposes DEC drafts.
It does not have to be a verbatim recording.

**3. `Source:` may point at anything in the repo.** The `integrity` gate checks only whether the
file exists — it does not force a `Transcripts/` prefix. A BA paper is legitimate evidence:

```markdown
**Source:** docs/specs/ba-billing-model.md
```

### The document is not the unit of knowledge — the decision is

A twenty-page BA paper may carry three decisions and seventeen descriptions. The process
**does not archive the paper as "knowledge"** — it pulls three DEC entries out of it and leaves
the paper as the evidence those entries point at through `Source:`.

That is why there is, and should be, no "gate on project documentation completeness": it would
measure volume, not knowledge. The only thing repoBrain checks in documentation outside
`DECISIONS.md` is whether a change on a decision path has a decision behind it.

### Two known gaps

Written down deliberately, so as not to build a false sense of coverage:

**Specs drifting away from decisions.** DEC-039 changes billing behaviour, `docs/specs/billing.md`
still describes the old one — and **nothing catches it**. The gates police the freshness of the
block in `CLAUDE.md`, not the freshness of the specs. A spec remains a hand-maintained copy of
knowledge, which is exactly the category this kit eliminates in one place and tolerates in
another. The procedural workaround: when writing a DEC entry, fill in `Consequences:` concretely
enough that the PR review can see which spec needs updating.

**The feedback loop only covers `Transcripts/`.** `/knowledge-audit` checks whether a summary
with a "Decisions" section has a DEC entry pointing at it. A BA paper full of decisions that
nobody turned into entries **will not be reported** — the audit does not look outside
`Transcripts/`.

---

## 7. DEC entry format

```markdown
## DEC-NNN — YYYY-MM-DD
**Reverses:** DEC-XXX     (optional — XXX stops applying entirely)
**Changes:** DEC-XXX      (optional — XXX still applies, this entry refines part of it)
**Area:** tag, tag        (optional)
**Scope:** in scope       (optional — in scope | change request | needs estimate)
**Source:** Transcripts/YYYY-MM-DD-slug.md   (optional; required for client decisions)
**Topic:** one sentence
**Context:** why the topic came up at all
**Decision:** what was agreed
**Consequences:** what this changes in code, cost, schedule
**Decided by:** who and where
```

### Hard rules (enforced by CI)

- Required fields: `Topic`, `Context`, `Decision`, `Consequences`, `Decided by`.
- The date is strictly `YYYY-MM-DD` with leading zeros. Separator `-`, `–` or `—`.
- `Scope:` accepts only: `in scope`, `change request`, `needs estimate`.
- Every `## ` heading in the file must be a complete DEC entry — **nothing is skipped silently**.
  (That is why the descriptive section headings in the template are `### ` level.)
- `Reverses:` and `Changes:` are **mutually exclusive** — an entry carries at most one relation.
- The relation must point at an **earlier** entry by the (date, ID number) pair.
- **Never add a `Status:` field** — see §8.

### Soft rules (convention, not code)

- Append new entries **at the end of the file** — parallel PRs then produce a text conflict
  instead of a silent auto-merge carrying the same DEC number.
- A substantive change means a new entry. A corrective edit (typo, date, adding `Source:`) is
  allowed in place.

### Placeholders that block CI

```
[date]   [fill in]   [TBD]   [verify]   TODO
```

These strings block the **whole file**. Do not use them as working markers.
If something is still unknown — better not to commit the entry at all than to commit an
incomplete one.

Note: from the first DEC entry down, placeholders are detected **inside code blocks too**.
A code block must not be a back door to an incomplete entry. In the preamble (the section
describing the format, before the first entry) code blocks are ignored — there they are
documentation.

---

## 8. Status is derived, not written down

There is no `Status:` field. If there were, somebody would have to update it when adding a new
entry — and that is precisely what nobody ever does. Instead **a new entry declares a relation
to an old one**, and status follows from the graph.

| Situation | Field | Effect in the index |
|---|---|---|
| The previous decision stops applying entirely | `Reverses:` | the old entry lands in the "Reversed (history)" section |
| The previous one still applies, you refine part of it | `Changes:` | the old entry stays active, annotated *(changed by DEC-XXX)* |
| A topic unrelated to anything earlier | neither | an ordinary active entry |

**When in doubt, ask:** *after this change, is anyone still operating under the old entry?*
If yes — `Changes:`.

Additional graph rules `lib/status.mjs` enforces:

- a reversed entry can no longer "change" its target — its refinement dies together with it,
- you cannot `Changes:` an entry that has already been reversed (an error, blocks CI),
- an entry with a validation error (duplicate ID, both relations, a target from the future)
  **contributes no edge to the graph** — it stays visible, but its relations are ignored, so
  that one broken entry does not falsify the whole index.

### What you see in `CLAUDE.md`

```markdown
<!-- GENERATED:decisions — do not edit. Run: node <kit>/bin/knowledge.mjs index -->
| DEC | Date | Area | Topic |
|-----|------|------|-------|
| DEC-012 | 2026-06-02 | api | Webhooks idempotent by event key |
| DEC-007 | 2026-05-14 | billing | Correcting invoices out of MVP scope *(changed by DEC-011)* |

**Reversed (history):**

- DEC-004 (2026-04-21) — reversed by DEC-009
<!-- /GENERATED:decisions -->
```

Newest first. The generator **never appends the block at the end of the file** — if the markers
are missing, it refuses and tells you to run `init`. A block somebody moved or duplicated ends
in a "fix it manually" error, not a silent overwrite.

> The marker text is **matched literally**, so changing it breaks marker pairing in every
> existing installation. It was changed exactly once, together with the switch of the whole
> knowledge layer to English (`WYGENEROWANE:decyzje` → `GENERATED:decisions`); the migration
> path is in §4. Treat it as a constant from here on.

---

## 9. CI gates

The `.github/workflows/knowledge.yml` workflow fires on `pull_request`
(types `opened, synchronize, reopened, labeled, unlabeled`) and on `push` to `main`.

> The `labeled`/`unlabeled` types are **mandatory** — without them, adding the `no-decision`
> label does not retrigger the build and the PR stays red despite the correct reaction.

| Gate | What it checks | When it blocks | How to fix it |
|---|---|---|---|
| `integrity` | entry completeness, relation validity, placeholders, existence of the files named in `Source:`, `Source:` for client decisions | always | fix the entry in `DECISIONS.md` |
| `index-fresh` | whether the block in `CLAUDE.md` = a regeneration from `DECISIONS.md` | always | run `knowledge.mjs index` and commit |
| `decision-required` | whether a PR touching decision paths also touches `DECISIONS.md` | only with PR context and only when `--paths` was given | add a DEC entry or the `no-decision` label |

Skipped gates are **printed in the log**, e.g.:

```
✓ repoBrain — gates green: integrity, index-fresh (skipped: decision-required (no --paths — no path is protected))
```

That is deliberate: "everything green" must not be allowed to mean "the gate never ran". For the
same reason the CLI rejects unknown flags (the typo `--pahts` instead of `--paths` would be
silently ignored) and treats an unreplaced placeholder in `--client-names` as a missing flag,
saying so outright.

### Complementing the gates: `/knowledge-audit`

The gates catch single events. The audit catches **systemic drift** — the things that would
produce false alarms if you blocked on them:

1. **Lost decisions** — a transcript with a "Decisions" section that no DEC points at through
   `Source:`. A warning, not an error: not every decision from a call deserves an entry.
2. **Back door usage** — the number of PRs labelled `no-decision` in the last 30 days. A rising
   number means the decision paths are too broad or the gate is being worked around. This is the
   only defence against the back door being quietly normalised.
3. **Unreferenced documents** — files in `docs/` that nothing in the repo links to.
4. **Dead internal links** — deliberately outside CI, because relative paths would produce false alarms.

The `Source:` field closes the loop in both directions: **forwards**, `integrity` blocks an entry
pointing at a non-existent transcript; **backwards**, the audit warns that something from a
conversation fell through.

---

## 10. CLI commands

```bash
node <path-to-kit>/bin/knowledge.mjs <init|index|check> [flags]
```

Zero dependencies, so no `npm install` and no `npx` — all you need is `node ≥ 20` and a
directory holding the kit cloned at the agreed SHA. The CLI always operates on the **current
working directory**, not on the kit directory.

| Command | Flags | What it does |
|---|---|---|
| `init` | — | creates `docs/DECISIONS.md`, the workflow, appends the section to `CLAUDE.md`. Never overwrites. |
| `index` | — | regenerates the block in `CLAUDE.md`. Idempotent — with no changes it prints "already up to date". |
| `check` | `--paths`, `--client-names` | runs the gates. Prints every error at once, not just the first. |

Exit codes: `0` success, `1` a validation or gate error, `2` an unknown command.

Claude Code commands (the plugin): `/knowledge-init`, `/transcript-extract <file>`.
Skills loaded automatically: `decisions-format`, `knowledge-audit`.

---

## 11. Working rhythm and ownership

`DECISIONS.md` **has an assigned owner** — by default the project's PM. The audit of the previous
project produced the law "every store needs an owner and an update cadence"; a spec without that
assignment would repeat the very mistake it describes.

| When | Who | What |
|---|---|---|
| after every client call | the owner | `/transcript-extract`, approving the drafts |
| on every PR on a decision path | the PR author | a DEC entry or a deliberate label |
| after every edit of `DECISIONS.md` | the author | `knowledge.mjs index`, commit both files |
| once a sprint | the owner | `/knowledge-audit`, review of back door usage |
| when the back door grows | the owner | narrowing or widening the decision paths |

**Green CI does not mean a healthy second brain.** The gates police the freshness of the
derivative when *code* changes. A decision from a call that touches no decision path ("the client
confirmed the premium package includes X") has no gate at all — its only route into the repo is a
human. That is why the role is assigned rather than assumed.

---

## 12. What repoBrain does not do

Deliberate boundaries, so as not to build expectations the kit does not meet:

- **It does not police whether the source describes reality.** The guarantee covers the drift of
  a *copy*, not the drift of *knowledge*. `Reverses:` is declared by the same human who used to
  forget to update `Status:`. The gain is real but smaller than it sounds: a new entry is a better
  moment for the reminder than going back to an old one, and one place to write beats two.
- **It writes nothing to `DECISIONS.md` automatically.** No auto-commit in CI, no pre-commit
  hook. Automation writing to the repo without a human is the cause of the defect we are fixing.
- **It does not generate a file listing for `docs/`.** The orphan problem is a lack of curation,
  not a lack of a list; an automatic list is `ls -R` in markdown. Instead, `/knowledge-audit`
  reports documents nothing links to.
- **It does not parse raw PDFs in CI.** That is a job for an agent with a human in the loop.
- **It does not migrate existing repos.** The installer does not overwrite, so a retrofit is
  possible later, but converting the format of old entries is neither built nor tested.
- **It does not work offline.** The workflow fetches the kit's code from GitHub via
  `actions/checkout`. The residual risk is recorded deliberately: during a GitHub outage merges
  stall, and a `continue-on-error: true` added under deadline pressure has a way of staying forever.

---

## 13. Developing the kit

```
bin/knowledge.mjs     the CLI — the only place that knows the filesystem, argv and CI env vars
lib/parse.mjs         Markdown → DEC objects
lib/status.mjs        deriving status from the relation graph
lib/render.mjs        rendering the block + splicing it between the markers
lib/integrity.mjs     placeholders, existence of sources, client decisions
lib/gates.mjs         the three CI gates
lib/fences.mjs        the code block mask
lib/init.mjs          the installation plan (a pure function)
templates/            the templates `init` copies
.claude-plugin/       the Claude Code plugin's commands and skills
```

### Why the kit does not go through npm

The original installation instructions used `npx --yes github:monterail/repobrain#<SHA>`.
In GitHub Actions that route **always blows up**:

```
npm error GitFetcher requires an Arborist constructor to pack a tarball
```

It is a defect in npm 10.x — exactly the version `actions/setup-node` installs alongside node 20
and 22. It does not depend on the node version, so bumping node does not help. On machines with
npm ≥ 11 the same command works, and **that is why the bug got through design verification**:
feasibility was checked locally, even though the only environment where that command was ever
going to run was CI.

The fix removes the cause instead of working around the symptom: the kit **has no dependencies**,
so npm had nothing to do here — it was a pure middleman between `git clone` and `node`. The
workflow now fetches it via `actions/checkout` with the same SHA pin and runs it directly. The
pin and its guarantees are unchanged, one link and a dozen seconds of the job disappear.

**The more general lesson:** verification performed in an environment other than the target one
is not verification. Reported by a user, 2026-07-29.

**The architectural invariant:** `lib/` may depend on neither the Claude Code API nor the GitHub
Actions API. A violation would disable the kit in CI — that is, in the only place where
enforcement actually happens. That is why everything in `lib/` is a pure function: text in,
objects and an error array out.

```bash
npm test        # node:test, zero dependencies, no mocks and no temporary files
```

Design: [`docs/design/2026-07-28-repobrain-design.md`](docs/design/2026-07-28-repobrain-design.md) ·
implementation plan: [`docs/plans/2026-07-28-repobrain-implementation.md`](docs/plans/2026-07-28-repobrain-implementation.md)

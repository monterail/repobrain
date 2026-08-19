# repoBrain — design of an in-repo knowledge system

**Date:** 2026-07-28
**Status:** approved for planning (after the Fable 5 review, 2026-07-28)
**Author:** Dominik Pawluś (design with Claude)
**Predecessor:** the audit of the previous project, `docs/reviews/second-brain-audit-2026-07-27.md` — it stays in that project's private repo

> **CORRECTION 2026-08-19 — the knowledge layer switched to English.** This document was
> originally written in Polish, and so was the DEC vocabulary it specifies (`Temat:`,
> `Kontekst:`, `Decyzja:`, `Konsekwencje:`, `Podjął:`, `Odwraca:`, `Zmienia:`, `Obszar:`,
> `Źródło:`, the `WYGENEROWANE:decyzje` marker, the `w cenie | change request | do wyceny`
> scope values). The whole layer is now English; the field names and examples below have been
> translated along with the prose. It is a breaking change with no compatibility layer — a
> permanent dual vocabulary would be the same "two stores" defect the kit exists to remove.
> The migration path for installations from before the switch is in the README, §4.

---

## 1. The problem

The audit of the previous project on 2026-07-27 found seven defects in the knowledge layer. They all share one mechanical cause:

> **Knowledge was maintained as hand-made copies. A copy with no owner drifts away from the original — it is a matter of time, not diligence.**

Evidence from that project:

| Symptom | Data |
|---|---|
| `.claude/memory/` frozen after a single commit | 96 files, 2026-07-08, **0 shared names** with the private store |
| Two files assert a reversed decision | `project_billing_decisions.md`, `project_billing_ux_view.md` vs DEC-033 |
| **`DECISIONS.md` itself is inconsistent** | DEC-015 carries `Status: decided`, even though DEC-033 reversed it |
| A hook committed somebody else's work | 10 commits "chore: sync PM memory", **9 with no memory files**; `d2e431f` on `main` |
| Copies of the knowledge base in worktrees | 3.4 GB, 8,144 `.md` files, 80% noise in greps |
| Orphan documents | 58 out of 135 |

The third row matters most: the system's **best** artefact lied. That rules out any discipline-based solution.

### Scope of the thesis — after correction

The thesis "a derivative plus a CI check cannot drift" is true for **copy drift**, not for **knowledge drift**. The kit guarantees that the generated view does not drift away from the source. It does not guarantee that the source describes reality — because `Reverses:` is declared by the same human who used to forget to update `Status:`. The gain is real, but smaller than it sounded: **a new entry is a better moment for the reminder than going back to an old one**, and one place to write beats two. No more than that.

## 2. Constraints

| Dimension | Decision |
|---|---|
| Next project | The same shape as that project: a client, 2-3 devs + a PM, Jira/Slack, client decisions, fixed price |
| Audience | **The whole team** — the system must be self-describing and survive the people who ignore it |
| Enforcement | **Blocking CI** with a back door (the `no-decision` label) — from the very first PR |
| Scope | **New projects only.** A retrofit of that project is deferred |
| Kit visibility | A **public** repo — zero client data |
| Installation precondition | Branch protection, "require branches to be up to date" — see §4.4 |

## 3. The knowledge model

### Three levels

**Level 1 — the source of truth.** Manual, reviewed in the PR.

| Path | Role |
|---|---|
| `docs/DECISIONS.md` | the backbone: client and technical decisions |
| `docs/specs/`, `docs/api-contract.md` | the implementation contract |
| `Transcripts/` | **evidence** — upstream of decisions, not material for recall |

**Level 2 — the derivative.** Generated, **never written by hand**.

| Where | Contains |
|---|---|
| the block in `CLAUDE.md` between the `GENERATED:decisions` markers | **active** decisions only, one line each |

**Level 3 — outside the repo.** Private memory in `~/.claude/projects/`. Zero syncing into the repo. Attempting such a sync was the source of two of the seven defects in that project.

### Why the derivative lives in `CLAUDE.md` rather than a separate file

The original design emitted `.claude/knowledge-index.md`. The review showed that **this file would have no consumer**: Claude Code does not load it automatically, nothing points at it, the precedence rule does not list it. It would be a generated orphan — the very category the kit supposedly removes.

In parallel, the "Facts" section in `CLAUDE.md` was, in that project, a **hand-made copy of decision content**, fed by `/transcript-extract`. That is exactly the mechanism by which `CLAUDE.md` in that project grew into an encyclopaedia of strikethroughs and "update 2026-06-17" asides. The rule "on a conflict, DECISIONS.md wins" was an admission that the copy would drift — that is, managing drift instead of eliminating it, in a file loaded into context **always**.

One solution closes both problems: active decisions are rendered straight into `CLAUDE.md` between markers. A guaranteed consumer, the highest-stakes copy stops being a copy, one file fewer.

```markdown
<!-- GENERATED:decisions — do not edit. Run: node <kit>/bin/knowledge.mjs index -->
| DEC | Date | Area | Topic |
|-----|------|------|-------|
| DEC-039 | 2026-07-20 | billing | Correcting invoice outside the limit *(changed by DEC-036)* |
<!-- /GENERATED:decisions -->
```

The hand-written "Facts" section **disappears from the model**. A fact nobody took as a decision is not project knowledge — it is a note.

### The precedence rule

It goes into every project's `CLAUDE.md`:

```
1. docs/DECISIONS.md — the full text of each decision; Reverses:/Changes: settle what is current
2. the GENERATED:decisions block in this file — a digest of the active ones, always consistent with (1)
3. docs/specs/ + api-contract.md — the implementation contract
4. Transcripts/ — supporting evidence, when 1-3 are silent
Anything outside this list is a working note, not a source of truth.
```

### DEC entry format

```markdown
## DEC-039 — 2026-07-20
**Changes:** DEC-036
**Area:** billing, webhooks
**Scope:** in scope
**Source:** Transcripts/2026-07-20-client-call.md
**Topic:** A correcting invoice does not count towards the limit and sends no notification
**Context:** …
**Decision:** …
**Consequences:** …
**Decided by:** Smith — call 2026-07-20
```

**The manual `Status:` field is removed.** Status is derived from the relation graph.

#### Three relations between entries

| Field | Semantics | Effect in the index |
|---|---|---|
| `Reverses: DEC-X` | X stops applying entirely | X leaves the active set and lands in history |
| `Changes: DEC-X` | X still applies, this entry refines part of it | both active; X gets a "changed by" annotation |
| none | an independent decision | active |

The distinction is forced by the data: that project has **3 full reversals** (DEC-006←009, DEC-015←033, DEC-035←036) and **1 refinement** — DEC-039 settles the open questions of DEC-036, while the core of DEC-036 (auto-correction) still applies. A binary model would force the author of DEC-039 to choose between two errors: `Reverses:` would delete a decision still in force, and no field at all would leave a stale detail in the index.

Both fields must point at an **earlier** entry — earlier by date, and on an equal date by ID number. A forward reference is a format error, not a decision.

#### The remaining fields

Required: `Topic`, `Context`, `Decision`, `Consequences`, `Decided by`. Optional: `Reverses`, `Changes`, `Area`, `Scope`, `Source`.

**`Scope:`** accepts `in scope | change request | needs estimate`. Under fixed price the most contested kind of knowledge is not "how does X work" but "is X in scope" — and a model that does not record it does not protect you in the very dispute it was built for. That project kept this in `COMMERCIAL.md`, outside any mechanism at all.

**`Source:`** is a path to the evidence. **Required when `Decided by:` names the client** — because that is exactly where evidence is needed. For a team decision it is optional.

**`Area:`** free text, a comma-separated list. Zero tag-validating machinery — revisit after ~30 entries; earlier is YAGNI.

#### Policy for editing existing entries

"You never go back to an old entry" was too strong — that project breaks it twice (`DEC-016 (confirmed 2026-05-04)`, `DEC-021 (updated 2026-05-27)`). So the distinction is:

- **A corrective edit** (typo, wrong date, adding `Source:`) — allowed in place.
- **A substantive change** — only as a new entry with `Reverses:` or `Changes:`.

The boundary is not machine-enforceable, and that is deliberate. The PR review enforces it.

### Meeting transcripts

Transcripts are the source DEC entries come from — not the content of the index. The pipeline stays manually triggered:

```
raw recording (PDF/VTT, named by the vendor)
   ↓  /transcript-extract  — one command, a human approves every write
   ├─ Transcripts/YYYY-MM-DD-slug.md   summary (archive + evidence)
   ├─ draft DEC entries with Source: and Scope: fields → docs/DECISIONS.md
   ├─ draft uncertainties → HYPOTHESES.md
   └─ a list of action items → to paste into Jira (NOT into the repo)
```

The kit standardises **only the summary file name** (`YYYY-MM-DD-slug.md`), so that references from `Source:` are predictable. It does not touch the raw recordings.

#### Classification by lifespan

Extraction itself is a solved problem — the template from that project (context, decisions, action items, scope implications, open questions, quotes) proved itself in practice; DEC-011…DEC-015 came out of the summary from 2026-04-29. What was missing was **routing items to where they should live**:

| Item type | Destination | Lifespan |
|---|---|---|
| Decision | a DEC entry draft | durable, versioned |
| Uncertainty, assumption | `HYPOTHESES.md` | to be settled |
| Action item | a list to paste into Jira | transient — **does not go into the repo** |
| Quote | stays in the summary as evidence | archive |

The routing criterion is **lifecycle, not content type**. A decision and a task look alike in a transcript; what separates them is that a decision holds until someone reverses it, while a task dies once it is done. Tasks in `docs/` would turn into TODO lists nobody ever closes.

The command **writes nothing without a human's approval** — the same principle for which we reject auto-commit in CI (§4.5).

#### The feedback loop of the `Source:` field

| Direction | Question | Where |
|---|---|---|
| forwards | does the transcript named in a DEC exist? | the `integrity` gate, **blocks** |
| backwards | does a transcript carrying decisions have at least one DEC pointing at it? | `/knowledge-audit`, **warns** |

The backwards loop answers the question "did something from this conversation fall through". It is deliberately not a CI gate: not every decision from a call deserves a DEC entry, so blocking would generate false alarms.

## 4. The mechanism

### 4.1 The generator

Input: `docs/DECISIONS.md`.
Steps: parse the blocks → build the graph from `Reverses:`/`Changes:` → derive the active set → render the block in `CLAUDE.md` between the markers.

The generator replaces **only the content between the markers**. Missing markers in `CLAUDE.md` = an error telling you to run `init`, never a silent append at the end.

### 4.2 The hard parsing rule

**Every `## ` heading in `DECISIONS.md` that is not a fully valid DEC block is a hard `integrity` gate error.**

Without that rule a typo in a heading (`## DEC-41 - 2026-9-3`) would cause a silent skip: the decision disappears from the index and both gates go green. That state is **worse** than the lying `Status: decided` from that project — there the entry at least existed.

The date separator accepts `-`, `–` and `—`. Requiring an em dash would be asking for trouble.

### 4.3 The three CI gates

| Gate | Detects |
|---|---|
| `index-fresh` | regenerating the block gives a different result than the commit |
| `integrity` | a format error or a contradiction in the graph |
| `decision-required` | a PR on a decision path with no DEC entry |

`integrity` checks: every `## ` is a valid DEC block · `Reverses:`/`Changes:` point at an existing, earlier DEC · no duplicate IDs · `Source:` points at an existing file · `Source:` present when `Decided by:` names the client · no unfilled placeholders.

Placeholders are detected by a **closed list** (`[date]`, `[fill in]`, `[TBD]`, `[verify]`, `TODO`), not by a "any `[...]`" pattern. Data from that project: alongside three `[date]` and two `[fill in]` there are legitimate brackets in the content (`[account deletion]`, `[warning modal]`, `[id]`). A general pattern would produce 60% false alarms.

**Removed from the gates after review:** a link checker over all of `docs/` (the audit of the previous project itself established that some dead links are relative paths resolved from other directories — a gate with false alarms dies) and cycle detection (with "backwards only" enforced and duplicates banned, a cycle is impossible; it stays as an `assert` in the code, not as a feature). Both move to `/knowledge-audit`.

### 4.4 `decision-required` — configuration and friction

Decision paths as a CLI argument, not a configuration file:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]
  push:
    branches: [main]

jobs:
  knowledge:
    steps:
      - run: npx --yes github:monterail/repobrain#<SHA> check
             --paths 'docs/specs/**,**/pricing*'
```

Three things that follow directly from the review:

**`types: [… labeled, unlabeled]` is mandatory.** Without it, adding the `no-decision` label does not retrigger the workflow, and the team discovers in week one that "I added the label and it is still red".

**The starting paths are narrow** — `docs/specs/` and pricing, without `migrations/`. Most migrations (an index, a column rename) have no client decision behind them; catching them would turn the label into a reflex, like `--no-verify`. Widen after a month of observation.

**Uses of `no-decision` are visible.** Dropping the requirement to justify it is right (a requirement encourages working around it), so the only remaining defence is visibility: `/knowledge-audit` reports the number of uses and the list of PRs. Without that, the back door quietly becomes the norm.

The gate reads labels from `GITHUB_EVENT_PATH`; outside PR context (a push to `main`) it is skipped.

**DEC number collisions.** Two PRs adding DEC-040 can auto-merge if they insert entries in different places in the file — the second merge turns `main` red, and fixing it by renumbering invalidates references that already went out in Slack and in `Reverses:` fields. That is why branch protection, **"require branches to be up to date before merging"**, is an installation precondition (§2), not a recommendation. Entries are appended at the end of the file so that git produces a text conflict instead of a silent auto-merge.

### 4.5 Deliberately rejected: auto-committing the regeneration

CI does **not** commit the refreshed block. It would save one round trip, but mechanically it is the same idea that poisoned that project's history. The build fails with the message `run: node <kit>/bin/knowledge.mjs index`.

## 5. Kit architecture

```
repobrain/                    (a public GitHub repo)
  .claude-plugin/
    skills/decisions-format/         teaches the agent the DEC format
    skills/knowledge-audit/          on-demand drift audit
    commands/knowledge-init.md       scaffolds the files in the target repo
    commands/transcript-extract.md   transcript → summary + routed drafts
  bin/knowledge.mjs                  CLI: `init` | `index` | `check`
  lib/parse.mjs                      the DECISIONS.md parser
  lib/status.mjs                     deriving status from the relation graph
  lib/render.mjs                     rendering the block into CLAUDE.md
  lib/*.test.mjs                     node:test, zero dependencies
  package.json                       the `bin` field, zero dependencies
  README.md                          the model on one page
```

The target repo gets **two files and one modification**:

```
docs/DECISIONS.md                manual
.github/workflows/knowledge.yml  calls npx with a SHA pin
CLAUDE.md                        + the precedence rule, + the GENERATED:decisions block
```

### Pinning by SHA, not by tag

**Git tags are mutable.** Anyone with push rights to the kit repo can move `v1.0.0` and execute arbitrary code — with the `--yes` flag — in the CI of every client project in the agency. So the workflow pins the commit's full SHA.

### CORRECTION 2026-07-29 — `npx` replaced by `actions/checkout`

> Everything below in this section describes the **original** distribution mechanism. It was
> withdrawn after a report from a real deployment: `npx --yes github:…#<SHA>` **always**
> fails in GitHub Actions with `GitFetcher requires an Arborist constructor` — a defect in
> npm 10.x, the version `actions/setup-node` installs alongside node 20 and 22.
>
> The verification at the end of this section (`npx --yes github:isaacs/rimraf --help`, exit 0)
> was carried out **locally**, on npm ≥ 11, where the defect does not occur — that is, in a
> different environment from the only one where that command was ever going to run. That is
> the right conclusion to draw from this mistake: verification outside the target environment
> is not verification.
>
> The mechanism in force: the workflow fetches the kit through a second `actions/checkout` step
> (`repository: monterail/repobrain`, `ref: <FULL_SHA>`, `path: .repobrain`) and runs
> `node .repobrain/bin/knowledge.mjs`. The kit has no dependencies, so npm was purely a
> middleman in that chain — removing it fixes the error and shortens the job.
>
> **The trade-off analysis below remains valid in full**: it was about choosing "code fetched
> remotely at a pin" over "vendoring", not about which tool does the fetching. The full-SHA
> pin and all its guarantees are unchanged.

### An honest justification for remote fetching over vendoring

The original spec justified `npx` with the sentence "we remove the last copy from the system". That was rhetoric: it conflated **a copy of knowledge** (drifts away from the truth — harmful) with **a copy of a tool** (that is called vendoring, it is normal; `node_modules` is nothing but copies).

The real trade-off:

| | `npx github:#SHA` | vendoring the scripts in the repo |
|---|---|---|
| A fix in the kit | one SHA bump per project | copy-paste into every repo |
| Works offline / during a GitHub outage | **no** | yes |
| Supply-chain surface | remote code (bounded by the SHA pin) | none |
| Goes through review in the project | no | yes |

We choose `npx`, because a central fix matters more at 2+ projects and the SHA pin closes the main risk. **Residual risk, recorded deliberately:** during a GitHub outage merges stall in every project, and a `continue-on-error: true` added under deadline pressure has a way of staying forever.

Feasibility check: `npx --yes github:isaacs/rimraf --help` ran the CLI straight from a GitHub repo (2026-07-28, exit 0).

### The architectural invariant

> `lib/` may depend on neither the Claude Code API nor the GitHub Actions API.

A violation — reading session context in the generator, say — would disable the kit in CI, that is, in the only place where enforcement actually happens.

### What the plugin buys beyond scaffolding

The `decisions-format` skill makes an agent writing a DEC entry use the right format with nobody intervening — the same "survives the people who ignore the convention" property, only on the agent's side instead of CI's.

## 6. Rollout

### 6.1 Installation

`/knowledge-init` or `node <kit>/bin/knowledge.mjs init` creates `docs/DECISIONS.md` (a skeleton with the format description and DEC-001 as an example) and the workflow, and appends to `CLAUDE.md` the precedence rule and an empty marker pair.

The installer **never overwrites existing files**; it reports what it added and what it skipped. Thanks to that rule the same code handles an empty repo and a two-week-old one, with no separate mode.

Two things are filled in by hand: the list of decision paths in the workflow, and enabling branch protection.

Neither `Transcripts/` nor `HYPOTHESES.md` is scaffolded — they come into existence the first time `/transcript-extract` is used.

### 6.2 Ownership

`DECISIONS.md` **has an assigned owner** — by default the project's PM. The audit of the previous project produced the law "every store needs an owner and an update cadence"; a spec without that assignment would repeat the very mistake it describes.

The scope of the role: runs `/transcript-extract` after client calls, reviews the `/knowledge-audit` report once a sprint, decides when to widen the decision paths.

**Green CI does not mean a healthy second brain.** The gates police the freshness of the derivative when *code* changes. A decision from a call that touches no decision path ("the client confirmed the premium package includes X") has no gate at all — its only route into the repo is a human. That is why the role is assigned rather than assumed.

### 6.3 Retrofitting existing repos — deferred

That project and other running projects stay untouched. The kit is designed so that a retrofit is possible later (the installer does not overwrite, the generator refuses to overwrite files that are not its own), but migrating the format of existing entries is neither built nor tested.

## 7. Verification

**Unit tests** (`node:test`, zero dependencies):

| Case | Expectation |
|---|---|
| a DEC with no relation | active |
| a DEC reversed by a later one | inactive, lands in history |
| a DEC **changed** by a later one | **active**, with a "changed by" annotation |
| a `Reverses` chain A ← B ← C | only C active |
| `Changes:` on an already reversed entry | a warning — changing a dead decision |
| a relation pointing at a non-existent DEC | error |
| a relation pointing at a **later** DEC | error |
| equal date, relation pointing at a higher ID | error |
| a duplicate ID | error |
| a `## ` heading that is not a valid DEC | **hard error**, never a silent skip |
| the separator `-` / `–` / `—` in the date | all accepted |
| `Source:` pointing at a non-existent file | error |
| `Decided by:` naming the client, no `Source:` | error |
| a bracket in the content (`[warning modal]`) | **not** a placeholder |
| `CLAUDE.md` without markers | an error telling you to run `init`, never an append at the end |

**Fixtures modelled on the real pathologies of that project:** the DEC-015/DEC-033 pair (a full reversal with `Status: decided` in the original), the DEC-036/DEC-039 pair (a refinement — the core still applies), an entry with a `[date]` placeholder, an entry with a legitimate bracket in the content.

**An end-to-end test** in a fresh temporary repo:

| # | Step | Expectation |
|---|---|---|
| 1 | `init` | two files + a modified `CLAUDE.md` |
| 2 | DEC-002 with `Reverses: DEC-001`, then `index` | DEC-001 leaves the active set |
| 3 | DEC-003 with `Changes: DEC-002`, then `index` | both active, DEC-002 annotated |
| 4 | `check` without regeneration | red (`index-fresh`) |
| 5 | `index`, then `check` | green |
| 6 | a change on a decision path without `DECISIONS.md` | red (`decision-required`) |
| 7 | the same with the `no-decision` label | green |

Steps 6-7 require a fabricated `GITHUB_EVENT_PATH` — outside PR context the gate is skipped (§4.4).

## 8. Deliberately out of scope (YAGNI)

- **A generated `docs/README.md`** — removed after review. As a blocking gate it would be the most frequent red CI of the least value: every QA report added would turn the build red, including for a PM with no Node. And an automatic list of all files is `ls -R` in markdown — the orphan problem from the audit (C5) is a lack of **curation**, not a lack of a list. Instead of the file: `/knowledge-audit` reports documents nothing links to.
- **A hand-written "Facts" section in `CLAUDE.md`** — removed from the model; see §3.
- **Conditional and expiring decisions** (`applies if Meta rejects the template`; `until 2026-12-31`) — no representation. Acceptable on a 6-9 month project; revisit when a second such case shows up.
- **Transcript retention after the project ends** — recordings of client calls living in git history forever is a contractual and GDPR question once the client demands deletion. The kit does not solve it; to be settled at the first handover.
- **Detecting semantic contradictions between documents** — expensive and unreliable.
- **Migrating the specs from HTML to Markdown** — a separate decision.
- **Indexing transcript content** — evidence is read on demand, not material for recall.
- **Parsing raw PDFs in CI** — a job for an agent with a human in the loop, not for a gate.
- **Automatically writing items from a transcript** — `/transcript-extract` produces drafts for approval.
- **Tracking action item status in the repo** — tasks have Jira's lifecycle, not git's.
- **A local / pre-commit hook** — automation writing to the repo without a human is the cause of the defect we are fixing.
- **Support for repos without Node** — universality would cost simplicity.
- **Retrofitting existing repos, including that one** — see §6.3.

## 9. Open questions

| # | Question | Owner |
|---|---|---|
| O-1 | The team's agreement to blocking gates + branch protection, before they enter the first project | Dominik |
| O-2 | Where the kit repo lives in the Monterail org and who administers it (push rights = supply-chain trust) | Dominik |
| O-3 | Who owns `DECISIONS.md` in the first project — the PM or the dev lead | Dominik |
| O-4 | The list of decision paths — known only after kickoff | deferred by design |

**Risk accepted deliberately:** without a deployment in that project, the kit will not be verified on a real project before its first use. The end-to-end test covers the mechanics, not the ergonomics. The first project is simultaneously the first test of whether the team is willing to write DEC entries — which is why the kit is deliberately small and a fix after the first week is cheap.

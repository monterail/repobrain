---
description: Extract decisions, uncertainties and tasks from a transcript; route them to the right places
argument-hint: <path to transcript>
allowed-tools: Read, Write, Edit, Bash
---

Process the transcript: **$ARGUMENTS**

## Step 1 — read and summarise

Write the summary to `Transcripts/YYYY-MM-DD-slug.md` (take the date from the file
name or the content). Create the directory if it does not exist. Template:

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

Do not invent anything. Mark whatever is unclear with `[verify]` and report it to the
user — the `integrity` gate rejects a `[verify]` left in `DECISIONS.md`.

## Step 2 — classify by lifespan

The routing criterion is an item's **lifecycle**, not its type. A decision holds
until someone reverses it; a task dies once it is done.

| Type | Destination |
|---|---|
| Decision | draft DEC entry → `docs/DECISIONS.md` |
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

**Show the drafts in your reply — do not write them to disk.** They are saved only after the user approves in Step 4.

## Step 4 — show and wait

**Do not save anything beyond the step 1 summary without the user's consent.**
Show the drafts, ask which to apply. Once approved, append them to the end of
`docs/DECISIONS.md`, run `node <PATH_TO_KIT>/bin/knowledge.mjs index`
and show what changed.

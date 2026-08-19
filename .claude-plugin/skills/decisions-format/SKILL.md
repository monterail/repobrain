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
**Reverses:** DEC-XXX     (optional — XXX stops applying entirely)
**Changes:** DEC-XXX      (optional — XXX still applies, this entry refines part of it)
**Area:** tag, tag        (optional)
**Scope:** in scope       (optional — in scope | change request | needs estimate)
**Source:** Transcripts/YYYY-MM-DD-slug.md   (optional; required for client decisions)
**Topic:** one sentence
**Context:** why the topic came up
**Decision:** what was agreed
**Consequences:** what this changes in code, cost, schedule
**Decided by:** who and where
```

## Hard rules

- Required fields: `Topic`, `Context`, `Decision`, `Consequences`, `Decided by`.
- The date is strictly `YYYY-MM-DD` with leading zeros. Separator `-`, `–` or `—`.
- `Scope:` accepts only `in scope`, `change request`, `needs estimate`.
- **Never add a `Status:` field** — status follows from the relations and is derived.
- Append a new entry **at the end of the file**.
- Never edit the `GENERATED:decisions` block in `CLAUDE.md`. Run `node <PATH_TO_KIT>/bin/knowledge.mjs index`.

## Placeholders that block CI

The strings below block the whole file. Do not use them as deliberate working markers:

```
[date]   [fill in]   [TBD]   [verify]   TODO
```

If something is still unknown when you write the entry, it is better not to commit the entry at all than to commit an incomplete one.

## Which relation to pick

| Situation | Field |
|---|---|
| The previous decision stops applying entirely | `Reverses:` |
| The previous one still applies, you are refining part of it | `Changes:` |
| A topic unrelated to any earlier one | neither |

An entry may not declare both relations at once. The relation must point at an earlier
entry by the (date, ID number) pair.

When torn between `Reverses:` and `Changes:`, ask: *after this change, is anyone still
operating under the old entry?* If yes — `Changes:`.

## After editing

Run `node <PATH_TO_KIT>/bin/knowledge.mjs index` and commit `CLAUDE.md` together with `DECISIONS.md`. Without that
the `index-fresh` gate blocks the merge.

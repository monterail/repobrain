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
**Area:** tag, tag        (optional)
**Scope:** in scope       (optional — in scope | change request | needs estimate)
**Source:** Transcripts/YYYY-MM-DD-slug.md   (optional; required for client decisions)
**Topic:** one sentence
**Context:** why the topic came up at all
**Decision:** what was agreed
**Consequences:** what this changes in code, cost, schedule
**Decided by:** who and where
```

**Relation constraints:**

- `Reverses:` and `Changes:` are **mutually exclusive** — an entry may carry at most one of these relations, never both at once. If a change concerns two earlier decisions, you need two entries.
- The target of a relation (both `Reverses:` and `Changes:`) must point at an **earlier entry** (earlier date, or — on equal dates — a lower ID number).

**Placeholders that block CI:**

The strings below block the whole file. Do not use them as deliberate working markers:

```
[date]   [fill in]   [TBD]   [verify]   TODO
```

If something is still unknown when you write the entry, it is better not to commit the entry at all than to commit an incomplete one.

Rules:

- Append new entries **at the end of the file** — that way parallel PRs produce a text conflict instead of a silent auto-merge.
- Status is never written down. It follows from the `Reverses:` and `Changes:` fields of later entries.
- A substantive change means a new entry. A corrective edit (typo, date, adding `Source:`) is allowed in place.

---

## DEC-001 — 2026-01-01
**Area:** process
**Topic:** Project decisions live in this file
**Context:** Knowledge scattered across Slack and transcripts does not survive team rotation.
**Decision:** Every decision that affects scope, cost or architecture lands here as a DEC entry.
**Consequences:** CI blocks PRs on decision paths that carry no entry. A digest of the active decisions is generated into CLAUDE.md.
**Decided by:** The team — repoBrain installation

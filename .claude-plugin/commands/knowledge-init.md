---
description: Install repoBrain in the current repo — DECISIONS.md, CI workflow, CLAUDE.md section
allowed-tools: Bash, Read, Edit
---

Install repoBrain in this repository.

## Step 1 — run the installer

```bash
node <PATH_TO_KIT>/bin/knowledge.mjs init
```

The kit has no dependencies — it runs straight through `node`, with no `npm` and no `npx`.
If you do not have it locally: `git clone https://github.com/monterail/repobrain.git ~/.repobrain`
and `git -C ~/.repobrain checkout <FULL_SHA>`.

The installer never overwrites existing files. It reports what it added (`+`)
and what it skipped (`=`).

## Step 2 — fill in what the installer could not guess

1. **Decision paths** in `.github/workflows/knowledge.yml`. Start narrow —
   `docs/specs/**` and pricing files. Do not add the migrations directory on day one: most
   migrations have no client decision behind them, and catching them turns the
   `no-decision` label into a reflex.
2. **The full SHA** of repoBrain in the `ref:` field of the `actions/checkout` step in the same file.
   Never a tag — git tags are mutable, and this is remote code executed in CI.
3. **Branch protection**: "require branches to be up to date before merging". Without it
   two PRs can add the same DEC number and auto-merge, breaking `main`.
4. **Client names** in the `--client-names` flag in the same file. Without them the
   `integrity` gate never requires the `Source:` field for decisions made by the client —
   the rule is in the code, but it stays silent.

## Step 3 — first generation

```bash
node <PATH_TO_KIT>/bin/knowledge.mjs index
```

Commit `docs/DECISIONS.md` and `CLAUDE.md` together.

## Step 4 — report back to the user

What was created, what was skipped, and which of the four items from step 2 are still pending.

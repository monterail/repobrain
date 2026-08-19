---
name: knowledge-audit
description: Use when asked to audit the repo's knowledge layer, check for documentation drift, find orphaned documents, or review how often the no-decision label is being used. Reports problems that CI gates deliberately do not block on.
---

# Knowledge layer audit

CI gates catch single events. This audit catches systemic drift — the things that would
produce false alarms if you blocked on them.

## Scope

**1. Lost decisions.** For every `Transcripts/*.md` with a "Decisions" section,
check whether a DEC entry exists whose `Source:` points at that file. Missing = warning,
not an error — not every decision from a call deserves an entry.

**2. Back door usage.** Count PRs labelled `no-decision` from the last 30 days:

```bash
gh pr list --label no-decision --state all --limit 100 \
  --json number,title,mergedAt,author
```

A rising count means the decision paths are too broad or the gate is being worked around.
Report the count and the list — this is the only defence against the back door being
quietly normalised.

**3. Unreferenced documents.** Files in `docs/` that nothing in the repo links to:

```bash
git ls-files 'docs/*' | grep -E '\.(md|html)$' | while read -r f; do
  n=$(grep -rl --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next --exclude-dir=coverage -F "$(basename "$f")" . | sed 's|^\./||' | (grep -Fxv "$f" || true) | wc -l | xargs)
  [ "$n" = 0 ] && echo "$f"
done
```

Report the list for review. Do not propose deleting them wholesale — some are a legitimate archive.

**4. Dead internal links.** References inside `docs/` that do not resolve.
Deliberately outside the CI gate: some are relative paths resolved from other directories,
so blocking on them would produce false alarms.

## Report format

The sections above, each finding with an assigned severity (`error` / `warning` / `review`)
and a concrete path. No proposed changes until the user asks for them.

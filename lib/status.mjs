const order = (d) => `${d.date}#${String(d.num).padStart(6, '0')}`;

export function deriveStatus(decs) {
  const errors = [];
  const byId = new Map(decs.map((d) => [d.id, d]));
  const withErrors = new Set(); // Tracks entries that failed validation

  // Collect duplicate ID information first
  const idCount = new Map();
  for (const d of decs) {
    idCount.set(d.id, (idCount.get(d.id) ?? 0) + 1);
  }
  const duplicatedIds = new Set();
  for (const [id, count] of idCount) {
    if (count > 1) duplicatedIds.add(id);
  }

  // --- validation runs before the graph is built ---
  const reportedDuplicates = new Set();
  for (const d of decs) {
    if (duplicatedIds.has(d.id)) {
      // Report the error once per ID, on the line of the first duplicate
      if (!reportedDuplicates.has(d.id)) {
        errors.push(`${d.line}: duplicate ID ${d.id}`);
        reportedDuplicates.add(d.id);
      }
      withErrors.add(d.id); // Every duplicate is invalid
    }
  }

  for (const d of decs) {
    if (d.reverses && d.changes) {
      errors.push(`${d.line}: ${d.id} declares both Reverses and Changes — only one relation is allowed`);
      withErrors.add(d.id);
      continue;
    }
    const target = d.reverses ?? d.changes;
    if (!target) continue;

    // If the target is duplicated the reference is ambiguous — that is an error
    if (duplicatedIds.has(target)) {
      errors.push(`${d.line}: ${d.id} points at ${target}, which is duplicated (ambiguous target)`);
      withErrors.add(d.id);
      continue;
    }

    const t = byId.get(target);
    if (!t) {
      errors.push(`${d.line}: ${d.id} points at ${target}, which does not exist`);
      withErrors.add(d.id);
      continue;
    }
    if (order(t) >= order(d)) {
      errors.push(`${d.line}: ${d.id} must point at an entry earlier than ${target}`);
      withErrors.add(d.id);
    }
  }

  // Entries that failed validation contribute no relations to the graph — their
  // reverses/changes fields are ignored below. The decision itself stays visible.

  // --- graph construction ---
  const reversedBy = new Map();
  const changedBy = new Map();
  for (const d of decs) {
    if (withErrors.has(d.id)) continue; // Skip relations of invalid entries
    if (d.reverses) reversedBy.set(d.reverses, d.id);
    if (d.changes) {
      if (!changedBy.has(d.changes)) changedBy.set(d.changes, []);
      changedBy.get(d.changes).push(d.id);
    }
  }

  for (const d of decs) {
    if (withErrors.has(d.id)) continue; // Skip this extra check for invalid entries
    if (d.changes && reversedBy.has(d.changes)) {
      errors.push(`${d.line}: ${d.id} changes ${d.changes}, which was reversed by ${reversedBy.get(d.changes)}`);
      withErrors.add(d.id);
    }
  }

  // --- split into active and history, newest first ---
  const sorted = [...decs].sort((a, b) => (order(a) < order(b) ? 1 : -1));
  const active = [];
  const history = [];
  for (const d of sorted) {
    if (reversedBy.has(d.id)) {
      history.push({ dec: d, reversedBy: reversedBy.get(d.id) });
    } else {
      // An entry that was itself reversed can no longer "change" its target —
      // its refinement dies together with it.
      const changers = (changedBy.get(d.id) ?? []).filter((id) => !reversedBy.has(id));
      active.push({ dec: d, changedBy: changers.sort() });
    }
  }

  return { active, history, errors };
}

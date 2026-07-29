const order = (d) => `${d.date}#${String(d.num).padStart(6, '0')}`;

export function deriveStatus(decs) {
  const errors = [];
  const byId = new Map(decs.map((d) => [d.id, d]));
  const withErrors = new Set(); // Śledzenie wpisów, które mają błędy walidacji

  // Najpierw zebrać informacje o duplikatach ID
  const idCount = new Map();
  for (const d of decs) {
    idCount.set(d.id, (idCount.get(d.id) ?? 0) + 1);
  }
  const duplicatedIds = new Set();
  for (const [id, count] of idCount) {
    if (count > 1) duplicatedIds.add(id);
  }

  // --- walidacja poprzedza budowę grafu ---
  const reportedDuplicates = new Set();
  for (const d of decs) {
    if (duplicatedIds.has(d.id)) {
      // Raportuj błąd tylko raz na ID, na linii pierwszego duplikata
      if (!reportedDuplicates.has(d.id)) {
        errors.push(`${d.line}: duplikat ID ${d.id}`);
        reportedDuplicates.add(d.id);
      }
      withErrors.add(d.id); // Wszystkie duplikaty są nieważne
    }
  }

  for (const d of decs) {
    if (d.reverses && d.changes) {
      errors.push(`${d.line}: ${d.id} deklaruje jednocześnie Odwraca i Zmienia — dozwolona jest jedna relacja`);
      withErrors.add(d.id);
      continue;
    }
    const target = d.reverses ?? d.changes;
    if (!target) continue;

    // Sprawdzić czy cel jest zduplikowany — jeśli tak, to błąd
    if (duplicatedIds.has(target)) {
      errors.push(`${d.line}: ${d.id} wskazuje na ${target}, który jest zduplikowany (cel niejednoznaczny)`);
      withErrors.add(d.id);
      continue;
    }

    const t = byId.get(target);
    if (!t) {
      errors.push(`${d.line}: ${d.id} wskazuje na ${target}, który nie istnieje`);
      withErrors.add(d.id);
      continue;
    }
    if (order(t) >= order(d)) {
      errors.push(`${d.line}: ${d.id} musi wskazywać na wpis wcześniejszy niż ${target}`);
      withErrors.add(d.id);
    }
  }

  // Wpisy z błędami walidacji nie wnoszą żadnych relacji do grafu — ich elementy
  // reverses/changes są ignorowane poniżej. Sama decyzja pozostaje widoczna.

  // --- budowa grafu ---
  const reversedBy = new Map();
  const changedBy = new Map();
  for (const d of decs) {
    if (withErrors.has(d.id)) continue; // Pomiń relacje wpisów z błędami
    if (d.reverses) reversedBy.set(d.reverses, d.id);
    if (d.changes) {
      if (!changedBy.has(d.changes)) changedBy.set(d.changes, []);
      changedBy.get(d.changes).push(d.id);
    }
  }

  for (const d of decs) {
    if (withErrors.has(d.id)) continue; // Pomiń tę dodatkową walidację dla wpisów z błędami
    if (d.changes && reversedBy.has(d.changes)) {
      errors.push(`${d.line}: ${d.id} zmienia ${d.changes}, który został odwrócony przez ${reversedBy.get(d.changes)}`);
      withErrors.add(d.id);
    }
  }

  // --- podział na aktywne i historię, najnowsze pierwsze ---
  const sorted = [...decs].sort((a, b) => (order(a) < order(b) ? 1 : -1));
  const active = [];
  const history = [];
  for (const d of sorted) {
    if (reversedBy.has(d.id)) {
      history.push({ dec: d, reversedBy: reversedBy.get(d.id) });
    } else {
      // Wpis, ktory sam zostal odwrocony, nie moze dalej "zmieniac" celu —
      // jego doprecyzowanie umiera razem z nim.
      const changers = (changedBy.get(d.id) ?? []).filter((id) => !reversedBy.has(id));
      active.push({ dec: d, changedBy: changers.sort() });
    }
  }

  return { active, history, errors };
}

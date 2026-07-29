import { buildFenceMask } from './fences.mjs';

const HEADING = /^##\s+(.+?)\s*$/;
const DEC_HEADING = /^DEC-(\d+)\s*[-–—]\s*(\d{4}-\d{2}-\d{2})$/;
const FIELD = /^\*\*([^:*]+):\*\*\s*(.*)$/;

const REQUIRED = ['Temat', 'Kontekst', 'Decyzja', 'Konsekwencje', 'Podjął'];
const OPTIONAL = ['Odwraca', 'Zmienia', 'Obszar', 'Scope', 'Źródło'];
const SCOPES = ['w cenie', 'change request', 'do wyceny'];

const KEY = {
  Temat: 'topic', Kontekst: 'context', Decyzja: 'decision',
  Konsekwencje: 'consequences', 'Podjął': 'decidedBy',
  Odwraca: 'reverses', Zmienia: 'changes', Obszar: 'area',
  Scope: 'scope', 'Źródło': 'source',
};

const normalizeId = (n) => `DEC-${String(n).padStart(3, '0')}`;

function parseFields(blockLines, headingLine, fenceMask = []) {
  const raw = {};
  const errors = [];
  let current = null;
  for (let idx = 0; idx < blockLines.length; idx++) {
    const line = blockLines[idx];
    if (fenceMask[idx]) {
      // Linia wewnątrz ogrodzenia bloku kodu nigdy nie jest polem ani jego
      // kontynuacją — inaczej przykład z dokumentacji fabrykowałby pola
      // (i relacje Odwraca/Zmienia) na prawdziwym wpisie. Zerujemy `current`,
      // żeby proza po zamknięciu ogrodzenia nie doklejała się do pola sprzed bloku.
      current = null;
      continue;
    }
    const m = line.match(FIELD);
    if (m) {
      const name = m[1].trim();
      if (!KEY[name]) { current = null; continue; }
      current = name;
      raw[name] = m[2].trim();
      continue;
    }
    if (current && line.trim() !== '' && !line.startsWith('---')) {
      raw[current] = `${raw[current]} ${line.trim()}`.trim();
    }
  }
  for (const name of REQUIRED) {
    if (!raw[name]) errors.push(`${headingLine}: brak wymaganego pola ${name}`);
  }
  return { raw, errors };
}

export function parseDecisions(text) {
  const lines = text.split('\n');
  const decs = [];
  const errors = [];

  // Build fence mask. Maska tu obejmuje caly plik (nie tylko preambule) —
  // integrity.mjs maskuje ogrodzenia tylko w preambule, celowo, bo tam
  // ogrodzenia to dokumentacja formatu, a od pierwszego wpisu DEC placeholdery
  // maja obowiazywac takze wewnatrz cytatow.
  const { mask: inFenceLines, unclosedLine } = buildFenceMask(lines);

  // Report unclosed fence with context about impact on parsing
  if (unclosedLine >= 0) {
    errors.push(
      `${unclosedLine + 1}: niezamkniete ogrodzenie bloku kodu — ` +
      `wszystko od tej linii do konca pliku nie zostalo przetworzone`,
    );
  }

  // Parse entries respecting fence mask
  for (let i = 0; i < lines.length; i++) {
    if (inFenceLines[i]) continue;

    const h = lines[i].match(HEADING);
    if (!h) continue;

    // Find next heading not in a fence
    let j = i + 1;
    while (j < lines.length) {
      if (!inFenceLines[j] && HEADING.test(lines[j])) break;
      j++;
    }

    const m = h[1].match(DEC_HEADING);
    if (!m) {
      errors.push(`${i + 1}: nagłówek "## ${h[1]}" nie jest poprawnym wpisem DEC`);
      i = j - 1;
      continue;
    }

    const { raw, errors: fieldErrors } = parseFields(
      lines.slice(i + 1, j), i + 1, inFenceLines.slice(i + 1, j),
    );
    errors.push(...fieldErrors);

    let hasScopeError = false;
    if (raw.Scope && !SCOPES.includes(raw.Scope)) {
      errors.push(`${i + 1}: niedozwolona wartość Scope "${raw.Scope}" (dozwolone: ${SCOPES.join(', ')})`);
      hasScopeError = true;
    }

    if (fieldErrors.length === 0 && !hasScopeError) {
      const dec = {
        id: normalizeId(m[1]),
        num: Number(m[1]),
        date: m[2],
        line: i + 1,
        area: raw.Obszar ? raw.Obszar.split(',').map((s) => s.trim()).filter(Boolean) : [],
      };
      for (const name of [...REQUIRED, ...OPTIONAL]) {
        if (name === 'Obszar') continue;
        const key = KEY[name];
        let value = raw[name] ?? null;
        if ((name === 'Odwraca' || name === 'Zmienia') && value) {
          const n = value.match(/DEC-(\d+)/);
          value = n ? normalizeId(n[1]) : value;
        }
        dec[key] = value;
      }
      decs.push(dec);
    }

    i = j - 1;
  }

  return { decs, errors };
}

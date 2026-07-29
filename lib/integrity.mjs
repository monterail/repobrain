import { buildFenceMask } from './fences.mjs';

const PLACEHOLDERS = ['[data]', '[uzupełnij]', '[TBD]', '[verify]', 'TODO'];

export function checkIntegrity({ decs, rawText, clientNames, fileExists }) {
  const errors = [];

  // Lista nazw, nie wyrazenie regularne. Wejscie pochodzi z CLI, a RegExp
  // przyjmuje od uzytkownika zarowno bledy skladni (wyjatek — lamie kontrakt
  // "nie rzucamy"), jak i wzorce o katastrofalnym backtrackingu (zawieszenie
  // procesu CI). Dopasowanie po podciagu pokrywa realny przypadek — wskazanie
  // klienta po nazwisku — a obie podatnosci znikaja konstrukcyjnie.
  //
  // KOMPROMIS: Substring matching jest luzniejsze niz regex matching.
  // Nazwa 'Jo' trafi w 'Jozef', 'Johanna', i 'Major'. Kierunek bledu jest
  // bezpieczny (fałszywy ALARM — wymagamy Zrodla gdzie nie trzeba — jest lepszy
  // niz fałszywy BRAK — przeoczyliśmy decyzję klienta). Test
  // 'dopasowanie po podciagu jest celowo luzne' chroni to zachowanie przed
  // niechcianym refaktorem.
  const names = (clientNames ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const d of decs) {
    if (d.source && !fileExists(d.source)) {
      errors.push(`${d.line}: ${d.id} — Źródło wskazuje na nieistniejący plik ${d.source}`);
    }
    if (names.length) {
      const decidedBy = String(d.decidedBy ?? '').toLowerCase();
      if (names.some((n) => decidedBy.includes(n)) && !d.source) {
        errors.push(`${d.line}: ${d.id} — decyzja klienta wymaga pola Źródło`);
      }
    }
  }

  // Sprawdzanie placeholderów z asymetrycznym traktowaniem ogrodzeń:
  // Preambuła (przed pierwszym rzeczywistym wpisem DEC) - dokumentacja formatu, ogrodzenia się liczy
  // Wpisy DEC (od pierwszego wpisu w dół) - wpisy są kontrolowane bezwarunkowo
  const lines = rawText.split('\n');
  const { mask: inFenceLines } = buildFenceMask(lines);

  // Znajdź pozycję pierwszego rzeczywistego wpisu DEC (## DEC-###)
  // Ignoruj nagłówki w ogrodzeniach — to przykłady, nie rzeczywiste wpisy
  const firstHeadingIdx = lines.findIndex((line, idx) =>
    /^## DEC-\d+/.test(line) && !inFenceLines[idx]
  );
  const preambleEndIdx = firstHeadingIdx >= 0 ? firstHeadingIdx : lines.length;

  lines.forEach((line, idx) => {
    // W preambule (dokumentacja formatu) ogrodzenia są ignorowane
    if (idx < preambleEndIdx && inFenceLines[idx]) {
      return; // Pomijamy linie w ogrodzeniach wewnątrz preambuly
    }
    // Od pierwszego wpisu DEC w dół - placeholdery sprawdzane zawsze,
    // także wewnątrz ogrodzeń. Blok kodu nie może być furtką do
    // niekompletnego wpisu. Koszt: cytat zawierający TODO dostaje alarm.
    // Obejście: przeformułować cytat.

    for (const p of PLACEHOLDERS) {
      if (line.includes(p)) {
        errors.push(`${idx + 1}: niewypełniony placeholder ${p}`);
      }
    }
  });

  return errors;
}

/**
 * Buduje maskę linii wewnątrz ogrodzeń bloku kodu.
 * Obsługuje zarówno backticki (`) jak i tyldy (~) — 3+ znaków.
 *
 * @param {string[]} lines - tablica linii tekstu
 * @returns {{mask: boolean[], unclosedLine: number}}
 *   mask[i] = true jeśli i-ta linia jest wewnątrz ogrodzenia
 *   unclosedLine = numer linii (0-based) gdzie zaczyna się niezamknięte ogrodzenie, lub -1
 */
export function buildFenceMask(lines) {
  const mask = new Array(lines.length).fill(false);
  let inFence = false;
  let unclosedLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (/^(`{3,}|~{3,})/.test(lines[i])) {
      if (!inFence) {
        unclosedLine = i;
      }
      // Linia ogrodzenia (``` lub ~~~) jest zawsze częścią bloku,
      // zarówno otwierająca jak i zamykająca
      mask[i] = true;
      inFence = !inFence;
    } else {
      mask[i] = inFence;
    }
  }

  // Jeśli wciąż w ogrodzeniu, błąd niezamkniętego
  if (inFence) {
    // unclosedLine już ustawiony, zwracamy go
  } else {
    unclosedLine = -1;
  }

  return { mask, unclosedLine };
}

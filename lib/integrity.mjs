import { buildFenceMask } from './fences.mjs';

const PLACEHOLDERS = ['[date]', '[fill in]', '[TBD]', '[verify]', 'TODO'];

export function checkIntegrity({ decs, rawText, clientNames, fileExists }) {
  const errors = [];

  // A list of names, not a regular expression. The input comes from the CLI,
  // and RegExp accepts from the user both syntax errors (an exception — which
  // breaks the "we never throw" contract) and patterns with catastrophic
  // backtracking (a hung CI process). Substring matching covers the real case —
  // naming the client — and both weaknesses disappear by construction.
  //
  // TRADE-OFF: substring matching is looser than regex matching. The name 'Jo'
  // hits 'Joseph', 'Johanna' and 'Major'. The direction of the error is safe (a
  // false ALARM — demanding Source where it is not needed — beats a false MISS —
  // overlooking a client decision). The test 'substring matching is
  // deliberately loose' protects this behaviour from an unwanted refactor.
  const names = (clientNames ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const d of decs) {
    if (d.source && !fileExists(d.source)) {
      errors.push(`${d.line}: ${d.id} — Source points at a missing file ${d.source}`);
    }
    if (names.length) {
      const decidedBy = String(d.decidedBy ?? '').toLowerCase();
      if (names.some((n) => decidedBy.includes(n)) && !d.source) {
        errors.push(`${d.line}: ${d.id} — a client decision requires the Source field`);
      }
    }
  }

  // Placeholder checking treats fences asymmetrically:
  // Preamble (before the first real DEC entry) — format documentation, fences count
  // DEC entries (from the first entry down) — entries are checked unconditionally
  const lines = rawText.split('\n');
  const { mask: inFenceLines } = buildFenceMask(lines);

  // Find the position of the first real DEC entry (## DEC-###).
  // Ignore headings inside fences — those are examples, not real entries.
  const firstHeadingIdx = lines.findIndex((line, idx) =>
    /^## DEC-\d+/.test(line) && !inFenceLines[idx]
  );
  const preambleEndIdx = firstHeadingIdx >= 0 ? firstHeadingIdx : lines.length;

  lines.forEach((line, idx) => {
    // Inside the preamble (format documentation) fences are ignored
    if (idx < preambleEndIdx && inFenceLines[idx]) {
      return; // Skip lines inside fences within the preamble
    }
    // From the first DEC entry down, placeholders are always checked, including
    // inside fences. A code block must not become a back door for an incomplete
    // entry. Cost: a quote containing TODO raises an alarm.
    // Workaround: rephrase the quote.

    for (const p of PLACEHOLDERS) {
      if (line.includes(p)) {
        errors.push(`${idx + 1}: unfilled placeholder ${p}`);
      }
    }
  });

  return errors;
}

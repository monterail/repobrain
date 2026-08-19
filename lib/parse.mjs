import { buildFenceMask } from './fences.mjs';

const HEADING = /^##\s+(.+?)\s*$/;
const DEC_HEADING = /^DEC-(\d+)\s*[-–—]\s*(\d{4}-\d{2}-\d{2})$/;
const FIELD = /^\*\*([^:*]+):\*\*\s*(.*)$/;

const REQUIRED = ['Topic', 'Context', 'Decision', 'Consequences', 'Decided by'];
const OPTIONAL = ['Reverses', 'Changes', 'Area', 'Scope', 'Source'];
const SCOPES = ['in scope', 'change request', 'needs estimate'];

const KEY = {
  Topic: 'topic', Context: 'context', Decision: 'decision',
  Consequences: 'consequences', 'Decided by': 'decidedBy',
  Reverses: 'reverses', Changes: 'changes', Area: 'area',
  Scope: 'scope', Source: 'source',
};

const normalizeId = (n) => `DEC-${String(n).padStart(3, '0')}`;

function parseFields(blockLines, headingLine, fenceMask = []) {
  const raw = {};
  const errors = [];
  let current = null;
  for (let idx = 0; idx < blockLines.length; idx++) {
    const line = blockLines[idx];
    if (fenceMask[idx]) {
      // A line inside a fenced code block is never a field nor a field
      // continuation — otherwise a documentation example would fabricate fields
      // (and Reverses/Changes relations) on a real entry. We reset `current` so
      // prose after the closing fence does not glue itself onto the field that
      // preceded the block.
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
    if (!raw[name]) errors.push(`${headingLine}: missing required field ${name}`);
  }
  return { raw, errors };
}

export function parseDecisions(text) {
  const lines = text.split('\n');
  const decs = [];
  const errors = [];

  // Build fence mask. The mask here covers the whole file (not just the
  // preamble) — integrity.mjs masks fences only inside the preamble, on
  // purpose: there fences are format documentation, while from the first DEC
  // entry onwards placeholders must apply inside quotes too.
  const { mask: inFenceLines, unclosedLine } = buildFenceMask(lines);

  // Report unclosed fence with context about impact on parsing
  if (unclosedLine >= 0) {
    errors.push(
      `${unclosedLine + 1}: unclosed code fence — ` +
      'everything from this line to the end of the file was not parsed',
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
      errors.push(`${i + 1}: heading "## ${h[1]}" is not a valid DEC entry`);
      i = j - 1;
      continue;
    }

    const { raw, errors: fieldErrors } = parseFields(
      lines.slice(i + 1, j), i + 1, inFenceLines.slice(i + 1, j),
    );
    errors.push(...fieldErrors);

    let hasScopeError = false;
    if (raw.Scope && !SCOPES.includes(raw.Scope)) {
      errors.push(`${i + 1}: invalid Scope value "${raw.Scope}" (allowed: ${SCOPES.join(', ')})`);
      hasScopeError = true;
    }

    if (fieldErrors.length === 0 && !hasScopeError) {
      const dec = {
        id: normalizeId(m[1]),
        num: Number(m[1]),
        date: m[2],
        line: i + 1,
        area: raw.Area ? raw.Area.split(',').map((s) => s.trim()).filter(Boolean) : [],
      };
      for (const name of [...REQUIRED, ...OPTIONAL]) {
        if (name === 'Area') continue;
        const key = KEY[name];
        let value = raw[name] ?? null;
        if ((name === 'Reverses' || name === 'Changes') && value) {
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

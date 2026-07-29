import { posix as pathPosix } from 'node:path';
import { parseDecisions } from './parse.mjs';
import { deriveStatus } from './status.mjs';
import { renderBlock, spliceBlock, OPEN_MARKER, CLOSE_MARKER } from './render.mjs';
import { checkIntegrity } from './integrity.mjs';

const DECISIONS_PATH = 'docs/DECISIONS.md';

export function gateIntegrity({ decisionsText, clientNames, fileExists }) {
  const { decs, errors: parseErrors } = parseDecisions(decisionsText);
  const { errors: statusErrors } = deriveStatus(decs);
  const integrityErrors = checkIntegrity({
    decs, rawText: decisionsText, clientNames, fileExists,
  });
  return [...parseErrors, ...statusErrors, ...integrityErrors];
}

export function gateIndexFresh({ decisionsText, claudeMdText }) {
  const { decs } = parseDecisions(decisionsText);
  const { active, history, errors } = deriveStatus(decs);

  // Przy bledach relacji indeks nie da sie sensownie porownac — zglasza je
  // bramka integrity. Milczymy, zeby nie dokladac myllacego "indeks nieaktualny".
  if (errors.length) return [];

  const expected = renderBlock({ active, history });

  let updated;
  try {
    updated = spliceBlock(claudeMdText, expected);
  } catch (err) {
    return [err.message];
  }

  if (updated !== claudeMdText) {
    return ['Blok WYGENEROWANE:decyzje w CLAUDE.md jest nieaktualny — uruchom `npx … index` i zacommituj wynik.'];
  }
  return [];
}

// Minimalny matcher glob: ** przekracza separatory, * nie.
// Skanujemy znak po znaku zamiast lancucha .replace() z sentinelami —
// sentinel zawsze da sie wpisac w dane wejsciowe i wtedy translacja klamie.
const SPECIAL = new Set(['.', '+', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\', '?']);

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c !== '*') {
      re += SPECIAL.has(c) ? `\\${c}` : c;
      continue;
    }
    if (glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else { re += '.*'; }
    } else {
      re += '[^/]*';
    }
  }
  return new RegExp(`^${re}$`);
}

export function gateDecisionRequired({ changedFiles, paths, labels }) {
  if (labels.includes('no-decision')) return [];

  // Normalizuj ścieżki za pomocą path.posix.normalize: zmienia ./ i ././ na główną ścieżkę,
  // zamyka / // na pojedynczy /. Bramka przyjmuje ścieżki względne od korzenia repo.
  const normalized = changedFiles.map((f) => {
    const n = pathPosix.normalize(f);
    return n === '.' ? f : n;
  });

  if (normalized.includes(DECISIONS_PATH)) return [];

  const matchers = paths.map(globToRegExp);
  const hits = normalized.filter((f) => matchers.some((re) => re.test(f)));
  if (hits.length === 0) return [];

  return [
    `PR zmienia ścieżki decyzyjne (${hits.join(', ')}), ale nie rusza ${DECISIONS_PATH}. ` +
    'Dodaj wpis DEC albo oznacz PR etykietą `no-decision`.',
  ];
}

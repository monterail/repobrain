import { posix as pathPosix } from 'node:path';
import { parseDecisions } from './parse.mjs';
import { deriveStatus } from './status.mjs';
import { renderBlock, spliceBlock } from './render.mjs';
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

  // With relation errors the index cannot be compared meaningfully — the
  // integrity gate reports them. We stay silent so as not to pile on a
  // misleading "index is stale".
  if (errors.length) return [];

  const expected = renderBlock({ active, history });

  let updated;
  try {
    updated = spliceBlock(claudeMdText, expected);
  } catch (err) {
    return [err.message];
  }

  if (updated !== claudeMdText) {
    return ['The GENERATED:decisions block in CLAUDE.md is stale — run `node <kit>/bin/knowledge.mjs index` and commit the result.'];
  }
  return [];
}

// Minimal glob matcher: ** crosses separators, * does not.
// We scan character by character instead of chaining .replace() with sentinels —
// a sentinel can always be typed into the input data, and then the translation lies.
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

  // Normalise paths with path.posix.normalize: it collapses ./ and ././ to the
  // bare path and // to a single /. The gate expects paths relative to the repo root.
  const normalized = changedFiles.map((f) => {
    const n = pathPosix.normalize(f);
    return n === '.' ? f : n;
  });

  if (normalized.includes(DECISIONS_PATH)) return [];

  const matchers = paths.map(globToRegExp);
  const hits = normalized.filter((f) => matchers.some((re) => re.test(f)));
  if (hits.length === 0) return [];

  return [
    `The PR touches decision paths (${hits.join(', ')}) but leaves ${DECISIONS_PATH} untouched. ` +
    'Add a DEC entry or label the PR `no-decision`.',
  ];
}

export const OPEN_MARKER = '<!-- GENERATED:decisions — do not edit. Run: node <kit>/bin/knowledge.mjs index -->';
export const CLOSE_MARKER = '<!-- /GENERATED:decisions -->';

const cell = (s) => {
  let result = String(s ?? '');
  // Escape pipes
  result = result.replace(/\|/g, '\\|');
  // Escape closing marker pattern to prevent false regex matches
  // Use HTML entity for the slash so /GENERATED:decisions doesn't match in regex
  result = result.replace(/<!-- \/GENERATED:decisions -->/g, '&lt;!-- &#47;GENERATED:decisions --&gt;');
  // Escape remaining --> sequences
  result = result.replace(/-->/g, '--&gt;');
  return result;
};

export function renderBlock({ active, history }) {
  const out = [];

  if (active.length === 0) {
    out.push('_No active decisions._');
  } else {
    out.push('| DEC | Date | Area | Topic |');
    out.push('|-----|------|------|-------|');
    for (const { dec, changedBy } of active) {
      const suffix = changedBy.length ? ` *(changed by ${changedBy.join(', ')})*` : '';
      out.push(`| ${dec.id} | ${dec.date} | ${cell(dec.area.join(', '))} | ${cell(dec.topic)}${suffix} |`);
    }
  }

  if (history.length > 0) {
    out.push('');
    out.push('**Reversed (history):**');
    out.push('');
    for (const { dec, reversedBy } of history) {
      out.push(`- ${dec.id} (${dec.date}) — reversed by ${reversedBy}`);
    }
  }

  return out.join('\n');
}

export function spliceBlock(claudeMd, block) {
  const start = claudeMd.indexOf(OPEN_MARKER);
  const end = start === -1 ? -1 : claudeMd.indexOf(CLOSE_MARKER, start + OPEN_MARKER.length);

  if (start === -1 && claudeMd.indexOf(CLOSE_MARKER) === -1) {
    throw new Error(
      'No GENERATED:decisions markers in CLAUDE.md. Run `repobrain init` to add them. ' +
      'The generator never appends the block at the end of the file.',
    );
  }
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Broken GENERATED:decisions marker pair in CLAUDE.md — fix it manually.');
  }

  // Detect multiple marker pairs
  const secondOpen = claudeMd.indexOf(OPEN_MARKER, start + OPEN_MARKER.length);
  if (secondOpen !== -1) {
    throw new Error('The document contains ambiguous GENERATED:decisions markers — fix it manually.');
  }

  const before = claudeMd.slice(0, start + OPEN_MARKER.length);
  const after = claudeMd.slice(end);
  return `${before}\n${block}\n${after}`;
}

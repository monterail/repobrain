export const OPEN_MARKER = '<!-- WYGENEROWANE:decyzje — nie edytuj. Uruchom: npx … index -->';
export const CLOSE_MARKER = '<!-- /WYGENEROWANE:decyzje -->';

const cell = (s) => {
  let result = String(s ?? '');
  // Escape pipes
  result = result.replace(/\|/g, '\\|');
  // Escape closing marker pattern to prevent false regex matches
  // Use HTML entity for the slash so /WYGENEROWANE:decyzje doesn't match in regex
  result = result.replace(/<!-- \/WYGENEROWANE:decyzje -->/g, '&lt;!-- &#47;WYGENEROWANE:decyzje --&gt;');
  // Escape remaining --> sequences
  result = result.replace(/-->/g, '--&gt;');
  return result;
};

export function renderBlock({ active, history }) {
  const out = [];

  if (active.length === 0) {
    out.push('_Brak aktywnych decyzji._');
  } else {
    out.push('| DEC | Data | Obszar | Temat |');
    out.push('|-----|------|--------|-------|');
    for (const { dec, changedBy } of active) {
      const suffix = changedBy.length ? ` *(zmienione przez ${changedBy.join(', ')})*` : '';
      out.push(`| ${dec.id} | ${dec.date} | ${cell(dec.area.join(', '))} | ${cell(dec.topic)}${suffix} |`);
    }
  }

  if (history.length > 0) {
    out.push('');
    out.push('**Odwrócone (historia):**');
    out.push('');
    for (const { dec, reversedBy } of history) {
      out.push(`- ${dec.id} (${dec.date}) — odwrócony przez ${reversedBy}`);
    }
  }

  return out.join('\n');
}

export function spliceBlock(claudeMd, block) {
  const start = claudeMd.indexOf(OPEN_MARKER);
  const end = start === -1 ? -1 : claudeMd.indexOf(CLOSE_MARKER, start + OPEN_MARKER.length);

  if (start === -1 && claudeMd.indexOf(CLOSE_MARKER) === -1) {
    throw new Error(
      'Brak znaczników WYGENEROWANE:decyzje w CLAUDE.md. Uruchom `repobrain init`, ' +
      'żeby je dodać. Generator nigdy nie dopisuje bloku na końcu pliku.',
    );
  }
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Uszkodzona para znaczników WYGENEROWANE:decyzje w CLAUDE.md — napraw ręcznie.');
  }

  // Detect multiple marker pairs
  const secondOpen = claudeMd.indexOf(OPEN_MARKER, start + OPEN_MARKER.length);
  if (secondOpen !== -1) {
    throw new Error('Dokument zawiera niejednoznaczne znaczniki WYGENEROWANE:decyzje — napraw ręcznie.');
  }

  const before = claudeMd.slice(0, start + OPEN_MARKER.length);
  const after = claudeMd.slice(end);
  return `${before}\n${block}\n${after}`;
}

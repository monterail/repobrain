const FILES = [
  { path: 'docs/DECISIONS.md', template: 'DECISIONS.md' },
  { path: '.github/workflows/knowledge.yml', template: 'knowledge.yml' },
];

export function planInit({ existing }) {
  const has = new Set(existing);
  const create = [];
  const skip = [];

  for (const f of FILES) {
    if (has.has(f.path)) skip.push(f.path);
    else create.push(f);
  }

  const claudeExists = has.has('CLAUDE.md');
  if (!claudeExists) create.push({ path: 'CLAUDE.md', template: 'CLAUDE-section.md' });

  return { create, skip, appendToClaudeMd: claudeExists };
}

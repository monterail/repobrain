/**
 * Builds a mask of lines that sit inside fenced code blocks.
 * Handles both backticks (`) and tildes (~) — 3+ characters.
 *
 * @param {string[]} lines - array of text lines
 * @returns {{mask: boolean[], unclosedLine: number}}
 *   mask[i] = true if line i is inside a fence
 *   unclosedLine = 0-based line number where an unclosed fence starts, or -1
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
      // The fence line itself (``` or ~~~) is always part of the block,
      // both the opening and the closing one.
      mask[i] = true;
      inFence = !inFence;
    } else {
      mask[i] = inFence;
    }
  }

  // Still inside a fence means it was never closed.
  if (inFence) {
    // unclosedLine is already set, return it as is
  } else {
    unclosedLine = -1;
  }

  return { mask, unclosedLine };
}

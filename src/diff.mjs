/**
 * What changed between two versions of a story, drawn as text.
 *
 * Paragraphs are matched first; a paragraph that was rewritten (one went
 * out where another came in) is then compared word by word, so a fixed
 * date shows as one struck word and one new one rather than a whole
 * paragraph swapped. Long stories fall back to whole paragraphs, which
 * keeps a build quick whatever the archive holds.
 */

import { escapeHtml, plainText } from './sanitize.mjs';

const BLOCK_END = /<\/(p|div|li|h[1-6]|blockquote|pre|figcaption|tr)>|<br\s*\/?>/gi;

/** A body as its non-empty paragraphs, in plain text. */
export function paragraphsOf(html) {
  return String(html ?? '')
    .replace(BLOCK_END, '\n')
    .split('\n')
    .map((block) => plainText(block))
    .filter(Boolean);
}

/** Past this many cells, sequences are compared as wholes. */
const CELL_LIMIT = 400_000;

/**
 * The edit script from `a` to `b`: a list of ['same' | 'out' | 'in', item].
 * Longest common subsequence, walked back from the end.
 */
export function editScript(a, b) {
  if (a.length * b.length > CELL_LIMIT) {
    return [...a.map((x) => ['out', x]), ...b.map((x) => ['in', x])];
  }
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j] ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const script = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      script.push(['same', a[i]]);
      i++;
      j++;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      script.push(['out', a[i++]]);
    } else {
      script.push(['in', b[j++]]);
    }
  }
  while (i < a.length) script.push(['out', a[i++]]);
  while (j < b.length) script.push(['in', b[j++]]);
  return script;
}

/** Two versions of one paragraph, word by word, as HTML with <del> and <ins>. */
export function wordDiffHtml(before, after) {
  const tokens = (text) => text.split(/(\s+)/).filter((t) => t.length);
  const parts = [];
  for (const [kind, token] of editScript(tokens(before), tokens(after))) {
    const text = escapeHtml(token);
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ kind, text });
  }
  return parts
    .map(({ kind, text }) => (kind === 'same' ? text : kind === 'out' ? `<del>${text}</del>` : `<ins>${text}</ins>`))
    .join('');
}

/**
 * Blocks to draw for a version, against the one before it:
 * { kind: 'same' | 'added' | 'removed' | 'changed', html }.
 */
export function changeBlocks(beforeHtml, afterHtml) {
  const script = editScript(paragraphsOf(beforeHtml), paragraphsOf(afterHtml));
  const blocks = [];
  for (let k = 0; k < script.length; k++) {
    const [kind, text] = script[k];
    if (kind === 'same') {
      blocks.push({ kind: 'same', html: escapeHtml(text) });
      continue;
    }
    // A run of paragraphs out followed by a run in: pair them up as rewrites.
    const outs = [];
    const ins = [];
    while (k < script.length && script[k][0] === 'out') outs.push(script[k++][1]);
    while (k < script.length && script[k][0] === 'in') ins.push(script[k++][1]);
    k--;
    const pairs = Math.min(outs.length, ins.length);
    for (let p = 0; p < pairs; p++) blocks.push({ kind: 'changed', html: wordDiffHtml(outs[p], ins[p]) });
    for (const extra of outs.slice(pairs)) blocks.push({ kind: 'removed', html: escapeHtml(extra) });
    for (const extra of ins.slice(pairs)) blocks.push({ kind: 'added', html: escapeHtml(extra) });
  }
  return blocks;
}

/** "2 paragraphs added, 1 changed" — or that nothing in the words changed. */
export function changeSummary(blocks) {
  const count = (kind) => blocks.filter((b) => b.kind === kind).length;
  const words = (n, what) => `${n} paragraph${n === 1 ? '' : 's'} ${what}`;
  const parts = [];
  if (count('changed')) parts.push(words(count('changed'), 'changed'));
  if (count('added')) parts.push(words(count('added'), 'added'));
  if (count('removed')) parts.push(words(count('removed'), 'removed'));
  return parts.length ? parts.join(', ') : 'No change to the words';
}

/**
 * Check a built site keeps its promises before it goes anywhere:
 * no page runs a script, no page loads anything from another address, and
 * no page carries an inline style or event handler. CI runs this on every
 * pull request and the deploy runs it again on what it is about to upload.
 *
 *   node scripts/check-pages.mjs dist
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function htmlFiles(dir) {
  const found = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) found.push(...(await htmlFiles(full)));
    else if (item.name.endsWith('.html')) found.push(full);
  }
  return found;
}

/** Everything wrong with one page, as sentences. */
export function problemsIn(html) {
  const problems = [];
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    if (!/\btype\s*=\s*["']application\/ld\+json["']/i.test(match[1])) {
      problems.push('runs a script');
    }
  }
  if (/\son[a-z]+\s*=/i.test(html.replace(/<script[\s\S]*?<\/script>/gi, ''))) problems.push('has an event handler');
  if (/\sstyle\s*=/i.test(html)) problems.push('has an inline style');
  if (/<style\b/i.test(html)) problems.push('has a style block');
  if (/<(iframe|object|embed|frame|base|applet)\b/i.test(html)) problems.push('embeds another page');
  if (/<meta[^>]+http-equiv\s*=\s*["']?refresh/i.test(html)) problems.push('redirects itself');
  for (const match of html.matchAll(/<(img|link|source|video|audio|input)\b[^>]*\s(?:src|href|srcset)\s*=\s*["']([^"']+)["']/gi)) {
    const [, tag, url] = match;
    if (tag.toLowerCase() === 'link' && !/rel\s*=\s*["'](stylesheet|icon|apple-touch-icon|preload)["']/i.test(match[0])) continue;
    if (/^(https?:)?\/\//i.test(url) || /^(javascript|data):/i.test(url)) {
      problems.push(`loads ${url} from elsewhere`);
    }
  }
  if (!/<meta http-equiv="Content-Security-Policy"/.test(html)) problems.push('has no page policy');
  return problems;
}

export async function checkSite(dir) {
  const failures = [];
  for (const file of await htmlFiles(dir)) {
    const problems = problemsIn(await readFile(file, 'utf8'));
    if (problems.length) failures.push(`${path.relative(dir, file)}: ${[...new Set(problems)].join('; ')}`);
  }
  return failures;
}

/* node:coverage disable */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(process.argv[2] ?? 'dist');
  const failures = await checkSite(dir);
  if (failures.length) {
    console.error(`These pages break the site's rules:\n${failures.map((f) => `  ${f}`).join('\n')}`);
    process.exit(1);
  }
  console.log('Every page: no scripts, nothing loaded from elsewhere.');
}
/* node:coverage enable */

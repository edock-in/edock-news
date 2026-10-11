/**
 * Reading the public news archive (edock-in/edock-news-archive).
 *
 * The archive is a chain: one JSON line per change, in monthly files under
 * `chain/`, each holding the SHA-256 of the line before it. A version's
 * words live in their own file, whose hash is on its line, and a copied
 * picture is named by its own hash. `readArchive` checks every one of those
 * links and refuses to go on if any is broken, so the site is never built
 * from an archive that has been tampered with.
 *
 * `storiesFrom` then replays the chain into each story's current state:
 * its versions, whether its author withdrew it, whether Edock hid it.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export const GENESIS_PREV = '0'.repeat(64);

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export class ArchiveError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArchiveError';
  }
}

const KINDS = new Set(['version', 'withdrawn', 'returned', 'hidden', 'unhidden']);
const MONTH_FILE = /^\d{4}-\d{2}\.jsonl$/;
const MEDIA_FILE = /^media\/([0-9a-f]{64})\.(jpg|png|webp|gif|avif)$/;
const STORY_FILE = /^stories\/[A-Za-z0-9-]+\/v\d+\.json$/;

async function readChainLines(dir) {
  let files = [];
  try {
    files = (await readdir(path.join(dir, 'chain'))).filter((f) => MONTH_FILE.test(f)).sort();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const lines = [];
  for (const file of files) {
    const text = await readFile(path.join(dir, 'chain', file), 'utf8');
    for (const raw of text.split('\n')) {
      if (raw.trim()) lines.push({ raw, file: `chain/${file}` });
    }
  }
  return lines;
}

async function readChecked(dir, relative, expectedHash, what) {
  let bytes;
  try {
    bytes = await readFile(path.join(dir, relative));
  } catch {
    throw new ArchiveError(`${what}: ${relative} is missing`);
  }
  if (sha256(bytes) !== expectedHash) {
    throw new ArchiveError(`${what}: ${relative} does not match its hash`);
  }
  return bytes;
}

/**
 * Every entry in the chain, checked. Throws ArchiveError at the first line
 * that is out of order, does not point at the line before it, or names a
 * file that is missing or does not match its hash.
 */
export async function readArchive(dir) {
  const lines = await readChainLines(dir);
  const entries = [];
  let prev = GENESIS_PREV;
  for (let i = 0; i < lines.length; i++) {
    const { raw, file } = lines[i];
    let line;
    try {
      line = JSON.parse(raw);
    } catch {
      throw new ArchiveError(`${file}: line ${i + 1} is not JSON`);
    }
    const where = `${file}, chain line ${i + 1}`;
    if (line.n !== i + 1) throw new ArchiveError(`${where}: numbered ${line.n}`);
    if (line.prev !== prev) throw new ArchiveError(`${where}: does not follow the line before it`);
    if (!KINDS.has(line.kind)) throw new ArchiveError(`${where}: unknown kind "${line.kind}"`);
    if (typeof line.story !== 'string' || typeof line.slug !== 'string') {
      throw new ArchiveError(`${where}: no story`);
    }

    const entry = { ...line, hash: sha256(raw), chainFile: file };
    if (line.kind === 'version') {
      if (!STORY_FILE.test(line.file ?? '')) throw new ArchiveError(`${where}: bad file name`);
      const bytes = await readChecked(dir, line.file, line.sha256, where);
      entry.record = JSON.parse(bytes.toString('utf8'));
      for (const media of line.media ?? []) {
        const match = MEDIA_FILE.exec(media);
        if (!match) throw new ArchiveError(`${where}: bad picture name ${media}`);
        await readChecked(dir, media, match[1], where);
      }
    }
    entries.push(entry);
    prev = entry.hash;
  }
  return { entries, head: prev, count: entries.length };
}

/**
 * Each story's state now, oldest story first. A story is live when it has
 * a version, its author has not withdrawn it and Edock has not hidden it.
 * When one address was used by two stories (a deleted story's address
 * taken again), the live one has it, else the one changed last.
 */
export function storiesFrom(entries) {
  const byId = new Map();
  for (const entry of entries) {
    let story = byId.get(entry.story);
    if (!story) {
      story = { id: entry.story, slug: entry.slug, versions: [], events: [], withdrawn: false, hidden: false };
      byId.set(entry.story, story);
    }
    story.slug = entry.slug;
    story.events.push(entry);
    story.lastChange = entry;
    switch (entry.kind) {
      case 'version':
        story.versions.push(entry);
        story.withdrawn = false;
        break;
      case 'returned':
        story.withdrawn = false;
        break;
      case 'withdrawn':
        story.withdrawn = true;
        break;
      case 'hidden':
        story.hidden = true;
        break;
      case 'unhidden':
        story.hidden = false;
        break;
    }
  }

  const stories = [...byId.values()].filter((s) => s.versions.length > 0);
  for (const story of stories) {
    story.latest = story.versions[story.versions.length - 1].record;
    story.first = story.versions[0].record;
    story.live = !story.withdrawn && !story.hidden;
  }

  const bySlug = new Map();
  for (const story of stories) {
    const held = bySlug.get(story.slug);
    const better =
      !held ||
      (story.live && !held.live) ||
      (story.live === held.live && story.lastChange.n > held.lastChange.n);
    if (better) bySlug.set(story.slug, story);
  }
  return [...bySlug.values()].sort((a, b) => a.versions[0].n - b.versions[0].n);
}

/**
 * Write an archive the way the Edock backend does (edock-backend
 * `services/institute/newsArchiveFormat.ts`): same record shape, same chain
 * line key order, same hashes. Tests and the sample archive are made with it.
 */

import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENESIS_PREV, sha256 } from '../../src/archive.mjs';

export function versionRecord(story, v, media = {}) {
  return {
    schema: 1,
    story: story.id,
    slug: story.slug,
    version: v.version,
    title: v.title,
    subtitle: v.subtitle ?? null,
    content_html: v.content_html,
    cover_image: v.cover_image ?? null,
    tags: v.tags ?? [],
    word_count: v.word_count ?? 120,
    author: story.author,
    first_published_at: story.first_published_at,
    saved_at: v.saved_at,
    links: {
      news: `https://news.edock.io/p/${story.slug}/`,
      blog: `https://blogs.edock.io/p/${story.slug}`,
    },
    media,
    licence: 'CC-BY-4.0',
  };
}

export function chainLine(fields) {
  const line = { n: fields.n, at: fields.at, kind: fields.kind, story: fields.story, slug: fields.slug };
  if (fields.version !== undefined) line.version = fields.version;
  if (fields.file !== undefined) line.file = fields.file;
  if (fields.sha256 !== undefined) line.sha256 = fields.sha256;
  if (fields.media !== undefined) line.media = fields.media;
  if (fields.note) line.note = fields.note;
  line.entry = fields.entry;
  line.prev = fields.prev;
  return JSON.stringify(line);
}

/**
 * Write `events` (in order) into `dir`. A version event:
 * { kind: 'version', story, version: {...}, pictures?: { url: Buffer } }.
 * Any other: { kind, story, at, note? }.
 */
export async function makeArchive(dir, events) {
  const months = new Map();
  let prev = GENESIS_PREV;
  let n = 0;
  for (const event of events) {
    n += 1;
    const at = event.kind === 'version' ? event.version.saved_at : event.at;
    const fields = { n, at, kind: event.kind, story: event.story.id, slug: event.story.slug, entry: `e${n}`, prev };
    if (event.kind === 'version') {
      const media = {};
      const files = [];
      for (const [url, bytes] of Object.entries(event.pictures ?? {})) {
        const file = `media/${sha256(bytes)}.jpg`;
        media[url] = file;
        files.push(file);
        await mkdir(path.join(dir, 'media'), { recursive: true });
        await writeFile(path.join(dir, file), bytes);
      }
      const text = `${JSON.stringify(versionRecord(event.story, event.version, media), null, 2)}\n`;
      const file = `stories/${event.story.id}/v${event.version.version}.json`;
      await mkdir(path.join(dir, path.dirname(file)), { recursive: true });
      await writeFile(path.join(dir, file), text);
      Object.assign(fields, { version: event.version.version, file, sha256: sha256(text), media: [...new Set(files)] });
    } else if (event.note) {
      fields.note = event.note;
    }
    const line = chainLine(fields);
    const month = at.slice(0, 7);
    months.set(month, `${months.get(month) ?? ''}${line}\n`);
    prev = sha256(line);
  }
  await mkdir(path.join(dir, 'chain'), { recursive: true });
  for (const [month, text] of months) await writeFile(path.join(dir, 'chain', `${month}.jsonl`), text);
  return { head: prev, count: n };
}

export const neha = { name: 'Neha Kapoor', handle: 'neha', verified: true, team: false };
export const ravi = { name: 'Ravi Menon', handle: 'ravi', verified: true, team: true };

/** A small, believable archive: two live stories, one withdrawn, one hidden. */
export function sampleEvents() {
  const jio = { id: 'a1b2c3d4-0000-4000-8000-000000000001', slug: 'jio-ipo-opens-21-october', author: neha, first_published_at: '2026-10-11T04:30:00.000Z' };
  const rbi = { id: 'a1b2c3d4-0000-4000-8000-000000000002', slug: 'rbi-raises-repo-rate-to-5-5', author: ravi, first_published_at: '2026-10-10T06:00:00.000Z' };
  const old = { id: 'a1b2c3d4-0000-4000-8000-000000000003', slug: 'a-story-taken-back', author: neha, first_published_at: '2026-10-09T06:00:00.000Z' };
  const hid = { id: 'a1b2c3d4-0000-4000-8000-000000000004', slug: 'a-story-edock-hid', author: neha, first_published_at: '2026-10-09T07:00:00.000Z' };
  const cover = 'https://d34afe9v4dkxkv.cloudfront.net/blog-media/jio/cover.jpg';
  const picture = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'sample-cover.jpg'));
  return [
    { kind: 'version', story: old, version: { version: 1, title: 'A story taken back', content_html: '<p>Its author took it off News later.</p>', saved_at: '2026-10-09T06:00:00.000Z' } },
    { kind: 'version', story: hid, version: { version: 1, title: 'A story Edock hid', content_html: '<p>It broke a rule.</p>', saved_at: '2026-10-09T07:00:00.000Z' } },
    {
      kind: 'version',
      story: rbi,
      version: {
        version: 1,
        title: 'RBI raises the repo rate to 5.5%',
        subtitle: 'The first rise since February 2023.',
        content_html: '<p>The Reserve Bank of India raised its key lending rate to 5.5% on 7 October.</p><p>Home and car loans are likely to cost more.</p>',
        tags: ['Economy', 'Banking'],
        word_count: 28,
        saved_at: '2026-10-10T06:00:00.000Z',
      },
    },
    { kind: 'withdrawn', story: old, at: '2026-10-10T08:00:00.000Z', note: 'unmarked' },
    { kind: 'hidden', story: hid, at: '2026-10-10T09:00:00.000Z', note: 'It named a private person' },
    {
      kind: 'version',
      story: jio,
      pictures: { [cover]: picture },
      version: {
        version: 1,
        title: 'Jio IPO opens on 21 October',
        subtitle: 'India’s largest share sale yet.',
        content_html: `<p>Jio Platforms will sell shares from 21 to 23 October.</p><p>The price band is ₹1,065 to ₹1,119.</p><div data-embed="youtube" data-embed-id="dQw4w9WgXcQ"></div>`,
        cover_image: cover,
        tags: ['Markets'],
        word_count: 22,
        saved_at: '2026-10-11T04:30:00.000Z',
      },
    },
    {
      kind: 'version',
      story: jio,
      pictures: { [cover]: picture },
      version: {
        version: 2,
        title: 'Jio IPO opens on 21 October',
        subtitle: 'India’s largest share sale yet.',
        content_html: `<p>Jio Platforms will sell shares from 21 to 23 October.</p><p>The price band is ₹1,065 to ₹1,119 a share.</p><p>Shares list on 28 October.</p><div data-embed="youtube" data-embed-id="dQw4w9WgXcQ"></div>`,
        cover_image: cover,
        tags: ['Markets'],
        word_count: 28,
        saved_at: '2026-10-11T06:42:00.000Z',
      },
    },
  ];
}

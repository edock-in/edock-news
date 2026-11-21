import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../src/build.mjs';
import { REEL_HOSTS, fetchReel, gatherReels, placeReels, reelPath, reelProblem } from '../src/reels.mjs';
import { reelFigure } from '../src/render.mjs';
import { checkSite } from '../scripts/check-pages.mjs';
import { makeArchive, neha } from './helpers/archive.mjs';

const fresh = () => mkdtemp(path.join(tmpdir(), 'edock-news-reels-'));
const VIDEO = Buffer.from('a short made-up mp4 file');
const SHA = createHash('sha256').update(VIDEO).digest('hex');
const CDN = 'https://d34afe9v4dkxkv.cloudfront.net/blog-media/reels/p1';
const reel = (over = {}) => ({
  url: `${CDN}/reel.mp4`,
  sha256: SHA,
  bytes: VIDEO.length,
  poster: `${CDN}/poster.jpg`,
  post_url: 'https://www.instagram.com/reel/abc/',
  ...over,
});

/** A stand-in for the CDN: serves `body` for every address it is asked, counting the asks. */
function cdn(body = VIDEO, { status = 200, length } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(status === 200 ? body : null, {
      status,
      headers: { 'content-length': String(length ?? body.length) },
    });
  };
  return { fetchImpl, calls };
}

describe('which reels a record may name', () => {
  it('only a hashed, sized video on Edock’s media CDN', () => {
    assert.equal(reelProblem(reel()), null);
    assert.deepEqual(REEL_HOSTS, ['d34afe9v4dkxkv.cloudfront.net']);
    assert.equal(reelProblem(null), 'no reel');
    assert.equal(reelProblem(reel({ sha256: '../../etc' })), 'no SHA-256');
    assert.equal(reelProblem(reel({ bytes: 0 })), 'a bad size');
    assert.equal(reelProblem(reel({ bytes: 1.5 })), 'a bad size');
    assert.equal(reelProblem(reel({ bytes: 500 * 1024 * 1024 })), 'a bad size');
    assert.equal(reelProblem(reel({ url: 'not a url' })), 'no address');
    assert.equal(reelProblem(reel({ url: 'https://evil.test/reel.mp4' })), "an address off Edock's media CDN (evil.test)");
    assert.equal(reelProblem(reel({ url: `http://d34afe9v4dkxkv.cloudfront.net/x.mp4` })), "an address off Edock's media CDN (d34afe9v4dkxkv.cloudfront.net)");
    assert.equal(reelProblem(reel({ url: 'https://cdn.test/x.mp4' }), ['cdn.test']), null);
  });

  it('names a copy by its hash', () => {
    assert.equal(reelPath(SHA), `media/reels/${SHA}.mp4`);
  });
});

describe('fetching a reel', () => {
  it('keeps a video whose size and SHA-256 match the record, refusing redirects', async () => {
    const { fetchImpl, calls } = cdn();
    const { bytes, reason } = await fetchReel(reel(), { fetchImpl });
    assert.equal(reason, null);
    assert.deepEqual(bytes, VIDEO);
    assert.equal(calls[0].url, `${CDN}/reel.mp4`);
    assert.equal(calls[0].init.redirect, 'error');
  });

  it('never asks for an address off the CDN', async () => {
    const { fetchImpl, calls } = cdn();
    assert.match((await fetchReel(reel({ url: 'https://evil.test/v.mp4' }), { fetchImpl })).reason, /off Edock/);
    assert.equal(calls.length, 0);
  });

  it('leaves out a video that is missing, the wrong size or not the one recorded', async () => {
    assert.equal((await fetchReel(reel(), cdn(VIDEO, { status: 404 }))).reason, 'HTTP 404');
    assert.match((await fetchReel(reel(), cdn(VIDEO, { length: 3 }))).reason, /^3 bytes, the record says/);
    const other = Buffer.from('a different file, same size!!!').subarray(0, VIDEO.length);
    assert.equal((await fetchReel(reel(), cdn(other))).reason, 'its SHA-256 does not match the record');
    const short = Buffer.from('short');
    assert.match((await fetchReel(reel(), cdn(short, { length: VIDEO.length }))).reason, /^5 bytes, the record says/);
    // A server that sends more than it said stops being read at the record's size.
    const long = Buffer.concat([VIDEO, VIDEO]);
    assert.equal((await fetchReel(reel(), cdn(long, { length: VIDEO.length }))).reason, `more than the ${VIDEO.length} bytes the record says`);
    const empty = async () => new Response(null, { status: 200 });
    assert.match((await fetchReel(reel(), { fetchImpl: empty })).reason, /^0 bytes, the record says/);
    const failing = async () => {
      throw new Error('network down');
    };
    assert.equal((await fetchReel(reel(), { fetchImpl: failing })).reason, 'network down');
    const odd = async () => {
      throw 'odd';
    };
    assert.equal((await fetchReel(reel(), { fetchImpl: odd })).reason, 'odd');
  });

  it('gathers each live story’s reel once, says which it left out, and places them on the site', async () => {
    const dir = await fresh();
    const out = await fresh();
    const { fetchImpl, calls } = cdn();
    const live = (slug, r) => ({ slug, live: true, latest: { reel: r } });
    const { ready, skipped } = await gatherReels(
      [
        live('a', reel()),
        live('b', reel()),
        live('c', reel({ sha256: 'f'.repeat(64) })),
        live('x', reel({ url: 'https://evil.test/v.mp4', sha256: 'd'.repeat(64) })),
        { slug: 'd', live: false, latest: { reel: reel() } },
        live('e', undefined),
      ],
      dir,
      { fetchImpl },
    );
    assert.deepEqual([...ready], [SHA]);
    assert.deepEqual(skipped, ['c: its SHA-256 does not match the record', "x: an address off Edock's media CDN (evil.test)"]);
    assert.equal(calls.length, 2);
    assert.deepEqual(await readdir(dir), [`${SHA}.mp4`]);
    await placeReels(ready, dir, out);
    assert.deepEqual(await readFile(path.join(out, reelPath(SHA))), VIDEO);
  });

  it('keeps a checked copy from an earlier build, and fetches again one that no longer matches', async () => {
    const dir = await fresh();
    await writeFile(path.join(dir, `${SHA}.mp4`), VIDEO);
    const first = cdn();
    assert.deepEqual([...(await gatherReels([{ slug: 'a', live: true, latest: { reel: reel() } }], dir, first)).ready], [SHA]);
    assert.equal(first.calls.length, 0);
    await writeFile(path.join(dir, `${SHA}.mp4`), 'tampered');
    const second = cdn();
    assert.deepEqual([...(await gatherReels([{ slug: 'a', live: true, latest: { reel: reel() } }], dir, second)).ready], [SHA]);
    assert.equal(second.calls.length, 1);
    assert.deepEqual(await readFile(path.join(dir, `${SHA}.mp4`)), VIDEO);
  });
});

describe('the reel on a story page', () => {
  const record = { title: 'A <b>story</b>', cover_image: 'https://cdn/c.jpg', media: { 'https://cdn/c.jpg': 'media/c.jpg', [`${CDN}/poster.jpg`]: 'media/p.jpg' }, reel: reel() };
  const config = (copied = [SHA]) => ({ mediaBase: '/', reels: new Set(copied) });

  it('plays the site’s own copy, with its poster and Instagram link', () => {
    const html = reelFigure(record, config());
    assert.match(html, new RegExp(`<video controls playsinline preload="none" poster="/media/p.jpg" src="/media/reels/${SHA}.mp4" aria-label="Reel: A &lt;b&gt;story&lt;/b&gt;"></video>`));
    assert.match(html, /<a href="https:\/\/www.instagram.com\/reel\/abc\/" rel="noopener">Watch on Instagram<\/a>/);
  });

  it('shows the poster and the link when the video failed its check', () => {
    const html = reelFigure(record, config([]));
    assert.ok(!html.includes('<video'));
    assert.match(html, /<img src="\/media\/p.jpg" alt="" decoding="async">/);
    assert.match(html, /Watch on Instagram/);
  });

  it('falls back to the cover, drops a link that is not Instagram, and is nothing with nothing to show', () => {
    const noPoster = { ...record, reel: reel({ poster: null, post_url: 'https://evil.test/' }) };
    assert.match(reelFigure(noPoster, config()), /poster="\/media\/c.jpg"/);
    assert.ok(!reelFigure(noPoster, config()).includes('evil.test'));
    // No video and no poster: the cover as covers are shown, with the link.
    assert.equal(
      reelFigure({ ...record, reel: reel({ poster: null }) }, config([])),
      '<figure class="cover"><img src="/media/c.jpg" alt="" decoding="async">\n    <figcaption><a href="https://www.instagram.com/reel/abc/" rel="noopener">Watch on Instagram</a></figcaption></figure>',
    );
    const bare = { title: 't', media: {}, reel: reel({ poster: null, post_url: null }) };
    assert.ok(!reelFigure(bare, config()).includes('poster='));
    assert.equal(reelFigure(bare, config([])), null);
    assert.match(reelFigure({ ...bare, reel: reel({ poster: null }) }, config([])), /^<figure class="cover">\n    <figcaption>/);
    assert.equal(reelFigure({ title: 't' }, config()), null);
    assert.equal(reelFigure({ ...bare }, { mediaBase: '/' }), null);
  });
});

describe('building a site with reels', () => {
  const POSTER = Buffer.from('a poster');
  const good = { id: 'c0000000-0000-4000-8000-000000000001', slug: 'a-reel-story', author: neha, first_published_at: '2026-11-21T04:00:00.000Z' };
  const bad = { id: 'c0000000-0000-4000-8000-000000000002', slug: 'a-bad-reel', author: neha, first_published_at: '2026-11-21T05:00:00.000Z' };
  let out;
  let result;
  const page = (relative) => readFile(path.join(out, relative), 'utf8');

  before(async () => {
    const archive = await fresh();
    out = await fresh();
    await makeArchive(archive, [
      { kind: 'version', story: good, pictures: { [`${CDN}/poster.jpg`]: POSTER }, version: { version: 1, title: 'A reel story', content_html: '<p>Watch it.</p>', saved_at: good.first_published_at, reel: reel() } },
      { kind: 'version', story: bad, pictures: { [`${CDN}/poster.jpg`]: POSTER }, version: { version: 1, title: 'A bad reel', content_html: '<p>Its file changed.</p>', saved_at: bad.first_published_at, reel: reel({ sha256: 'e'.repeat(64), url: `${CDN}/other.mp4` }) } },
    ]);
    result = await build({ archive, out }, cdn());
  });

  it('copies the checked video, plays it, and shows only the poster for the one that failed', async () => {
    assert.equal(result.reels, 1);
    assert.deepEqual(result.reelsSkipped, ['a-bad-reel: its SHA-256 does not match the record']);
    assert.deepEqual(await readdir(path.join(out, 'media', 'reels')), [`${SHA}.mp4`]);
    const story = await page('p/a-reel-story/index.html');
    assert.match(story, new RegExp(`<video controls playsinline preload="none" poster="/media/[0-9a-f]{64}.jpg" src="/media/reels/${SHA}.mp4"`));
    const failed = await page('p/a-bad-reel/index.html');
    assert.ok(!failed.includes('<video'));
    assert.match(failed, /<figure class="reel">\n    <img src="\/media\/[0-9a-f]{64}.jpg"/);
    assert.match(failed, /Watch on Instagram/);
  });

  it('keeps every promise, and lets the page play only this site’s media', async () => {
    assert.deepEqual(await checkSite(out), []);
    assert.match(await page('p/a-reel-story/index.html'), /media-src &#39;self&#39;|media-src 'self'/);
  });

  it('takes the reel hosts from the command line', async () => {
    const archive = await fresh();
    const into = await fresh();
    await makeArchive(archive, [
      { kind: 'version', story: good, version: { version: 1, title: 'A reel story', content_html: '<p>Watch it.</p>', saved_at: good.first_published_at, reel: reel() } },
    ]);
    const r = await build({ archive, out: into, 'reel-hosts': ' cdn.test, ' }, cdn());
    assert.deepEqual(r.reelsSkipped, ["a-reel-story: an address off Edock's media CDN (d34afe9v4dkxkv.cloudfront.net)"]);
    // A kept folder: the second build fetches nothing.
    const cache = await fresh();
    const first = cdn();
    await build({ archive, out: into, 'reel-cache': cache }, first);
    const second = cdn();
    const again = await build({ archive, out: into, 'reel-cache': cache }, second);
    assert.equal(first.calls.length, 1);
    assert.equal(second.calls.length, 0);
    assert.equal(again.reels, 1);
  });
});

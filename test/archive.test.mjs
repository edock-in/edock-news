import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ArchiveError, GENESIS_PREV, authorPhotosFrom, readArchive, sha256, storiesFrom } from '../src/archive.mjs';
import { chainLine, makeArchive, neha, sampleEvents } from './helpers/archive.mjs';

const fresh = () => mkdtemp(path.join(tmpdir(), 'edock-news-'));

describe('reading the public record', () => {
  let dir;
  before(async () => {
    dir = await fresh();
    await makeArchive(dir, sampleEvents());
  });

  it('reads every line in order, each one pointing at the one before', async () => {
    const archive = await readArchive(dir);
    assert.equal(archive.count, 7);
    assert.equal(archive.entries[0].prev, GENESIS_PREV);
    for (let i = 1; i < archive.entries.length; i++) {
      assert.equal(archive.entries[i].prev, archive.entries[i - 1].hash);
    }
    assert.equal(archive.head, archive.entries[6].hash);
    assert.equal(archive.entries[0].chainFile, 'chain/2026-10.jsonl');
    assert.equal(archive.entries[6].record.version, 2);
  });

  it('is an empty record when there is no chain yet', async () => {
    const empty = await fresh();
    assert.deepEqual(await readArchive(empty), { entries: [], head: GENESIS_PREV, count: 0 });
  });

  it('ignores files in chain/ that are not month files', async () => {
    const other = await fresh();
    await makeArchive(other, sampleEvents().slice(0, 1));
    await writeFile(path.join(other, 'chain', 'README.md'), 'notes');
    assert.equal((await readArchive(other)).count, 1);
  });

  it('reads across months in order', async () => {
    const other = await fresh();
    const [first, second] = sampleEvents();
    await makeArchive(other, [first, { ...second, version: { ...second.version, saved_at: '2026-11-01T00:00:00.000Z' } }]);
    const archive = await readArchive(other);
    assert.deepEqual(archive.entries.map((e) => e.chainFile), ['chain/2026-10.jsonl', 'chain/2026-11.jsonl']);
  });
});

describe('refusing a broken record', () => {
  const broken = async (mutate) => {
    const dir = await fresh();
    await makeArchive(dir, sampleEvents());
    await mutate(dir);
    return dir;
  };
  const chainFile = (dir) => path.join(dir, 'chain', '2026-10.jsonl');
  const rewriteLine = async (dir, index, change) => {
    const lines = (await readFile(chainFile(dir), 'utf8')).trim().split('\n');
    lines[index] = change(lines[index]);
    await writeFile(chainFile(dir), `${lines.join('\n')}\n`);
  };

  it('when an old line was edited, so the next one no longer points at it', async () => {
    const dir = await broken((d) => rewriteLine(d, 2, (l) => l.replace('"version":1', '"version":1 ')));
    await assert.rejects(readArchive(dir), (e) => e instanceof ArchiveError && /chain line 4: does not follow/.test(e.message));
  });

  it('when a line was deleted', async () => {
    const dir = await broken(async (d) => {
      const lines = (await readFile(chainFile(d), 'utf8')).trim().split('\n');
      lines.splice(3, 1);
      await writeFile(chainFile(d), `${lines.join('\n')}\n`);
    });
    await assert.rejects(readArchive(dir), /chain line 4: numbered 5/);
  });

  it('when a version file was changed after it was sealed', async () => {
    const dir = await broken(async (d) => {
      const file = path.join(d, 'stories', 'a1b2c3d4-0000-4000-8000-000000000001', 'v2.json');
      await writeFile(file, (await readFile(file, 'utf8')).replace('28 October', '29 October'));
    });
    await assert.rejects(readArchive(dir), /does not match its hash/);
  });

  it('when a version file or a picture is missing', async () => {
    let dir = await broken((d) => rm(path.join(d, 'stories', 'a1b2c3d4-0000-4000-8000-000000000002'), { recursive: true }));
    await assert.rejects(readArchive(dir), /is missing/);
    dir = await broken((d) => rm(path.join(d, 'media'), { recursive: true }));
    await assert.rejects(readArchive(dir), /media\/.*is missing/);
  });

  it('when a picture was swapped for another', async () => {
    const dir = await broken(async (d) => {
      const { readdir } = await import('node:fs/promises');
      const [file] = await readdir(path.join(d, 'media'));
      await writeFile(path.join(d, 'media', file), 'other bytes');
    });
    await assert.rejects(readArchive(dir), /does not match its hash/);
  });

  it('when a line is not JSON, has an unknown kind, no story, or a bad file or picture name', async () => {
    const cases = [
      [(l) => l.slice(0, -1), /is not JSON/],
      [(l) => l.replace('"kind":"version"', '"kind":"deleted"'), /unknown kind/],
      [(l) => l.replace(/"story":"[^"]+",/, ''), /no story/],
      [(l) => l.replace(/"file":"[^"]+"/, '"file":"../../etc/passwd"'), /bad file name/],
      [(l) => l.replace(/"media":\[\]/, '"media":["media/x.exe"]'), /bad picture name/],
    ];
    for (const [change, error] of cases) {
      const dir = await broken((d) => rewriteLine(d, 0, change));
      await assert.rejects(readArchive(dir), error);
    }
  });

  it('reports a failure to read the chain folder as itself', async () => {
    const dir = await fresh();
    await writeFile(path.join(dir, 'chain'), 'a file, not a folder');
    await assert.rejects(readArchive(dir), (e) => !(e instanceof ArchiveError));
  });
});

describe('each story now', () => {
  it('replays versions, withdrawals and hides', async () => {
    const dir = await fresh();
    await makeArchive(dir, sampleEvents());
    const stories = storiesFrom((await readArchive(dir)).entries);
    const by = Object.fromEntries(stories.map((s) => [s.slug, s]));
    assert.deepEqual(stories.map((s) => s.slug), [
      'a-story-taken-back',
      'a-story-edock-hid',
      'rbi-raises-repo-rate-to-5-5',
      'jio-ipo-opens-21-october',
    ]);
    assert.equal(by['jio-ipo-opens-21-october'].live, true);
    assert.equal(by['jio-ipo-opens-21-october'].versions.length, 2);
    assert.equal(by['jio-ipo-opens-21-october'].latest.version, 2);
    assert.equal(by['jio-ipo-opens-21-october'].first.version, 1);
    assert.equal(by['a-story-taken-back'].live, false);
    assert.equal(by['a-story-taken-back'].withdrawn, true);
    assert.equal(by['a-story-edock-hid'].hidden, true);
  });

  it('brings a story back when its author returns it or Edock shows it again', () => {
    const story = { id: 's1', slug: 's' };
    const line = (n, kind, extra = {}) => ({ n, kind, story: 's1', slug: 's', ...extra });
    const record = { version: 1 };
    let [s] = storiesFrom([line(1, 'version', { record }), line(2, 'withdrawn'), line(3, 'returned')]);
    assert.equal(s.live, true);
    [s] = storiesFrom([line(1, 'version', { record }), line(2, 'hidden'), line(3, 'unhidden')]);
    assert.equal(s.live, true);
    [s] = storiesFrom([line(1, 'version', { record }), line(2, 'withdrawn'), line(3, 'version', { record: { version: 2 } })]);
    assert.equal(s.live, true);
    assert.equal(s.latest.version, 2);
    assert.equal(story.id, 's1');
  });

  it('leaves out a story the record never held a version of', () => {
    assert.deepEqual(storiesFrom([{ n: 1, kind: 'hidden', story: 'x', slug: 'x' }]), []);
  });

  it('gives a reused address to the live story, else the one changed last', () => {
    const v = (n, story, extra = {}) => ({ n, kind: 'version', story, slug: 'same', record: { version: 1, story }, ...extra });
    let stories = storiesFrom([v(1, 'old'), { n: 2, kind: 'withdrawn', story: 'old', slug: 'same' }, v(3, 'new')]);
    assert.deepEqual(stories.map((s) => s.id), ['new']);
    stories = storiesFrom([v(1, 'a'), v(2, 'b'), { n: 3, kind: 'withdrawn', story: 'b', slug: 'same' }]);
    assert.deepEqual(stories.map((s) => s.id), ['a']);
    stories = storiesFrom([v(1, 'a'), { n: 2, kind: 'hidden', story: 'a', slug: 'same' }, v(3, 'b'), { n: 4, kind: 'hidden', story: 'b', slug: 'same' }]);
    assert.deepEqual(stories.map((s) => s.id), ['b']);
  });
});

describe('each author’s photo', () => {
  const PHOTO = 'https://d34afe9v4dkxkv.cloudfront.net/user-images/neha/thumbs/me.jpg';
  const NEWER = 'https://d34afe9v4dkxkv.cloudfront.net/user-images/neha/thumbs/new.jpg';
  const version = (n, story, image, file, { onLine = true, handle = 'neha' } = {}) => ({
    n,
    kind: 'version',
    story,
    slug: story,
    media: file && onLine ? [file] : [],
    record: {
      version: 1,
      author: { name: 'Neha', handle, ...(image === undefined ? {} : { image }) },
      media: file ? { [image]: file } : {},
    },
  });

  it('takes the copy from the author’s newest live version that has one', () => {
    const stories = storiesFrom([
      version(1, 'old', undefined, null),
      version(2, 'a', PHOTO, 'media/a.jpg'),
      version(3, 'b', NEWER, 'media/b.jpg'),
      version(4, 'c', null, null),
      version(5, 'd', PHOTO, 'media/r.jpg', { handle: 'ravi' }),
    ]);
    const photos = authorPhotosFrom(stories);
    assert.equal(photos.get('neha'), 'media/b.jpg');
    assert.equal(photos.get('ravi'), 'media/r.jpg');
    assert.equal(photos.size, 2);
  });

  it('keeps an older photo when a newer story has the same author and no photo', () => {
    const photos = authorPhotosFrom(
      storiesFrom([version(1, 'b', NEWER, 'media/b.jpg'), version(2, 'a', PHOTO, 'media/a.jpg'), version(3, 'c', null, null)]),
    );
    assert.equal(photos.get('neha'), 'media/a.jpg');
  });

  it('ignores stories taken down and photos the chain line does not vouch for', () => {
    const stories = storiesFrom([
      version(1, 'a', PHOTO, 'media/a.jpg'),
      version(2, 'gone', NEWER, 'media/gone.jpg'),
      { n: 3, kind: 'withdrawn', story: 'gone', slug: 'gone' },
      version(4, 'sly', NEWER, 'media/sly.jpg', { onLine: false }),
    ]);
    assert.equal(authorPhotosFrom(stories).get('neha'), 'media/a.jpg');
    assert.equal(authorPhotosFrom([]).size, 0);
  });
});

describe('the helper writes what the backend writes', () => {
  it('a chain line with the backend’s key order', () => {
    assert.equal(
      chainLine({ n: 1, at: 'T', kind: 'hidden', story: 's', slug: 'x', note: 'why', entry: 'e', prev: 'p' }),
      '{"n":1,"at":"T","kind":"hidden","story":"s","slug":"x","note":"why","entry":"e","prev":"p"}',
    );
  });

  it('hashes the way the chain does', async () => {
    const dir = await fresh();
    await mkdir(dir, { recursive: true });
    const { head } = await makeArchive(dir, [
      { kind: 'withdrawn', story: { id: 's', slug: 'x', author: neha }, at: '2026-10-01T00:00:00.000Z' },
    ]);
    const text = (await readFile(path.join(dir, 'chain', '2026-10.jsonl'), 'utf8')).trim();
    assert.equal(head, sha256(text));
  });
});

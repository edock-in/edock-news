import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build, parseArgs } from '../src/build.mjs';
import { contentSecurityPolicy, dayOf, momentOf, readingMinutes, timeOf } from '../src/render.mjs';
import { checkSite, problemsIn } from '../scripts/check-pages.mjs';
import { makeArchive, sampleEvents } from './helpers/archive.mjs';

const fresh = () => mkdtemp(path.join(tmpdir(), 'edock-news-build-'));
const JIO = 'jio-ipo-opens-21-october';

describe('building the site from the record', () => {
  let archive;
  let out;
  let result;
  const page = (relative) => readFile(path.join(out, relative), 'utf8');

  before(async () => {
    archive = await fresh();
    out = await fresh();
    await makeArchive(archive, sampleEvents());
    result = await build({ archive, out, now: '2026-10-11T12:00:00.000Z' });
  });

  it('writes every page, and copies the pictures of live stories', async () => {
    assert.deepEqual(result, { pages: 19, media: 1, stories: 4, chain: 7 });
    for (const file of ['index.html', 'about/index.html', '404.html', 'report/sent/index.html', `p/${JIO}/v/2/index.html`, 'fonts/oswald-latin.woff2', 'favicon.png']) {
      assert.ok((await stat(path.join(out, file))).isFile(), file);
    }
    assert.equal((await readdir(path.join(out, 'media'))).length, 1);
    assert.equal((await readdir(path.join(out, 'assets'))).filter((f) => /^site\.[0-9a-f]{10}\.css$/.test(f)).length, 1);
  });

  it('keeps every promise: no scripts but Clarity, nothing from elsewhere, a policy on every page', async () => {
    assert.deepEqual(await checkSite(out), []);
  });

  it('puts Clarity on every page, from the site’s own copy of its loader', async () => {
    for (const file of ['index.html', 'about/index.html', `p/${JIO}/index.html`]) {
      assert.ok((await page(file)).includes('<script src="/clarity.js" async></script>'), file);
    }
    const loader = await readFile(path.join(out, 'clarity.js'), 'utf8');
    assert.match(loader, /https:\/\/www\.clarity\.ms\/tag\//);
    assert.match(loader, /"yzygnbt8el"/);
  });

  it('lists live stories newest first on the home page, and nothing that was taken down', async () => {
    const home = await page('index.html');
    assert.ok(home.indexOf('Jio IPO opens on 21 October') < home.indexOf('RBI raises the repo rate'));
    assert.ok(!home.includes('A story taken back'));
    assert.ok(!home.includes('A story Edock hid'));
    assert.match(home, /Updated 12:12 pm/);
    assert.match(home, /class="team">Edock team/);
  });

  it('shows a story with its byline, version, cover, links and its Article data', async () => {
    const story = await page(`p/${JIO}/index.html`);
    assert.match(story, /<h1>Jio IPO opens on 21 October<\/h1>/);
    assert.match(story, /<span class="seal">Version 2<\/span>\s*<span class="record-when">Updated 11 Oct 2026, 12:12 pm IST<\/span>/);
    assert.match(story, /<span class="avatar avatar-large" aria-hidden="true">N<\/span>/);
    assert.match(story, /<p class="tags"><span class="chip">Markets<\/span><\/p>/);
    assert.match(story, /<p class="embed"><a href="https:\/\/www.youtube.com\/watch\?v=dQw4w9WgXcQ"/);
    assert.match(story, /<img src="\/media\/[0-9a-f]{64}\.jpg"/);
    assert.match(story, /Watch on YouTube/);
    assert.match(story, /https:\/\/github.com\/edock-in\/edock-news-archive\/blob\/main\/stories\/a1b2c3d4-0000-4000-8000-000000000001\/v2.json/);
    assert.match(story, /<script type="application\/ld\+json">\{"@context":"https:\/\/schema.org","@type":"NewsArticle"/);
    assert.match(story, /<meta property="og:image" content="https:\/\/news.edock.io\/media\//);
    assert.match(story, /href="https:\/\/blogs.edock.io\/p\/jio-ipo-opens-21-october"/);
    assert.ok(!story.includes('noindex'));
  });

  it('shows the full history, and what changed in each version', async () => {
    const history = await page(`p/${JIO}/history/index.html`);
    assert.match(history, /First version/);
    assert.match(history, /1 paragraph changed, 1 paragraph added/);
    const v2 = await page(`p/${JIO}/v/2/index.html`);
    assert.match(v2, /What changed from version 1/);
    assert.match(v2, /<ins>Shares list on 28 October.<\/ins>/);
    assert.match(v2, /<del>₹1,119.<\/del>/);
    assert.match(v2, /noindex/);
    const v1 = await page(`p/${JIO}/v/1/index.html`);
    assert.match(v1, /As it was first published/);
    assert.match(v1, /href="\/p\/jio-ipo-opens-21-october\/v\/2\/">Version 2/);
  });

  it('notes a headline that changed', async () => {
    const dir = await fresh();
    const into = await fresh();
    const events = sampleEvents();
    events[6].version.title = 'Jio IPO: shares list on 28 October';
    await makeArchive(dir, events);
    await build({ archive: dir, out: into });
    assert.match(await readFile(path.join(into, `p/${JIO}/v/2/index.html`), 'utf8'), /Headline: <del>Jio IPO opens on 21 October<\/del> <ins>Jio IPO: shares list on 28 October<\/ins>/);
    assert.match(await readFile(path.join(into, `p/${JIO}/history/index.html`), 'utf8'), /new headline/);
  });

  it('gives a Report form that posts to the API with no sign-in, and a trap for bots', async () => {
    const report = await page(`p/${JIO}/report/index.html`);
    assert.match(report, /<form method="post" action="https:\/\/api.edock.io\/api\/public\/news\/stories\/jio-ipo-opens-21-october\/reports"/);
    assert.equal((report.match(/name="reason"/g) ?? []).length, 6);
    assert.match(report, /name="version" value="2"/);
    assert.match(report, /class="trap" aria-hidden="true"><label>Leave this empty <input type="text" name="website"/);
    assert.match(report, /form-action &#39;self&#39; https:\/\/api.edock.io/);
  });

  it('leaves a note, not the story, where a story was taken down', async () => {
    const back = await page('p/a-story-taken-back/index.html');
    assert.match(back, /Its author took this story off News on 10 Oct 2026/);
    assert.ok(!back.includes('Its author took it off News later.'));
    assert.match(back, /noindex/);
    const hid = await page('p/a-story-edock-hid/index.html');
    assert.match(hid, /Edock took this story off news.edock.io on 10 Oct 2026. The reason given: It named a private person./);
    assert.ok(!hid.includes('It broke a rule.'));
    await assert.rejects(stat(path.join(out, 'p/a-story-edock-hid/history/index.html')));
  });

  it('writes the feed, the sitemaps and robots.txt', async () => {
    const feed = await page('feed.xml');
    assert.match(feed, /<title>Jio IPO opens on 21 October<\/title>/);
    assert.ok(!feed.includes('A story taken back'));
    const map = await page('sitemap.xml');
    assert.match(map, /<loc>https:\/\/news.edock.io\/p\/rbi-raises-repo-rate-to-5-5\/<\/loc><lastmod>2026-10-10T06:00:00.000Z<\/lastmod>/);
    const news = await page('news-sitemap.xml');
    assert.match(news, /jio-ipo-opens-21-october/);
    assert.match(news, /rbi-raises-repo-rate/);
    const robots = await page('robots.txt');
    assert.match(robots, /Sitemap: https:\/\/news.edock.io\/news-sitemap.xml/);
    const record = JSON.parse(await page('record.json'));
    assert.deepEqual({ ...record, chain_head: undefined }, { chain_lines: 7, chain_head: undefined, stories: 4, live: 2, built_at: '2026-10-11T12:00:00.000Z' });
  });

  it('leaves stories older than two days out of the news sitemap', async () => {
    const into = await fresh();
    await build({ archive, out: into, now: '2026-10-20T00:00:00.000Z' });
    assert.ok(!(await readFile(path.join(into, 'news-sitemap.xml'), 'utf8')).includes('<news:news>'));
  });

  it('builds for another address and API, for local testing', async () => {
    const into = await fresh();
    await build({ archive, out: into, origin: 'http://127.0.0.1:4173/', api: 'http://localhost:3077/' });
    const report = await readFile(path.join(into, `p/${JIO}/report/index.html`), 'utf8');
    assert.match(report, /action="http:\/\/localhost:3077\/api\/public\/news\//);
    assert.match(await readFile(path.join(into, 'robots.txt'), 'utf8'), /Sitemap: http:\/\/127.0.0.1:4173\/sitemap.xml/);
  });

  it('says the first stories are on their way when the record is empty', async () => {
    const into = await fresh();
    const empty = await fresh();
    await build({ archive: empty, out: into });
    const home = await readFile(path.join(into, 'index.html'), 'utf8');
    assert.match(home, /The first stories are on their way/);
    assert.match(home, /Built from chain line 0 of the public record\./);
  });

  it('refuses a broken record and leaves the last good build alone', async () => {
    const dir = await fresh();
    await makeArchive(dir, sampleEvents());
    const chain = path.join(dir, 'chain', '2026-10.jsonl');
    await writeFile(chain, (await readFile(chain, 'utf8')).replace('"n":3', '"n":9'));
    await assert.rejects(build({ archive: dir, out }), /numbered 9/);
    assert.ok((await stat(path.join(out, 'index.html'))).isFile());
  });
});

describe('the command line', () => {
  it('reads its options', () => {
    assert.deepEqual(parseArgs(['--archive', 'a', '--out', 'b', '--api', 'c']), { archive: 'a', out: 'b', api: 'c' });
  });

  it('refuses what it cannot use', () => {
    assert.throws(() => parseArgs(['archive']), /Unexpected argument/);
    assert.throws(() => parseArgs(['--archive']), /needs a value/);
    assert.throws(() => parseArgs(['--archive', '--out']), /needs a value/);
    assert.throws(() => parseArgs(['--archive', 'a']), /Usage/);
  });
});

describe('dates and rules', () => {
  it('writes times in India time', () => {
    assert.equal(dayOf('2026-10-11T18:45:00.000Z'), '12 Oct 2026');
    assert.equal(timeOf('2026-10-11T06:42:00.000Z'), '12:12 pm');
    assert.equal(momentOf('2026-10-11T04:30:00.000Z'), '11 Oct 2026, 10:00 am IST');
  });

  it('rounds reading time, never to zero', () => {
    assert.equal(readingMinutes(0), 1);
    assert.equal(readingMinutes(undefined), 1);
    assert.equal(readingMinutes(1000), 5);
  });

  it('allows only this site, Clarity, and posting to the API', () => {
    assert.equal(
      contentSecurityPolicy({ api: 'https://api.edock.io/x' }),
      "default-src 'none'; script-src 'self' https://www.clarity.ms https://*.clarity.ms; connect-src https://*.clarity.ms; img-src 'self' https://*.clarity.ms https://c.bing.com; style-src 'self'; font-src 'self'; form-action 'self' https://api.edock.io; base-uri 'none'",
    );
  });
});

describe('the page checker', () => {
  const ok = '<meta http-equiv="Content-Security-Policy" content="x">';
  it('passes a clean page, its Article data and the Clarity tag', () => {
    assert.deepEqual(problemsIn(`${ok}<script type="application/ld+json">{}</script><script src="/clarity.js" async></script><link rel="stylesheet" href="/a.css"><link rel="canonical" href="https://news.edock.io/"><img src="/media/a.jpg">`), []);
  });

  it('catches every way a page could break its promise', () => {
    const problems = problemsIn(
      '<script>x()</script><p onclick="x()" style="color:red">a</p><style>p{}</style><iframe></iframe>' +
        '<meta http-equiv="refresh" content="0;url=https://evil.test"><img src="https://evil.test/p.gif"><img src="//evil.test/p.gif">' +
        '<img src="data:image/png;base64,x"><link rel="stylesheet" href="https://fonts.googleapis.com/css">',
    );
    assert.deepEqual([...new Set(problems)], [
      'runs a script',
      'has an event handler',
      'has an inline style',
      'has a style block',
      'embeds another page',
      'redirects itself',
      'loads https://evil.test/p.gif from elsewhere',
      'loads //evil.test/p.gif from elsewhere',
      'loads data:image/png;base64,x from elsewhere',
      'loads https://fonts.googleapis.com/css from elsewhere',
      'has no page policy',
    ]);
  });

  it('lets no other script through, however close to the Clarity tag it looks', () => {
    for (const tag of [
      '<script src="/other.js" async></script>',
      '<script src="https://x.test/clarity.js" async></script>',
      '<script src="/clarity.js"></script>',
      '<script src="/clarity.js" async>x()</script>',
    ]) {
      assert.deepEqual(problemsIn(`${ok}${tag}`), ['runs a script'], tag);
    }
  });

  it('names each bad page in a site', async () => {
    const dir = await fresh();
    await writeFile(path.join(dir, 'bad.html'), '<script>x</script>');
    await writeFile(path.join(dir, 'notes.txt'), '<script>');
    assert.deepEqual(await checkSite(dir), ['bad.html: runs a script; has no page policy']);
  });
});

describe('a story that came back', () => {
  it('lists every withdrawal, return, hide and un-hide in its history', async () => {
    const dir = await fresh();
    const into = await fresh();
    const [, , rbi] = sampleEvents();
    await makeArchive(dir, [
      rbi,
      { kind: 'withdrawn', story: rbi.story, at: '2026-10-10T07:00:00.000Z', note: 'unpublished' },
      { kind: 'returned', story: rbi.story, at: '2026-10-10T08:00:00.000Z' },
      { kind: 'hidden', story: rbi.story, at: '2026-10-10T09:00:00.000Z', note: 'Checking a claim' },
      { kind: 'unhidden', story: rbi.story, at: '2026-10-10T10:00:00.000Z' },
      { kind: 'withdrawn', story: rbi.story, at: '2026-10-10T11:00:00.000Z' },
      { kind: 'returned', story: rbi.story, at: '2026-10-10T12:00:00.000Z' },
      { kind: 'hidden', story: rbi.story, at: '2026-10-10T13:00:00.000Z' },
      { kind: 'unhidden', story: rbi.story, at: '2026-10-10T14:00:00.000Z' },
    ]);
    await build({ archive: dir, out: into });
    const history = await readFile(path.join(into, 'p/rbi-raises-repo-rate-to-5-5/history/index.html'), 'utf8');
    for (const line of [
      'Taken off News by its author (unpublished)',
      'Back on News, unchanged',
      'Hidden by Edock: Checking a claim',
      'Shown again by Edock',
      'Taken off News by its author (withdrawn)',
      'Hidden by Edock</span>',
    ]) {
      assert.ok(history.includes(line), line);
    }
    assert.match(history, /href="https:\/\/github.com\/edock-in\/edock-news-archive\/blob\/main\/chain\/2026-10.jsonl">Chain line 9/);
  });
});

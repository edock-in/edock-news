import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileFor, handler, securityHeaders } from '../src/serve.mjs';

describe('serving a build locally', () => {
  let root;
  let server;
  let base;

  before(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'edock-news-serve-'));
    await mkdir(path.join(root, 'p', 'story'), { recursive: true });
    await writeFile(path.join(root, 'index.html'), 'home');
    await writeFile(path.join(root, '404.html'), 'not found');
    await writeFile(path.join(root, 'p', 'story', 'index.html'), 'story');
    await writeFile(path.join(root, 'feed.xml'), '<rss/>');
    await writeFile(path.join(root, 'odd.bin'), 'x');
    await writeFile(path.join(root, 'clarity.js'), '');
    server = createServer(handler(root, 'http://localhost:3077'));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((resolve) => server.close(resolve)));

  it('answers a folder with its page, with the live site’s headers', async () => {
    const res = await fetch(`${base}/p/story/`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'story');
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(res.headers.get('content-security-policy'), /form-action 'self' http:\/\/localhost:3077/);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self' https:\/\/www\.clarity\.ms https:\/\/\*\.clarity\.ms; connect-src https:\/\/\*\.clarity\.ms;/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  });

  it('sends a folder without its slash to the slash', async () => {
    const res = await fetch(`${base}/p/story?x=1`, { redirect: 'manual' });
    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), '/p/story/');
  });

  it('serves files by type, and the 404 page for anything missing', async () => {
    assert.equal((await fetch(`${base}/feed.xml`)).headers.get('content-type'), 'application/xml; charset=utf-8');
    assert.equal((await fetch(`${base}/clarity.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal((await fetch(`${base}/odd.bin`)).headers.get('content-type'), 'application/octet-stream');
    const missing = await fetch(`${base}/nope/`);
    assert.equal(missing.status, 404);
    assert.equal(await missing.text(), 'not found');
  });

  it('never serves a file outside the build', () => {
    // The address is tidied first, so climbing out lands back inside.
    assert.equal(fileFor('/site', '/../etc/passwd'), path.resolve('/site/etc/passwd'));
    assert.equal(fileFor('/site', '/%2e%2e/etc/passwd'), path.resolve('/site/etc/passwd'));
    // An escaped slash survives tidying, so it is caught after decoding.
    assert.equal(fileFor('/site', '/..%2F..%2Fetc%2Fpasswd'), null);
    assert.equal(fileFor('/site', '/%E0%A4%A'), null);
    assert.equal(fileFor('/site', '/a/'), path.resolve('/site/a/index.html'));
  });

  it('defaults to the live API', () => {
    assert.match(securityHeaders()['Content-Security-Policy'], /form-action 'self' https:\/\/api.edock.io;/);
  });
});

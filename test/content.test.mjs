import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanStoryHtml, escapeHtml, excerptOf, plainText, safeLink } from '../src/sanitize.mjs';
import { changeBlocks, changeSummary, editScript, paragraphsOf, wordDiffHtml } from '../src/diff.mjs';

describe('cleaning a story', () => {
  it('keeps the words and their shape, and drops every script and handler', () => {
    const html = cleanStoryHtml(
      '<h2 style="color:red" class="x" id="y">Title</h2><p onclick="steal()">Hi <strong>there</strong></p>' +
        '<script>alert(1)</script><iframe src="https://evil.test"></iframe><form action="https://evil.test"><input></form>' +
        '<style>body{}</style><svg><script>x</script></svg>',
    );
    assert.equal(html, '<h2>Title</h2><p>Hi <strong>there</strong></p>');
  });

  it('shows a picture only from the archive’s own copy, served from this site', () => {
    const media = { 'https://cdn.test/a.jpg': 'media/abc.jpg' };
    assert.equal(
      cleanStoryHtml('<img src="https://cdn.test/a.jpg" alt="A &quot;chart&quot;" onerror="x()">', media, '/'),
      '<img src="/media/abc.jpg" alt="A &quot;chart&quot;" loading="lazy" decoding="async">',
    );
    assert.equal(cleanStoryHtml('<img src="https://cdn.test/a.jpg">', media), '<img src="/media/abc.jpg" alt="" loading="lazy" decoding="async">');
    assert.equal(cleanStoryHtml('<p><img src="https://tracker.test/pixel.gif"></p>', media), '<p></p>');
  });

  it('keeps only real web and mail links, marked as the writer’s', () => {
    assert.equal(
      cleanStoryHtml('<a href="https://example.com/x?a=1&amp;b=2" target="_blank">x</a>'),
      '<a href="https://example.com/x?a=1&amp;b=2" rel="nofollow ugc noopener noreferrer">x</a>',
    );
    assert.equal(cleanStoryHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
    assert.equal(cleanStoryHtml('<a>x</a>'), '<a>x</a>');
    assert.equal(safeLink('mailto:a@b.test'), 'mailto:a@b.test');
    assert.equal(safeLink('data:text/html,x'), null);
    assert.equal(safeLink('not a link'), null);
  });

  it('turns an embedded post into a link to it, and drops one it cannot be sure of', () => {
    assert.equal(
      cleanStoryHtml('<div class="e" data-embed="youtube" data-embed-id="dQw4w9WgXcQ">frame</div>'),
      '<p class="embed"><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" rel="nofollow ugc noopener noreferrer">Watch on YouTube</a></p>',
    );
    assert.match(cleanStoryHtml("<div data-embed='linkedin' data-embed-id='activity:123456'></div>"), /urn:li:activity:123456/);
    assert.equal(cleanStoryHtml('<div data-embed="myspace" data-embed-id="1"></div>'), '');
    assert.equal(cleanStoryHtml('<div data-embed="youtube" data-embed-id="bad id!"></div>'), '');
    assert.equal(cleanStoryHtml('<div data-embed="youtube"></div>'), '');
    assert.equal(cleanStoryHtml('<div data-embed=__proto__ data-embed-id=x></div>'), '');
  });

  it('turns a video into a link to it, and drops one that is not https', () => {
    assert.equal(
      cleanStoryHtml('<video src="https://cdn.test/v.mp4" poster="https://cdn.test/p.jpg" controls></video>'),
      '<p class="embed"><a href="https://cdn.test/v.mp4" rel="nofollow ugc noopener noreferrer">Watch the video</a></p>',
    );
    assert.equal(cleanStoryHtml('<video src="http://cdn.test/v.mp4"></video>'), '');
    assert.equal(cleanStoryHtml('<video src="https://cdn.test/v.mp4" />'), cleanStoryHtml('<video src="https://cdn.test/v.mp4"></video>'));
    assert.equal(cleanStoryHtml('<video></video>'), '');
  });

  it('copes with nothing', () => {
    assert.equal(cleanStoryHtml(null), '');
  });
});

describe('plain words', () => {
  it('flattens HTML to text', () => {
    assert.equal(plainText('<p>A &amp; B</p><script>x</script><p>&lt;c&gt; &quot;d&quot; &#39;e&#39;&nbsp;f</p>'), 'A & B <c> "d" \'e\' f');
    assert.equal(plainText(undefined), '');
  });

  it('escapes for HTML', () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    assert.equal(escapeHtml(null), '');
  });

  it('prefers the subtitle for an excerpt, and cuts long ones at a word', () => {
    assert.equal(excerptOf({ subtitle: ' Short ', content_html: '<p>Body</p>' }), 'Short');
    assert.equal(excerptOf({ subtitle: null, content_html: '<p>Body text</p>' }), 'Body text');
    assert.equal(excerptOf({ subtitle: '', content_html: `<p>${'word '.repeat(100)}</p>` }, 20), 'word word word word…');
    assert.equal(excerptOf({ subtitle: 'x'.repeat(30), content_html: '' }, 10), `${'x'.repeat(9)}…`);
  });
});

describe('what changed', () => {
  it('splits a body into its paragraphs', () => {
    assert.deepEqual(paragraphsOf('<h2>T</h2><p>a</p><p> </p><li>b</li>c<br>d'), ['T', 'a', 'b', 'c', 'd']);
    assert.deepEqual(paragraphsOf(null), []);
  });

  it('finds the shortest edit between two lists', () => {
    assert.deepEqual(editScript(['a', 'b', 'c'], ['a', 'c', 'd']), [
      ['same', 'a'],
      ['out', 'b'],
      ['same', 'c'],
      ['in', 'd'],
    ]);
    assert.deepEqual(editScript(['a'], []), [['out', 'a']]);
  });

  it('falls back to whole lists when they are too long to compare', () => {
    const a = Array.from({ length: 700 }, (_, i) => `a${i}`);
    const b = Array.from({ length: 700 }, (_, i) => `b${i}`);
    const script = editScript(a, b);
    assert.equal(script.filter(([k]) => k === 'out').length, 700);
    assert.equal(script.filter(([k]) => k === 'in').length, 700);
  });

  it('marks a rewritten paragraph word by word, escaping what it shows', () => {
    assert.equal(wordDiffHtml('The band is ₹1,119.', 'The band is ₹1,119 a <share>.'), 'The band is <del>₹1,119.</del><ins>₹1,119 a &lt;share&gt;.</ins>');
  });

  it('pairs rewrites, and lists whole paragraphs added and removed', () => {
    const blocks = changeBlocks('<p>keep</p><p>old one</p><p>old two</p><p>gone</p>', '<p>keep</p><p>new one</p><p>end</p><p>more</p><p>extra</p>');
    assert.deepEqual(blocks.map((b) => b.kind), ['same', 'changed', 'changed', 'changed', 'added']);
    const removals = changeBlocks('<p>a</p><p>b</p><p>c</p>', '<p>a</p>');
    assert.deepEqual(removals, [
      { kind: 'same', html: 'a' },
      { kind: 'removed', html: 'b' },
      { kind: 'removed', html: 'c' },
    ]);
  });

  it('sums up the change in a line', () => {
    assert.equal(changeSummary(changeBlocks('<p>a</p>', '<p>a</p>')), 'No change to the words');
    assert.equal(changeSummary(changeBlocks('<p>a</p><p>b</p>', '<p>A</p><p>b</p><p>c</p><p>d</p>')), '1 paragraph changed, 2 paragraphs added');
    assert.equal(changeSummary(changeBlocks('<p>a</p><p>b</p>', '<p>a</p>')), '1 paragraph removed');
  });
});

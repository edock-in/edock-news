/**
 * Every page of news.edock.io, as plain HTML strings.
 *
 * The one script on any page is Microsoft Clarity (/clarity.js), which
 * measures how pages are read; the page's policy lets it reach clarity.ms and
 * nowhere else. Apart from Clarity, the only thing a reader sends anywhere is
 * the Report form, a plain form post to the Edock API. Styles come from one
 * stylesheet on this site, fonts from this site, pictures from this site's
 * copy of the archive. The policy below says so to the browser too, in the
 * page itself as well as in the server's headers.
 */

import { cleanStoryHtml, escapeHtml, excerptOf } from './sanitize.mjs';
import { changeBlocks, changeSummary } from './diff.mjs';

export const REPORT_REASONS = [
  ['false_or_misleading', 'False or misleading'],
  ['hate_or_harassment', 'Hate or harassment'],
  ['private_information', 'Shares private information'],
  ['copyright', "Copies someone else's work"],
  ['spam', 'Spam or an advert'],
  ['other', 'Something else'],
];

const DAY = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const TIME = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

/** "11 Oct 2026" in India time. */
export const dayOf = (iso) => DAY.format(new Date(iso));
/** "4:12 pm" in India time. */
export const timeOf = (iso) => TIME.format(new Date(iso)).replace(/\s?([ap])\.?m\.?/i, ' $1m');
/** "11 Oct 2026, 4:12 pm IST". */
export const momentOf = (iso) => `${dayOf(iso)}, ${timeOf(iso)} IST`;

export const readingMinutes = (words) => Math.max(1, Math.round((words || 0) / 200));

/** Where Clarity loads its code from and sends what it measures (Microsoft's list). */
export const CLARITY_SOURCES = {
  script: 'https://www.clarity.ms https://*.clarity.ms',
  connect: 'https://*.clarity.ms',
  img: 'https://*.clarity.ms https://c.bing.com',
};

/** The tag every page carries: the site's own copy of Clarity's loader. */
export const CLARITY_TAG = '<script src="/clarity.js" async></script>';

/** The page's own rules for the browser: nothing from anywhere else but Clarity. */
export function contentSecurityPolicy(config) {
  return [
    "default-src 'none'",
    `script-src 'self' ${CLARITY_SOURCES.script}`,
    `connect-src ${CLARITY_SOURCES.connect}`,
    `img-src 'self' ${CLARITY_SOURCES.img}`,
    "style-src 'self'",
    "font-src 'self'",
    `form-action 'self' ${new URL(config.api).origin}`,
    "base-uri 'none'",
  ].join('; ');
}

/** The Edock wordmark, as blogs.edock.io draws it: one shape, the star cut out of the O. */
const WORDMARK = `<svg class="wordmark" viewBox="0 0 734 170" aria-hidden="true" focusable="false"><path fill="currentColor" d="M352.659 0C364.799 0.000267325 375.915 2.1044 386.008 6.31152C396.247 10.519 405.1 16.4366 412.561 24.0723C420.167 31.7077 426.091 40.6687 430.333 50.9531C430.597 51.5832 430.85 52.2199 431.098 52.8584C431.408 52.071 431.731 51.2884 432.067 50.5127C436.617 40.3778 442.889 31.5459 450.89 24.0215C459.046 16.4975 468.537 10.7396 479.36 6.74707C490.184 2.60094 502.03 0.525391 514.894 0.525391C529.168 0.525436 548.704 2.93907 560.155 7.85254V56.2031C551.923 42.7729 536.474 32.3157 516.776 32.3154C509.09 32.3154 502.029 33.5449 495.598 36.002C489.167 38.4589 483.598 41.9902 478.893 46.5967C474.186 51.2035 470.496 56.6541 467.829 62.9502C465.319 69.2459 464.069 76.2336 464.069 83.9111C464.069 91.5886 465.32 98.5774 467.829 104.873C470.496 111.169 474.187 116.619 478.893 121.226C483.599 125.832 489.166 129.369 495.598 131.826C502.029 134.283 509.09 135.507 516.776 135.507C541.872 135.506 560.668 117.698 576.147 101.08V3.29004H614.031V62.0293L672.569 3.29004H714.921L651.493 64.4189L733.332 164.533H688.858L625.465 89.5752L626.041 88.9551L614.031 100.538V164.533H576.147V140.21C559.699 154.749 538.989 167.297 514.659 167.298C501.953 167.298 490.107 165.303 479.126 161.311C468.302 157.164 458.89 151.325 450.89 143.801C442.89 136.276 436.616 127.445 432.067 117.311C431.838 116.781 431.618 116.248 431.4 115.714C431.059 116.65 430.708 117.583 430.333 118.506C414.832 150.122 382.832 169.23 352.876 169.23C322.92 169.23 290.332 150.122 274.763 118.271C274.592 117.844 274.43 117.413 274.267 116.981C272.502 121.446 270.332 125.688 267.739 129.698C259.786 142.092 248.669 151.708 234.386 158.54C220.102 165.372 203.543 168.789 184.714 168.789H0V1.94922H110.691V34.8398H34.6211V68.374H110.691V99.1816H34.6211V136.501H127.751V1.94922H184.714C203.543 1.94923 220.102 5.36579 234.386 12.1982C248.668 19.0303 259.786 28.6419 267.739 41.0342C270.199 44.7901 272.278 48.7701 273.992 52.9639C274.24 52.2902 274.498 51.619 274.763 50.9531C279.005 40.6689 284.929 31.7076 292.535 24.0723C300.141 16.4371 309.066 10.5188 319.305 6.31152C329.544 2.10409 340.664 3.56851e-06 352.659 0ZM353.101 16.2451C353.051 15.7132 352.276 15.7089 352.221 16.2402L348.492 52.0146C348.469 52.2399 348.278 52.4111 348.052 52.4111H308.064C307.57 52.4111 307.448 53.0986 307.912 53.2686L346.603 67.4189C346.794 67.4889 346.913 67.6805 346.891 67.8828L341.526 116.248C341.492 116.555 341.161 116.734 340.886 116.594L278.905 85.0283C278.44 84.7915 278.02 85.4137 278.414 85.7559L352.508 150.122C352.675 150.267 352.924 150.267 353.09 150.121L426.37 85.7207C426.761 85.3772 426.341 84.7578 425.877 84.9941L363.899 116.592C363.623 116.732 363.292 116.553 363.259 116.245L358.091 67.8818C358.069 67.68 358.187 67.4888 358.378 67.4189L397.004 53.2686C397.468 53.0984 397.346 52.4113 396.852 52.4111H356.89C356.661 52.4111 356.47 52.2371 356.449 52.0098L353.101 16.2451ZM164.984 136.501H182.769C203.758 136.5 242.195 126.042 242.196 85.3691C242.196 44.6956 203.407 34.232 182.769 34.2314H164.984V136.501Z"/></svg>`;

const BLUE_TICK = `<svg class="tick" viewBox="0 0 24 24" role="img" aria-label="Blue tick"><path fill="#1D9BF0" d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484z"/><path fill="#fff" d="M10.54 16.2l-3.61-3.6 1.4-1.42 2.18 2.18 4.68-5.1 1.47 1.36z"/></svg>`;

const PEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;


const jsonLd = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

/** The frame around every page. */
export function layout(config, page) {
  const canonical = `${config.origin}${page.path}`;
  const image = page.image ?? `${config.origin}/og.png`;
  const description = page.description ?? 'Business news from the Edock community. Every story and every edit stays on a public record that anyone can check.';
  const title = page.title ? `${page.title} · Edock News` : 'Edock News';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(contentSecurityPolicy(config))}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${page.noindex ? '<meta name="robots" content="noindex">\n' : '<meta name="robots" content="max-image-preview:large">\n'}<meta name="theme-color" content="#FF3D1F">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/favicon.png">
<link rel="alternate" type="application/rss+xml" title="Edock News" href="/feed.xml">
<link rel="stylesheet" href="${escapeHtml(config.cssPath)}">
${CLARITY_TAG}
<meta property="og:site_name" content="Edock News">
<meta property="og:type" content="${page.article ? 'article' : 'website'}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:title" content="${escapeHtml(page.title ?? 'Edock News')}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(page.title ?? 'Edock News')}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
${page.article ? `<meta property="article:published_time" content="${escapeHtml(page.article.published)}">\n<meta property="article:modified_time" content="${escapeHtml(page.article.modified)}">\n` : ''}${page.ld ? `<script type="application/ld+json">${jsonLd(page.ld)}</script>\n` : ''}</head>
<body>
<header class="masthead">
  <div class="masthead-inner">
    <a class="brand" href="/" aria-label="Edock News home">${WORDMARK}<span class="brand-label">News</span></a>
    <nav class="nav" aria-label="Site">
      <a class="nav-link" href="/about/">How it works</a>
      <a class="pill pill-outline" href="https://blogs.edock.io/new" aria-label="Write on Edock Blogs">${PEN}<span class="pill-text">Write</span></a>
      <a class="pill" href="https://edock.io/">Join Edock</a>
    </nav>
  </div>
</header>
<main id="main" class="${page.mainClass ?? 'page'}">
${page.body}
</main>
<footer class="footer">
  <div class="footer-inner">
    <p>Edock News — business news from the Edock community, kept on a <a href="${config.archiveUrl}">public record</a>.</p>
    <p><a href="/about/">How it works</a> · <a href="${config.siteRepoUrl}">Open source</a> · <a href="https://blogs.edock.io/">Edock Blogs</a> · <a href="https://edock.io/">Explore Edock</a> · <a href="/feed.xml">RSS</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></p>
    <p class="fine">Built from chain line ${config.chain.count} of the public record${config.chain.count ? `, <code>${config.chain.head.slice(0, 12)}</code>` : ''}.</p>
  </div>
</footer>
</body>
</html>
`;
}

/** The first letter of a name, for the round avatar of an author with no photo. */
export function initialOf(name) {
  const letter = String(name ?? '').trim().match(/\p{L}|\p{N}/u);
  return letter ? letter[0].toUpperCase() : 'E';
}

const AVATAR_PX = { small: 28, large: 44 };

/** The author's photo from the record, as blogs.edock.io shows it; else their first letter. */
function avatar(record, config, size = 'small') {
  const photo = config.authorPhotos?.get(record.author.handle);
  if (photo) {
    const px = AVATAR_PX[size];
    return `<img class="avatar avatar-${size}" src="${escapeHtml(`${config.mediaBase}${photo}`)}" alt="" width="${px}" height="${px}" decoding="async">`;
  }
  return `<span class="avatar avatar-${size}" aria-hidden="true">${escapeHtml(initialOf(record.author.name))}</span>`;
}

function byline(record, { link = true } = {}) {
  const name = escapeHtml(record.author.name);
  const who = link
    ? `<a href="https://blogs.edock.io/author/${encodeURIComponent(record.author.handle)}">${name}</a>`
    : name;
  const tick = record.author.verified ? ` ${BLUE_TICK}` : '';
  const team = record.author.team ? ' <span class="team">Edock team</span>' : '';
  return `<span class="author">${who}${tick}${team}</span>`;
}

function coverOf(record, config) {
  const copy = record.cover_image ? record.media?.[record.cover_image] : null;
  return copy ? `${config.mediaBase}${copy}` : null;
}

function storyRow(story, config, first = false) {
  const record = story.latest;
  const cover = coverOf(record, config);
  const sameDay = dayOf(record.saved_at) === dayOf(story.first.first_published_at);
  const updated =
    story.versions.length > 1
      ? `<span class="dot">·</span><span>Updated ${sameDay ? timeOf(record.saved_at) : dayOf(record.saved_at)}</span>`
      : '';
  const tag = record.tags?.length ? `<span class="chip">${escapeHtml(record.tags[0])}</span>` : '';
  return `<article class="row">
  <div class="row-text">
    <p class="row-author">${avatar(record, config)}${byline(record, { link: false })}</p>
    <h2 class="row-title"><a href="/p/${record.slug}/">${escapeHtml(record.title)}</a></h2>
    <p class="row-dek">${escapeHtml(excerptOf(record, 180))}</p>
    <p class="meta"><span>${dayOf(story.first.first_published_at)}</span><span class="dot">·</span><span>${readingMinutes(record.word_count)} min read</span>${updated}${tag}</p>
  </div>
  ${cover ? `<a class="row-cover" href="/p/${record.slug}/" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(cover)}" alt="" loading="${first ? 'eager' : 'lazy'}" decoding="async"></a>` : ''}
</article>`;
}

function sidebar() {
  return `<aside class="side" aria-label="About Edock News">
  <section class="side-box">
    <h3>Every edit, on the record</h3>
    <p>Each story and each change to it is kept in a public record that nobody can quietly change. You can check it yourself.</p>
    <a class="text-link" href="/about/">How it works</a>
  </section>
  <section class="side-box">
    <h3>Write News on Edock</h3>
    <p>The Edock team and members with a blue tick can mark any story on Edock Blogs as News.</p>
    <a class="pill" href="https://blogs.edock.io/new">Start writing</a>
  </section>
</aside>`;
}

export function homePage(config, stories) {
  const live = stories.filter((s) => s.live).sort((a, b) => Date.parse(b.first.first_published_at) - Date.parse(a.first.first_published_at));
  const list = live.length
    ? `<div class="rows">
${live.map((s, i) => storyRow(s, config, i === 0)).join('\n')}
</div>`
    : `<section class="empty">
  <h2>The first stories are on their way</h2>
  <p>Edock News is business news written by the Edock team and members with a blue tick. Every story and every edit will stay on a public record that anyone can check.</p>
  <a class="pill" href="/about/">How it works</a>
</section>`;
  const body = `<h1 class="visually-hidden">Edock News</h1>
<div class="home-grid">
  <section class="feed" aria-label="Latest stories">
    <nav class="tabs" aria-label="Stories"><a class="tab tab-on" href="/" aria-current="page">Latest</a></nav>
    ${list}
  </section>
  ${sidebar()}
</div>`;
  return layout(config, { path: '/', body, mainClass: 'page home' });
}

function recordLink(config, entry) {
  return `${config.archiveUrl}/blob/main/${entry.file}`;
}

export function storyPage(config, story) {
  const record = story.latest;
  const last = story.versions[story.versions.length - 1];
  const cover = coverOf(record, config);
  const url = `${config.origin}/p/${record.slug}/`;
  const versions = story.versions.length;
  const body = `<article class="story">
  <header class="story-head">
    <h1>${escapeHtml(record.title)}</h1>
    ${record.subtitle ? `<p class="dek">${escapeHtml(record.subtitle)}</p>` : ''}
    <div class="story-author">
      ${avatar(record, config, 'large')}
      <div>
        <p class="author-line">${byline(record)}</p>
        <p class="meta"><span>${dayOf(story.first.first_published_at)}</span><span class="dot">·</span><span>${readingMinutes(record.word_count)} min read</span></p>
      </div>
    </div>
    <div class="record-bar">
      <span class="seal">Version ${versions}</span>
      <span class="record-when">${versions > 1 ? `Updated ${momentOf(record.saved_at)}` : `Published ${momentOf(record.saved_at)}`}</span>
      <a href="/p/${record.slug}/history/">${versions > 1 ? `All ${versions} versions` : 'History'}</a>
      <a href="${recordLink(config, last)}">Public record</a>
    </div>
  </header>
  ${cover ? `<figure class="cover"><img src="${escapeHtml(cover)}" alt="" decoding="async"></figure>` : ''}
  <div class="story-body">
${cleanStoryHtml(record.content_html, record.media, config.mediaBase)}
  </div>
  ${record.tags?.length ? `<p class="tags">${record.tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join(' ')}</p>` : ''}
  <aside class="story-actions" aria-label="About this story">
    <a class="pill" href="https://blogs.edock.io/p/${record.slug}">Clap and comment on Edock Blogs</a>
    <a class="pill pill-outline" href="/p/${record.slug}/report/">Report this story</a>
  </aside>
  <p class="licence">You may republish this story under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>: credit ${escapeHtml(record.author.name)} and link to this page.</p>
</article>`;
  return layout(config, {
    path: `/p/${record.slug}/`,
    title: record.title,
    description: excerptOf(record, 200),
    image: cover ? `${config.origin}${cover}` : undefined,
    article: { published: story.first.first_published_at, modified: record.saved_at },
    ld: {
      '@context': 'https://schema.org',
      '@type': 'NewsArticle',
      headline: record.title.slice(0, 110),
      description: excerptOf(record, 200),
      ...(cover ? { image: [`${config.origin}${cover}`] } : {}),
      datePublished: story.first.first_published_at,
      dateModified: record.saved_at,
      author: [{ '@type': 'Person', name: record.author.name, url: `https://blogs.edock.io/author/${record.author.handle}` }],
      publisher: { '@type': 'Organization', name: 'Edock', url: 'https://edock.io/', logo: { '@type': 'ImageObject', url: `${config.origin}/favicon.png` } },
      mainEntityOfPage: url,
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      keywords: record.tags,
    },
    body,
  });
}

/** What the record says about a story that is no longer on the site. */
export function removedPage(config, story) {
  const event = [...story.events].reverse().find((e) => e.kind === 'hidden' || e.kind === 'withdrawn');
  const hidden = story.hidden;
  const why = hidden
    ? `Edock took this story off news.edock.io on ${dayOf(event.at)}${event.note ? `. The reason given: ${escapeHtml(event.note)}.` : '.'}`
    : `Its author took this story off News on ${dayOf(event.at)}.`;
  const body = `<section class="notice">
  <h1>${escapeHtml(story.latest.title)}</h1>
  <p class="lede">${why}</p>
  <p>Like every story on Edock News, it stays in the <a href="${config.archiveUrl}/tree/main/stories/${story.id}">public record</a>, with every version and the note above. Nothing on Edock News disappears without a trace.</p>
  <a class="pill" href="/">Latest stories</a>
</section>`;
  return layout(config, { path: `/p/${story.slug}/`, title: story.latest.title, body, noindex: true });
}

function eventLine(entry) {
  switch (entry.kind) {
    case 'withdrawn':
      return `Taken off News by its author (${escapeHtml(entry.note ?? 'withdrawn')})`;
    case 'returned':
      return 'Back on News, unchanged';
    case 'hidden':
      return `Hidden by Edock${entry.note ? `: ${escapeHtml(entry.note)}` : ''}`;
    default:
      // unhidden: the only other change a history lists.
      return 'Shown again by Edock';
  }
}

export function historyPage(config, story) {
  const items = [];
  let previous = null;
  for (const entry of story.events) {
    if (entry.kind === 'version') {
      const summary = previous ? changeSummary(changeBlocks(previous.content_html, entry.record.content_html)) : 'First version';
      items.push(`<li class="history-version">
    <a href="/p/${story.slug}/v/${entry.version}/"><strong>Version ${entry.version}</strong></a>
    <span class="when">${momentOf(entry.record.saved_at)}</span>
    <span class="what">${escapeHtml(summary)}${previous && previous.title !== entry.record.title ? ', new headline' : ''}</span>
    <a class="proof" href="${recordLink(config, entry)}">Chain line ${entry.n}</a>
  </li>`);
      previous = entry.record;
    } else {
      items.push(`<li class="history-event"><span class="when">${momentOf(entry.at)}</span> <span class="what">${eventLine(entry)}</span> <a class="proof" href="${config.archiveUrl}/blob/main/${entry.chainFile}">Chain line ${entry.n}</a></li>`);
    }
  }
  const body = `<section class="history">
  <p class="kicker"><a href="/p/${story.slug}/">${escapeHtml(story.latest.title)}</a></p>
  <h1>Every version of this story</h1>
  <p class="lede">Each time the author pressed Update, the story was saved as a new version. Older versions are never changed or removed. Newest at the bottom.</p>
  <ol class="history-list">
  ${items.join('\n  ')}
  </ol>
</section>`;
  return layout(config, {
    path: `/p/${story.slug}/history/`,
    title: `History: ${story.latest.title}`,
    body,
  });
}

export function versionPage(config, story, index) {
  const entry = story.versions[index];
  const record = entry.record;
  const before = index > 0 ? story.versions[index - 1].record : null;
  const blocks = before ? changeBlocks(before.content_html, record.content_html) : null;
  const nav = [
    index > 0 ? `<a href="/p/${story.slug}/v/${story.versions[index - 1].version}/">Version ${story.versions[index - 1].version}</a>` : '',
    `<a href="/p/${story.slug}/history/">All versions</a>`,
    index < story.versions.length - 1 ? `<a href="/p/${story.slug}/v/${story.versions[index + 1].version}/">Version ${story.versions[index + 1].version}</a>` : '',
  ].filter(Boolean).join(' · ');
  const changes = blocks
    ? `<section class="changes" aria-label="What changed">
    <h2>What changed from version ${story.versions[index - 1].version}</h2>
    <p class="legend"><ins>Added</ins> <del>Removed</del></p>
    ${before.title !== record.title ? `<p class="change-title">Headline: <del>${escapeHtml(before.title)}</del> <ins>${escapeHtml(record.title)}</ins></p>` : ''}
    ${blocks.map((b) => `<p class="change change-${b.kind}">${b.kind === 'added' ? `<ins>${b.html}</ins>` : b.kind === 'removed' ? `<del>${b.html}</del>` : b.html}</p>`).join('\n    ')}
  </section>`
    : '';
  const body = `<article class="story version">
  <p class="kicker"><a href="/p/${story.slug}/">${escapeHtml(story.latest.title)}</a></p>
  <p class="sealed"><span class="seal">Version ${entry.version} of ${story.versions.length}</span> saved ${momentOf(record.saved_at)} · <a href="${recordLink(config, entry)}">Chain line ${entry.n}</a></p>
  <nav class="version-nav" aria-label="Versions">${nav}</nav>
  ${changes}
  <section class="as-saved" aria-label="This version as it was saved">
    <h2>${blocks ? 'This version in full' : 'As it was first published'}</h2>
    <h1>${escapeHtml(record.title)}</h1>
    ${record.subtitle ? `<p class="dek">${escapeHtml(record.subtitle)}</p>` : ''}
    <p class="meta">By ${byline(record)}</p>
    <div class="story-body">
${cleanStoryHtml(record.content_html, record.media, config.mediaBase)}
    </div>
  </section>
</article>`;
  return layout(config, {
    path: `/p/${story.slug}/v/${entry.version}/`,
    title: `Version ${entry.version}: ${record.title}`,
    body,
    noindex: true,
  });
}

export function reportPage(config, story) {
  const record = story.latest;
  const action = `${config.api}/api/public/news/stories/${encodeURIComponent(record.slug)}/reports`;
  const body = `<section class="report">
  <p class="kicker"><a href="/p/${record.slug}/">${escapeHtml(record.title)}</a></p>
  <h1>Report this story</h1>
  <p class="lede">Tell us what is wrong with it. Your report goes to the author and to the Edock team. You don't need to sign in.</p>
  <form method="post" action="${escapeHtml(action)}" class="report-form">
    <fieldset>
      <legend>What is wrong with it?</legend>
      ${REPORT_REASONS.map(([value, label], i) => `<label class="choice"><input type="radio" name="reason" value="${value}"${i === 0 ? ' required' : ''}> ${escapeHtml(label)}</label>`).join('\n      ')}
    </fieldset>
    <label class="field" for="comment">Tell us more</label>
    <textarea id="comment" name="comment" rows="6" minlength="10" maxlength="1000" required placeholder="What is wrong, and how do you know?"></textarea>
    <input type="hidden" name="version" value="${story.versions.length}">
    <div class="trap" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
    <button class="pill" type="submit">Send report</button>
    <p class="fine">We keep your report, not your address. A story stays up until someone at Edock has looked at it.</p>
  </form>
</section>`;
  return layout(config, { path: `/p/${record.slug}/report/`, title: `Report: ${record.title}`, body, noindex: true });
}

export const REPORT_OUTCOMES = {
  sent: ['Thank you', 'Your report went to the author and to the Edock team. Someone at Edock will look at it.'],
  invalid: ['That report could not be sent', 'Pick a reason and write at least 10 characters (at most 1,000), in polite words. Go back to change it.'],
  limit: ['You have sent a lot of reports', 'To keep reports useful, each person can send only a few a day. Please try again tomorrow, or write to support@edock.io.'],
  missing: ['We could not find that story', 'It may have been taken off News. You can still write to support@edock.io.'],
  failed: ['Something went wrong', 'Your report did not go through. Please try again in a minute, or write to support@edock.io.'],
};

export function reportOutcomePage(config, outcome) {
  const [title, text] = REPORT_OUTCOMES[outcome];
  const body = `<section class="notice">
  <h1>${escapeHtml(title)}</h1>
  <p class="lede">${escapeHtml(text)}</p>
  <a class="pill" href="/">Latest stories</a>
</section>`;
  return layout(config, { path: `/report/${outcome}/`, title, body, noindex: true });
}

export function aboutPage(config) {
  const body = `<article class="prose">
  <h1>How Edock News works</h1>
  <p class="lede">Edock News is business news written by the Edock community. What makes it different: every story and every edit stays on a public record that anyone can check, and nobody, not even Edock, can quietly change it.</p>

  <h2>Who writes it</h2>
  <p>Any story on <a href="https://blogs.edock.io/">Edock Blogs</a> can be marked as News by its author, if the author is on the Edock team or has a blue tick. Members can put out 3 News stories a day. A News story appears here the moment it is published.</p>

  <h2>Every edit is kept</h2>
  <p>Each time an author presses Update, the story is saved as a new version. Every story has a page listing all its versions, and each version shows what changed: added words in green, removed words struck through.</p>

  <h2>The public record</h2>
  <p>Every version is written into a <a href="${config.archiveUrl}">public record on GitHub</a>. Each entry carries a fingerprint (a SHA-256 hash) of the entry before it, so the entries form a chain. If anyone changed or deleted an old entry, every fingerprint after it would stop matching, and anyone holding a copy would see it.</p>
  <p>Once a day the newest fingerprint is stamped on the Bitcoin blockchain through <a href="https://opentimestamps.org/">OpenTimestamps</a>, which proves when each entry existed. Copies are also kept by <a href="https://www.softwareheritage.org/">Software Heritage</a>, a public archive of source code.</p>
  <p>To check it yourself: download the record and run its check, which needs nothing but Node.js.</p>
  <pre><code>git clone ${config.archiveUrl}.git
cd edock-news-archive
node scripts/verify.mjs</code></pre>
  <p>This site is built from that record, and refuses to build if the chain is broken.</p>

  <h2>Reporting a story</h2>
  <p>Every story has a Report link. You don't need to sign in. Reports go to the author and to the Edock team. A story is never taken down just because many people reported it: someone at Edock looks at it first, so a group cannot bury true news.</p>

  <h2>When a story comes down</h2>
  <p>An author can take their story off News, and Edock can hide a story that breaks the law or Edock's rules. Either way it leaves this site, but the public record keeps it, with a note saying who took it down and why. Nothing disappears without a trace.</p>

  <h2>Open source</h2>
  <p>The code that builds this site is <a href="${config.siteRepoUrl}">open source</a> under the MIT licence, and anyone can suggest changes. Nothing goes live until the Edock team has reviewed and merged it. The only script the site runs is Microsoft Clarity, which shows Edock how pages are read; apart from that it loads nothing from anywhere else.</p>

  <h2>Licences</h2>
  <p>Stories are shared under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>: you may republish them if you credit the author and link back. The site's code is MIT. The Edock name and logo are Edock's own.</p>
</article>`;
  return layout(config, {
    path: '/about/',
    title: 'How it works',
    description: 'How Edock News keeps every story and every edit on a public record that anyone can check.',
    body,
  });
}

export function notFoundPage(config) {
  const body = `<section class="notice">
  <h1>We couldn't find that page</h1>
  <p class="lede">It may have moved, or the address may be wrong.</p>
  <a class="pill" href="/">Latest stories</a>
</section>`;
  return layout(config, { path: '/404.html', title: 'Not found', body, noindex: true });
}

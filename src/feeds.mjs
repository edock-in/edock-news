/**
 * The machine-readable side of news.edock.io: an RSS feed for readers'
 * apps, a sitemap for search engines, a Google News sitemap of the last
 * two days, and robots.txt pointing at both.
 */

import { excerptOf } from './sanitize.mjs';

const xml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const newestFirst = (stories) =>
  stories
    .filter((s) => s.live)
    .sort((a, b) => Date.parse(b.first.first_published_at) - Date.parse(a.first.first_published_at));

export function rssFeed(config, stories) {
  const items = newestFirst(stories)
    .slice(0, 50)
    .map((story) => {
      const record = story.latest;
      const link = `${config.origin}/p/${record.slug}/`;
      return `<item><title>${xml(record.title)}</title><link>${xml(link)}</link><guid isPermaLink="true">${xml(link)}</guid><pubDate>${new Date(story.first.first_published_at).toUTCString()}</pubDate><dc:creator>${xml(record.author.name)}</dc:creator><description>${xml(excerptOf(record, 300))}</description>${(record.tags ?? []).map((t) => `<category>${xml(t)}</category>`).join('')}</item>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Edock News</title><link>${xml(config.origin)}/</link><atom:link href="${xml(config.origin)}/feed.xml" rel="self" type="application/rss+xml"/><description>Business news from the Edock community, kept on a public record.</description><language>en</language>${items}</channel></rss>\n`;
}

export function sitemap(config, stories) {
  const urls = [
    `<url><loc>${xml(config.origin)}/</loc></url>`,
    `<url><loc>${xml(config.origin)}/about/</loc></url>`,
    ...newestFirst(stories).map(
      (s) => `<url><loc>${xml(`${config.origin}/p/${s.latest.slug}/`)}</loc><lastmod>${xml(s.latest.saved_at)}</lastmod></url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>\n`;
}

/** Google News wants only stories first published in the last two days. */
export function newsSitemap(config, stories, now) {
  const since = now.getTime() - 2 * 24 * 60 * 60 * 1000;
  const urls = newestFirst(stories)
    .filter((s) => Date.parse(s.first.first_published_at) >= since)
    .slice(0, 1000)
    .map(
      (s) =>
        `<url><loc>${xml(`${config.origin}/p/${s.latest.slug}/`)}</loc><news:news><news:publication><news:name>Edock News</news:name><news:language>en</news:language></news:publication><news:publication_date>${xml(s.first.first_published_at)}</news:publication_date><news:title>${xml(s.latest.title)}</news:title></news:news></url>`,
    );
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${urls.join('')}</urlset>\n`;
}

export function robotsTxt(config) {
  return `User-agent: *\nAllow: /\nDisallow: /report/\n\nSitemap: ${config.origin}/sitemap.xml\nSitemap: ${config.origin}/news-sitemap.xml\n`;
}

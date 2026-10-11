/**
 * A story's body, made safe for news.edock.io.
 *
 * The backend already cleans every story before it is stored, but the site
 * does not lean on that: whatever the archive holds is cleaned again here
 * against a short list of tags. On top of that the pages run under a policy
 * that allows no scripts and no outside requests at all, so this is a second
 * lock, not the only one.
 *
 * What changes on the way:
 * - no style, class or id attributes; the site's own stylesheet decides looks
 * - a picture shows only if the archive holds a copy, served from this site;
 *   any other picture is left out, so no reader's browser is sent elsewhere
 * - a video becomes a link to it; an embedded post becomes a link to it
 * - links keep only http(s) and mailto addresses, and tell search engines
 *   they are the writer's, not ours
 */

import xss from 'xss';

const { FilterXSS } = xss;

const TEXT_TAGS = [
  'p', 'div', 'span', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'b', 'strong', 'i', 'em', 'u', 's',
  'strike', 'sub', 'sup', 'mark', 'small', 'br', 'hr', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
];

/** Each provider's own page for an embedded video or post. */
export const EMBED_LINKS = {
  youtube: { label: 'Watch on YouTube', href: (id) => `https://www.youtube.com/watch?v=${id}` },
  vimeo: { label: 'Watch on Vimeo', href: (id) => `https://vimeo.com/${id}` },
  x: { label: 'See the post on X', href: (id) => `https://x.com/i/status/${id}` },
  instagram: { label: 'See the post on Instagram', href: (id) => `https://www.instagram.com/p/${id}/` },
  tiktok: { label: 'Watch on TikTok', href: (id) => `https://www.tiktok.com/embed/v2/${id}` },
  linkedin: {
    label: 'See the post on LinkedIn',
    href: (id) => `https://www.linkedin.com/feed/update/urn:li:${id}/`,
  },
};

const EMBED_ID = /^[A-Za-z0-9:_-]{1,40}$/;
const LINK_REL = 'nofollow ugc noopener noreferrer';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attrsOf(tagSource) {
  const attrs = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = pattern.exec(tagSource)) !== null) {
    attrs[match[1].toLowerCase()] = (match[3] ?? match[4] ?? match[5] ?? '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }
  return attrs;
}

export function safeLink(href) {
  try {
    const url = new URL(href);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function linkParagraph(href, label) {
  return `<p class="embed"><a href="${escapeHtml(href)}" rel="${LINK_REL}">${escapeHtml(label)}</a></p>`;
}

/** Embedded posts and videos → a plain link to them. */
function replaceEmbeds(html) {
  return html.replace(/<div\b([^>]*\bdata-embed\s*=[^>]*)>[\s\S]*?<\/div>/gi, (_whole, attrSource) => {
    const attrs = attrsOf(attrSource);
    const provider = EMBED_LINKS[attrs['data-embed']];
    const id = attrs['data-embed-id'];
    if (!Object.hasOwn(EMBED_LINKS, attrs['data-embed'] ?? '') || !id || !EMBED_ID.test(id)) return '';
    return linkParagraph(provider.href(id), provider.label);
  });
}

/** Videos → a link to the file; a video's frame and its sources go. */
function replaceVideos(html) {
  return html.replace(/<video\b([^>]*)>([\s\S]*?)<\/video>|<video\b([^>]*)\/?>/gi, (_w, a1, _inner, a2) => {
    const href = safeLink(attrsOf(a1 ?? a2 ?? '').src ?? '');
    return href && href.startsWith('https:') ? linkParagraph(href, 'Watch the video') : '';
  });
}

/**
 * Clean a story's HTML. `media` maps a picture's original address to its
 * copy in the archive (`media/<hash>.<ext>`); `mediaBase` is where those
 * copies are served on this site.
 */
export function cleanStoryHtml(html, media = {}, mediaBase = '/') {
  const whiteList = { a: ['href'], img: ['src', 'alt', 'width', 'height'] };
  for (const tag of TEXT_TAGS) whiteList[tag] = [];
  // The one class a story may carry: the paragraph an embed became.
  whiteList.p = ['class'];

  const filter = new FilterXSS({
    whiteList,
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form'],
    allowCommentTag: false,
    onTagAttr(tag, name, value) {
      if (tag === 'p' && name === 'class') return value === 'embed' ? 'class="embed"' : '';
      return undefined;
    },
    onTag(tag, source, options) {
      if (options.isClosing) return undefined;
      if (tag === 'img') {
        const attrs = attrsOf(source);
        const copy = media[attrs.src];
        if (!copy) return '';
        const alt = attrs.alt ? ` alt="${escapeHtml(attrs.alt)}"` : ' alt=""';
        return `<img src="${escapeHtml(`${mediaBase}${copy}`)}"${alt} loading="lazy" decoding="async">`;
      }
      if (tag === 'a') {
        const href = safeLink(attrsOf(source).href ?? '');
        return href ? `<a href="${escapeHtml(href)}" rel="${LINK_REL}">` : '<a>';
      }
      return undefined;
    },
  });
  return filter.process(replaceVideos(replaceEmbeds(String(html ?? ''))));
}

/** A story's body as plain words, for descriptions and feeds. */
export function plainText(html) {
  return String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first `max` characters of a story's words, cut at a word. */
export function excerptOf(record, max = 200) {
  const text = record.subtitle?.trim() || plainText(record.content_html);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  // Cut at the last whole word: the one the limit falls in goes.
  const end = text[max - 1] === ' ' || cut.lastIndexOf(' ') <= 0 ? cut.length : cut.lastIndexOf(' ');
  return `${cut.slice(0, end).trimEnd()}…`;
}

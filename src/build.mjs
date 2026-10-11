/**
 * Build news.edock.io from a copy of the public archive.
 *
 *   node src/build.mjs --archive ../edock-news-archive --out dist
 *
 * Options:
 *   --archive <dir>  the archive checkout (edock-in/edock-news-archive)
 *   --out <dir>      where the site is written; emptied first
 *   --origin <url>   the site's address (default https://news.edock.io)
 *   --api <url>      where the Report form posts (default https://api.edock.io)
 *   --now <iso>      the time to build as (default now); only the news sitemap uses it
 *
 * The build stops, writing nothing, if the archive's chain is broken.
 */

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readArchive, storiesFrom } from './archive.mjs';
import {
  aboutPage,
  historyPage,
  homePage,
  notFoundPage,
  removedPage,
  reportOutcomePage,
  reportPage,
  REPORT_OUTCOMES,
  storyPage,
  versionPage,
} from './render.mjs';
import { newsSitemap, robotsTxt, rssFeed, sitemap } from './feeds.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const DEFAULTS = {
  origin: 'https://news.edock.io',
  api: 'https://api.edock.io',
  archiveUrl: 'https://github.com/edock-in/edock-news-archive',
  siteRepoUrl: 'https://github.com/edock-in/edock-news',
};

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith('--')) throw new Error(`Unexpected argument: ${flag}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
    options[flag.slice(2)] = value;
    i++;
  }
  if (!options.archive || !options.out) throw new Error('Usage: build.mjs --archive <dir> --out <dir>');
  return options;
}

async function write(out, relative, content) {
  const file = path.join(out, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

/** Build the whole site. Returns what was written, for the log. */
export async function build(options) {
  const archiveDir = path.resolve(options.archive);
  const out = path.resolve(options.out);
  const now = options.now ? new Date(options.now) : new Date();

  // Read and check first, so a broken archive leaves the last good build alone.
  const archive = await readArchive(archiveDir);
  const stories = storiesFrom(archive.entries);

  const css = await readFile(path.join(ROOT, 'src', 'site.css'));
  const cssHash = createHash('sha256').update(css).digest('hex').slice(0, 10);
  const config = {
    ...DEFAULTS,
    ...(options.origin ? { origin: options.origin.replace(/\/$/, '') } : {}),
    ...(options.api ? { api: options.api.replace(/\/$/, '') } : {}),
    cssPath: `/assets/site.${cssHash}.css`,
    mediaBase: '/',
    chain: { count: archive.count, head: archive.head },
  };

  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await write(out, `assets/site.${cssHash}.css`, css);
  await cp(path.join(ROOT, 'static'), out, { recursive: true });

  const pages = [];
  const page = async (relative, html) => {
    await write(out, relative, html);
    pages.push(relative);
  };

  await page('index.html', homePage(config, stories));
  await page('about/index.html', aboutPage(config));
  await page('404.html', notFoundPage(config));
  for (const outcome of Object.keys(REPORT_OUTCOMES)) {
    await page(`report/${outcome}/index.html`, reportOutcomePage(config, outcome));
  }

  const media = new Set();
  for (const story of stories) {
    const base = `p/${story.slug}`;
    if (story.live) {
      await page(`${base}/index.html`, storyPage(config, story));
      await page(`${base}/report/index.html`, reportPage(config, story));
      await page(`${base}/history/index.html`, historyPage(config, story));
      for (let i = 0; i < story.versions.length; i++) {
        await page(`${base}/v/${story.versions[i].version}/index.html`, versionPage(config, story, i));
        for (const file of story.versions[i].media ?? []) media.add(file);
      }
    } else {
      // Off the site: a note on what happened. Its words, pictures and
      // history are left to the public record.
      await page(`${base}/index.html`, removedPage(config, story));
    }
  }
  for (const file of media) {
    await mkdir(path.join(out, path.dirname(file)), { recursive: true });
    await cp(path.join(archiveDir, file), path.join(out, file));
  }

  await write(out, 'feed.xml', rssFeed(config, stories));
  await write(out, 'sitemap.xml', sitemap(config, stories));
  await write(out, 'news-sitemap.xml', newsSitemap(config, stories, now));
  await write(out, 'robots.txt', robotsTxt(config));
  await write(
    out,
    'record.json',
    `${JSON.stringify({ chain_lines: archive.count, chain_head: archive.head, stories: stories.length, live: stories.filter((s) => s.live).length, built_at: now.toISOString() }, null, 2)}\n`,
  );

  return { pages: pages.length, media: media.size, stories: stories.length, chain: archive.count };
}

/* node:coverage disable */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build(parseArgs(process.argv.slice(2)))
    .then((result) =>
      console.log(`Built ${result.pages} pages, ${result.media} pictures, ${result.stories} stories from ${result.chain} chain lines.`),
    )
    .catch((error) => {
      console.error(error.name === 'ArchiveError' ? `The public record failed its check: ${error.message}` : error);
      process.exit(1);
    });
}
/* node:coverage enable */

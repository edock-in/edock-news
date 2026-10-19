# Edock News

The code behind [news.edock.io](https://news.edock.io): business news from the
Edock community, where every story and every edit stays on a public record that
anyone can check.

## How it works

1. A writer on [Edock Blogs](https://blogs.edock.io) marks their story as News.
   Only the Edock team and members with a blue tick can.
2. Edock's server writes the story, and every later version of it, into the
   public record: [edock-in/edock-news-archive](https://github.com/edock-in/edock-news-archive).
   Each entry there carries the SHA-256 of the entry before it, so the entries
   form a chain. Change or remove an old one and every hash after it breaks.
3. Each time the record changes, this code turns it into plain web pages and
   puts them on news.edock.io.

This repository is step 3. It holds no secrets and talks to no database: the
only thing it reads is the public record.

## Promises the code keeps

- **No scripts on any page except Microsoft Clarity**, which measures how
  pages are read (scrolls, clicks, where people stop). Nothing else, ours or
  anyone else's. Pages also carry a policy telling the browser to refuse every
  other script.
- **Nothing loaded from elsewhere but Clarity.** Fonts, styles and pictures
  all come from news.edock.io itself. Pictures are the copies kept in the
  public record. Clarity's loader is a file on this site, and the page policy
  lets it reach clarity.ms and nowhere else.
- **No building from a broken record.** If any link in the chain does not
  match, the build stops and the site stays as it was.
- **Taken-down stories leave a note.** A withdrawn or hidden story is replaced
  by a note saying who took it down and why; the record keeps the rest.

`scripts/check-pages.mjs` checks the first two on every build, in CI and
again just before an upload.

## Run it yourself

You need Node.js 22.

```bash
npm ci
node scripts/make-sample-archive.mjs    # a small made-up record
npm run build:sample                    # pages into dist/
npm run serve                           # http://127.0.0.1:4173
```

To build from the real record, clone it next to this folder and run
`npm run build`:

```bash
git clone https://github.com/edock-in/edock-news-archive ../edock-news-archive
npm run build
```

`npm test` runs the tests, with coverage.

## What is where

| Path | What it does |
| --- | --- |
| `src/archive.mjs` | Reads the record and checks every link in the chain |
| `src/sanitize.mjs` | Cleans a story's HTML: no scripts, only the record's own pictures |
| `src/diff.mjs` | What changed between two versions, word by word |
| `src/render.mjs` | Every page, as HTML, and the page policy |
| `src/feeds.mjs` | RSS, sitemaps, robots.txt |
| `src/build.mjs` | Puts it all together |
| `src/serve.mjs` | A local server with the live site's headers |
| `src/site.css` | The one stylesheet |
| `static/clarity.js` | Clarity's loader, the one script on any page |
| `scripts/check-pages.mjs` | Fails a build whose pages break the promises above |

## Contributing

Suggestions and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
first. Nothing goes live until the Edock team has reviewed and merged it.

## Licence

The code is MIT. The stories are CC BY 4.0, in the record. The Edock name and
logo are Edock's own. See [LICENSE](LICENSE).

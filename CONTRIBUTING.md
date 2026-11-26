# Contributing to Edock News

**Edock News closed on 26 November 2026, and this code no longer runs.**
news.edock.io now forwards each story to the same story on
[Edock Blogs](https://blogs.edock.io). The code stays here as it was, and the
[public record](https://github.com/edock-in/edock-news-archive) stays public.

Pull requests are no longer merged. The rules below are kept as a record of
how the site was built.

## The rules

1. **No JavaScript on the pages but Microsoft Clarity.** Not a little, not
   from a CDN, not inline. The one script is `static/clarity.js`, Clarity's
   loader. The pages' own policy blocks anything else, and
   `scripts/check-pages.mjs` fails any build that adds it. Everything has to
   work as plain HTML and CSS.
2. **Nothing from another address.** No outside fonts, images, styles, frames,
   analytics or trackers, apart from Clarity.
3. **The record is the only source.** The site reads nothing but the public
   record. It never calls Edock's servers while building.
4. **Every line you change is tested.** `npm test` measures coverage; keep it
   where it is.
5. **New dependencies need a good reason.** Each one runs inside the deploy.
   Pin exact versions.

## How a change goes live

- Open a pull request against `develop`. CI runs the tests, builds the sample
  record and checks every page.
- Someone on the Edock team reviews it. Pull requests from forks never get
  access to anything that deploys.
- Edock merges `develop` into `main` when it releases. Only a push to `main`
  deploys news.edock.io.

## Found a security problem?

Please don't open an issue. See [SECURITY.md](SECURITY.md).

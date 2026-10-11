# Contributing to Edock News

Thank you for helping. A few rules keep news.edock.io safe and honest.

## The rules

1. **No JavaScript on the pages.** Not a little, not from a CDN, not inline.
   The pages' own policy blocks it, and `scripts/check-pages.mjs` fails any
   build that adds it. Everything has to work as plain HTML and CSS.
2. **Nothing from another address.** No outside fonts, images, styles, frames,
   analytics or trackers.
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

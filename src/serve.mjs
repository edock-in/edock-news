/**
 * Serve a built site locally, the way news.edock.io serves it:
 * `/p/<slug>/` answers with `/p/<slug>/index.html`, a missing page gets
 * 404.html, and every answer carries the same security headers as the
 * live site.
 *
 *   node src/serve.mjs dist 4173
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLARITY_SOURCES } from './render.mjs';

export const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
};

/** The headers the live site's CDN adds to every answer. */
export function securityHeaders(api = 'https://api.edock.io') {
  return {
    'Content-Security-Policy': `default-src 'none'; script-src 'self' ${CLARITY_SOURCES.script}; connect-src ${CLARITY_SOURCES.connect}; img-src 'self' ${CLARITY_SOURCES.img}; media-src 'self'; style-src 'self'; font-src 'self'; form-action 'self' ${new URL(api).origin}; base-uri 'none'; frame-ancestors 'none'`,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

/** Where a request path lives in the built site, or null if outside it. */
export function fileFor(root, urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(new URL(urlPath, 'http://x').pathname);
  } catch {
    return null;
  }
  if (clean.endsWith('/')) clean += 'index.html';
  const file = path.resolve(root, `.${clean}`);
  return file.startsWith(path.resolve(root) + path.sep) ? file : null;
}

export function handler(root, api) {
  const headers = securityHeaders(api);
  return async (req, res) => {
    const send = async (status, file) => {
      const type = { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' };
      const body = await readFile(file);
      // A video is read in pieces, as S3 and CloudFront serve it: Safari
      // plays nothing from a server that cannot send a range.
      const range = status === 200 ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '') : null;
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
        if (start > end || start >= body.length) {
          res.writeHead(416, { ...headers, 'Content-Range': `bytes */${body.length}` });
          return res.end();
        }
        res.writeHead(206, { ...headers, ...type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${body.length}` });
        return res.end(body.subarray(start, end + 1));
      }
      res.writeHead(status, { ...headers, ...type, ...(status === 200 ? { 'Accept-Ranges': 'bytes' } : {}) });
      res.end(body);
    };
    const file = fileFor(root, req.url ?? '/');
    try {
      if (file && (await stat(file)).isFile()) return await send(200, file);
    } catch {
      // Not there: try the folder's page, then the 404 page.
    }
    try {
      if (file && (await stat(path.join(file, 'index.html'))).isFile()) {
        res.writeHead(301, { ...headers, Location: `${req.url.replace(/\?.*$/, '')}/` });
        return res.end();
      }
    } catch {
      // Fall through.
    }
    return send(404, path.join(root, '404.html'));
  };
}

/* node:coverage disable */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? 'dist');
  const port = Number(process.argv[3] ?? 4173);
  createServer(handler(root, process.env.NEWS_API)).listen(port, '127.0.0.1', () => {
    console.log(`Edock News on http://127.0.0.1:${port}/ (from ${root})`);
  });
}
/* node:coverage enable */

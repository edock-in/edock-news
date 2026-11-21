/**
 * The reels stories were written from, copied onto news.edock.io at build
 * time.
 *
 * A record with a reel names the video's address on Edock's own storage, its
 * SHA-256 and its size (edock-backend `newsArchiveFormat.ts`, `reel`). The
 * video is far too big for the git record, so the build fetches it, but only
 * from Edock's media CDN (an allowlist, never any address a record names),
 * and keeps it only if its size and SHA-256 are exactly what the record says.
 * The page then plays this site's own copy. A video that cannot be fetched or
 * does not match is left out: the page shows the reel's poster and its link
 * instead, and the build carries on.
 *
 * Reels are gathered into a folder of their own before the site is written
 * (`--reel-cache`, which the deploy keeps between runs), so a reel already
 * checked once is never fetched again, and a slow or failed download never
 * leaves the site half written.
 */

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Where Edock's media CDN serves story reels from. */
export const REEL_HOSTS = ['d34afe9v4dkxkv.cloudfront.net'];
/** A reel bigger than this is not a reel; it is never downloaded. */
export const REEL_MAX_BYTES = 200 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;

/** Why a reel cannot be used, or null when its record entry is sound. */
export function reelProblem(reel, hosts = REEL_HOSTS) {
  if (!reel || typeof reel !== 'object') return 'no reel';
  if (typeof reel.sha256 !== 'string' || !SHA256.test(reel.sha256)) return 'no SHA-256';
  if (!Number.isInteger(reel.bytes) || reel.bytes <= 0 || reel.bytes > REEL_MAX_BYTES) return 'a bad size';
  let url;
  try {
    url = new URL(reel.url);
  } catch {
    return 'no address';
  }
  if (url.protocol !== 'https:' || !hosts.includes(url.host.toLowerCase())) {
    return `an address off Edock's media CDN (${url.host})`;
  }
  return null;
}

/** Where a checked reel lives on the site, named by its hash. */
export const reelPath = (sha256) => `media/reels/${sha256}.mp4`;

/**
 * Fetch one reel and check it against its record. The bytes, or null with
 * the reason when it cannot be had or is not the file the record names.
 */
export async function fetchReel(reel, { hosts = REEL_HOSTS, fetchImpl = fetch } = {}) {
  const problem = reelProblem(reel, hosts);
  if (problem) return { bytes: null, reason: problem };
  try {
    const response = await fetchImpl(reel.url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
    if (!response.ok) return { bytes: null, reason: `HTTP ${response.status}` };
    const declared = Number(response.headers.get('content-length') ?? reel.bytes);
    if (declared !== reel.bytes) return { bytes: null, reason: `${declared} bytes, the record says ${reel.bytes}` };
    // Read no more than the record says, whatever the server sends.
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body ?? []) {
      length += chunk.length;
      if (length > reel.bytes) return { bytes: null, reason: `more than the ${reel.bytes} bytes the record says` };
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    return checked(bytes, reel);
  } catch (error) {
    return { bytes: null, reason: error?.message ?? String(error) };
  }
}

/** The bytes when they are exactly the file the record names; else the reason. */
function checked(bytes, reel) {
  if (bytes.length !== reel.bytes) return { bytes: null, reason: `${bytes.length} bytes, the record says ${reel.bytes}` };
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== reel.sha256) return { bytes: null, reason: 'its SHA-256 does not match the record' };
  return { bytes, reason: null };
}

/** A copy already in the folder that still matches its record, or null. */
async function kept(file, reel) {
  try {
    return checked(await readFile(file), reel).bytes;
  } catch {
    return null;
  }
}

/**
 * Gather the reel of every live story's current version into `dir`, named
 * `<sha256>.mp4`: a copy already there is checked and kept, any other is
 * fetched. Returns the hashes that are ready, and a line for each reel that
 * is not, for the log. Never throws for a bad reel.
 */
export async function gatherReels(stories, dir, options = {}) {
  const ready = new Set();
  const skipped = [];
  await mkdir(dir, { recursive: true });
  for (const story of stories) {
    const reel = story.live ? story.latest?.reel : null;
    if (!reel || ready.has(reel.sha256)) continue;
    const problem = reelProblem(reel, options.hosts);
    if (problem) {
      skipped.push(`${story.slug}: ${problem}`);
      continue;
    }
    const file = path.join(dir, `${reel.sha256}.mp4`);
    if (await kept(file, reel)) {
      ready.add(reel.sha256);
      continue;
    }
    const { bytes, reason } = await fetchReel(reel, options);
    if (!bytes) {
      skipped.push(`${story.slug}: ${reason}`);
      continue;
    }
    // Written whole, then named, so an interrupted run leaves no half file.
    await writeFile(`${file}.part`, bytes);
    await rename(`${file}.part`, file);
    ready.add(reel.sha256);
  }
  return { ready, skipped };
}

/** Put the gathered reels on the site, at reelPath(hash). */
export async function placeReels(ready, dir, out) {
  for (const sha256 of ready) {
    const file = path.join(out, reelPath(sha256));
    await mkdir(path.dirname(file), { recursive: true });
    await copyFile(path.join(dir, `${sha256}.mp4`), file);
  }
}

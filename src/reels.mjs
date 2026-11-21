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
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
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
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== reel.bytes) return { bytes: null, reason: `${bytes.length} bytes, the record says ${reel.bytes}` };
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== reel.sha256) return { bytes: null, reason: 'its SHA-256 does not match the record' };
    return { bytes, reason: null };
  } catch (error) {
    return { bytes: null, reason: error?.message ?? String(error) };
  }
}

/**
 * Copy the reel of every live story's current version into `out`. Returns
 * the hashes that were copied (each is at reelPath(hash)), and a line for
 * each one that was not, for the log. Never throws for a bad reel.
 */
export async function copyReels(stories, out, options = {}) {
  const copied = new Set();
  const skipped = [];
  for (const story of stories) {
    const reel = story.live ? story.latest?.reel : null;
    if (!reel || copied.has(reel.sha256)) continue;
    const { bytes, reason } = await fetchReel(reel, options);
    if (!bytes) {
      skipped.push(`${story.slug}: ${reason}`);
      continue;
    }
    const file = path.join(out, reelPath(reel.sha256));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    copied.add(reel.sha256);
  }
  return { copied, skipped };
}

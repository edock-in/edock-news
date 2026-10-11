/**
 * Write the sample archive in test/fixtures/archive, so anyone can build and
 * look at the site without a copy of the real one:
 *
 *   node scripts/make-sample-archive.mjs && npm run build:sample && npm run serve
 */

import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeArchive, sampleEvents } from '../test/helpers/archive.mjs';

const dir = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'test', 'fixtures', 'archive');
await rm(dir, { recursive: true, force: true });
const { count } = await makeArchive(dir, sampleEvents());
console.log(`Wrote a sample archive of ${count} chain lines to ${dir}`);

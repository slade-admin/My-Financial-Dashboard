/**
 * scripts/load-env.ts
 *
 * Loads .env.local (then .env) for standalone scripts.
 *
 * `next dev` reads .env.local automatically, but tsx scripts do not, so
 * `npm run seed:demo` failed with "DATABASE_URL is required" even though the
 * URL was sitting in .env.local. This closes that gap without reintroducing a
 * hardcoded fallback connection string, which Phase 0 deliberately removed.
 *
 * Real environment variables win: anything already set is left untouched, so
 * `DATABASE_URL=... npm run seed:demo` still overrides the file.
 */
import fs from 'fs';
import path from 'path';

/** Minimal dotenv parse: KEY=VALUE, optional quotes, # comments, blank lines. */
function parse(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of contents.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length > 1) ||
      (val.startsWith("'") && val.endsWith("'") && val.length > 1)
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Populate process.env from .env.local then .env, without clobbering values
 * already present in the real environment. Returns the files it read.
 */
export function loadLocalEnv(cwd: string = process.cwd()): string[] {
  const loaded: string[] = [];
  for (const name of ['.env.local', '.env']) {
    const file = path.join(cwd, name);
    if (!fs.existsSync(file)) continue;
    const vars = parse(fs.readFileSync(file, 'utf8'));
    let used = false;
    for (const [k, v] of Object.entries(vars)) {
      if (process.env[k] === undefined || process.env[k] === '') {
        process.env[k] = v;
        used = true;
      }
    }
    if (used) loaded.push(name);
  }
  return loaded;
}

/** Mask the password in a connection string for safe logging. */
export function maskUrl(url: string): string {
  return url.replace(/:[^:@/]*@/, ':****@');
}

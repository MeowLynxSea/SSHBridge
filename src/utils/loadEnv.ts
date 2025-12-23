import * as fs from 'fs';
import * as path from 'path';

let loaded = false;

function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const equalsIndex = withoutExport.indexOf('=');
    if (equalsIndex <= 0) continue;

    const key = withoutExport.slice(0, equalsIndex).trim();
    if (!key) continue;

    let value = withoutExport.slice(equalsIndex + 1).trim();

    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) {
      value = value.slice(1, -1);
      value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }

    result[key] = value;
  }

  return result;
}

function getDotenvCandidates(nodeEnv: string): string[] {
  const mode = nodeEnv || 'development';

  // Align with common dotenv/Next.js precedence (without overriding existing env vars).
  // Note: Next.js skips `.env.local` for `test`; we follow that behavior.
  const includeLocal = mode !== 'test';
  return [`.env.${mode}.local`, ...(includeLocal ? ['.env.local'] : []), `.env.${mode}`, '.env'];
}

export function loadEnv(): void {
  if (loaded) return;

  // Server-only: avoid any chance of bundlers attempting to include fs in browser builds.
  if (typeof window !== 'undefined') return;

  const cwd = process.cwd();
  const candidates = getDotenvCandidates(process.env.NODE_ENV || '');

  for (const filename of candidates) {
    const filePath = path.join(cwd, filename);
    if (!fs.existsSync(filePath)) continue;

    try {
      const parsed = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
      for (const [key, value] of Object.entries(parsed)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    } catch (error) {
      console.warn(`[ENV] Failed to load ${filename}:`, error);
    }
  }

  loaded = true;
}

/**
 * Loads a prompt markdown file from the `prompts/` folder at module init, with
 * an embedded fallback so generation never breaks if the file is missing. In
 * the standalone/Docker build the files are bundled via `outputFileTracingIncludes`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadPrompt(file: string, fallback: string): string {
  // Try roots covering `next dev`, `next start`, and the standalone server.
  const candidates = [join(process.cwd(), 'prompts', file), join(process.cwd(), '..', 'prompts', file)];
  for (const path of candidates) {
    try {
      const text = readFileSync(path, 'utf8').trim();
      if (text) {
        console.info(`[prompt] Loaded ${file} (${text.length} chars).`);
        return text;
      }
    } catch {
      // try next candidate
    }
  }
  console.warn(`[prompt] Could not read prompts/${file}; using embedded fallback.`);
  return fallback;
}

/**
 * Robustly pull a JSON object out of a model response. Tolerates:
 *  - clean JSON
 *  - JSON wrapped in ```json ... ``` or ``` ... ``` fences
 *  - JSON surrounded by stray prose before/after
 *
 * Has no imports so it can be unit-tested directly under Node's native
 * TypeScript support.
 */
export function extractJson(raw: string): unknown {
  if (typeof raw !== 'string') {
    throw new Error('Model response was not text');
  }
  let text = raw.trim();

  // Prefer the contents of the first fenced block, if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    text = fence[1].trim();
  }

  // Fast path: the whole thing is valid JSON.
  try {
    return JSON.parse(text);
  } catch {
    // fall through to balanced-object scan
  }

  const slice = firstBalancedObject(text);
  if (slice === null) {
    throw new Error('No JSON object found in model response');
  }
  return JSON.parse(slice);
}

/**
 * Return the substring spanning the first balanced `{ ... }` object, ignoring
 * braces that appear inside strings. Returns null if none is found.
 */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

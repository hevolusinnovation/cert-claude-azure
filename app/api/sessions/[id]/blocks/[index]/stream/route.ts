import { type NextRequest } from 'next/server';
import { GenerationError, generateBlock, getApiKey } from '@/lib/anthropic';
import { currentUserId } from '@/lib/auth';
import { json } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { getSessionPlanItem, getStoredBlock, listSessionHistory, saveBlock } from '@/lib/sessions';
import type { DomainCode } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; index: string }> };

function clientIp(req: NextRequest): string {
  const f = req.headers.get('x-forwarded-for');
  if (f) return f.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * Server-Sent Events variant of the block endpoint: streams the question's
 * JSON text to the browser as Claude writes it (`delta` events), then a final
 * `complete` event with the validated, saved block. Cached blocks emit a single
 * `complete`. This makes generation feel near-instant — the user watches the
 * scenario and options appear instead of staring at a spinner.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const uid = await currentUserId();
  if (!uid) return json({ error: 'Not authenticated.', code: 'UNAUTHENTICATED' }, 401);

  const { id, index: indexStr } = await params;
  const index = Number(indexStr);
  if (!Number.isInteger(index) || index < 0) {
    return json({ error: 'Invalid block index.', code: 'BAD_REQUEST' }, 400);
  }

  const item = await getSessionPlanItem(id, uid, index);
  if (!item) return json({ error: 'Block not found.', code: 'NOT_FOUND' }, 404);

  const ip = clientIp(req);
  const encoder = new TextEncoder();
  // `closed` guards against the #1 SSE footgun: enqueuing after the client has
  // disconnected throws "Controller is already closed", and an unhandled throw
  // here crashes the Node process. We never let enqueue/close escape.
  let closed = false;
  req.signal.addEventListener('abort', () => {
    closed = true;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true; // consumer gone — stop sending, but keep generating so the block caches
        }
      };
      try {
        const stored = await getStoredBlock(id, index);
        if (stored) {
          console.info(`[block-stream] Cache hit { session: '${id}', index: ${index} }`);
          send('complete', { block: stored, cached: true });
          return;
        }
        if (!getApiKey()) {
          send('error', {
            error: 'ANTHROPIC_API_KEY is not configured on the server.',
            code: 'NO_API_KEY',
          });
          return;
        }
        const rl = rateLimit(ip);
        if (!rl.allowed) {
          send('error', {
            error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.`,
            code: 'RATE_LIMITED',
          });
          return;
        }

        console.info(
          `[block-stream] Generating { session: '${id}', index: ${index}, domain: '${item.domain}', count: ${item.count} }`,
        );
        const startedAt = Date.now();
        const history = await listSessionHistory(id);
        const block = await generateBlock(
          item.domain as DomainCode,
          item.count,
          history,
          (delta) => send('delta', { text: delta }),
        );
        // Persist regardless of whether the client is still listening, so a
        // dropped connection still results in a cached block for the retry.
        await saveBlock(id, index, item.domain as DomainCode, block);
        console.info(`[block-stream] Done { session: '${id}', index: ${index}, ms: ${Date.now() - startedAt} }`);
        send('complete', { block: { ...block, domain: item.domain }, cached: false });
      } catch (err) {
        const ge = err instanceof GenerationError ? err : null;
        if (ge) console.warn(`[block-stream] Failed { code: '${ge.code}', status: ${ge.status} }`);
        else console.error('[block-stream] Unexpected error', err);
        send('error', { error: ge?.message ?? 'Unexpected server error.', code: ge?.code ?? 'INTERNAL' });
      } finally {
        if (!closed) {
          try {
            controller.close();
          } catch {
            // already closed — ignore
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

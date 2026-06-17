/**
 * Per-domain reference material appended to the exam system prompt.
 *
 * The base system prompt (prompts/cca-foundations-system-prompt.md) is generic
 * across all five domains. To keep generated questions *inherent to the domain
 * currently being analyzed*, we append a domain-specific brief as a SECOND
 * system block on every generation. This grounds the scenario, the decision
 * under test, and the distractors in that domain's real technical material —
 * not just a one-line "test domain X" instruction in the user message.
 *
 * Caching: anthropic.ts sends the base prompt as the first cached system block
 * (a stable prefix shared across ALL domains) and the brief below as a second
 * cached block. A full mock generates blocks grouped by domain, so the brief's
 * cache holds across the consecutive same-domain calls; only the per-domain
 * boundary writes a fresh brief cache. See lib/anthropic.ts.
 */
import type { DomainCode } from './types';

const HEADER = (name: string) =>
  `# Domain reference material — ${name}

Anchor THIS block's scenario, the decision under test, and the distractors in the concepts below. The correct answer and every distractor must turn on a mechanism that lives in this domain — do not drift into another domain's topic. Use this material to build kernel-of-truth distractors (genuine practices misapplied), not invented mechanisms.`;

const D1 = `${HEADER('Agentic Architecture & Orchestration')}

Core concepts to draw scenarios and decisions from:
- The agent loop: gather context → take action (tools) → verify the work → repeat. Failures usually trace to a missing or weak verification step, an unbounded loop, or context the loop never gathered.
- Single-agent vs. multi-agent (orchestrator–worker). Multi-agent buys parallelism and context isolation but costs tokens, latency, and coordination overhead. It is the WRONG call when subtasks share mutable state or are strictly sequential — those belong in one agent or a pipeline.
- Sub-agent delegation: each sub-agent has its own context window. The orchestrator must pass enough context in the delegated task (sub-agents do not see the parent's conversation) and reconcile/verify what comes back. A classic failure: trusting a sub-agent's findings without independent verification.
- Control flow & recovery: retries with backoff, idempotent actions, verification gates between steps, and graceful degradation. "Just retry the whole loop" stacks latency and can re-run side effects.
- Fan-out vs. pipeline: parallel fan-out when items are independent (a barrier collects all results); a pipeline when each item flows through stages with no cross-item dependency. Choosing a barrier where a pipeline fits wastes wall-clock on the slowest item.
- When NOT to build an agent: if the task is fully specifiable up front (extract a field, classify), a single call or a code-orchestrated workflow beats an open-ended agent on cost, latency, and determinism.

Diagnostic fingerprints to seed scenarios: "drift correlates with trajectory length" (context not being managed / no compaction), "failures only on the second sub-agent's output" (unverified handoff), "the loop never terminates on ambiguous input" (missing terminal condition), "cost scales super-linearly with task size" (multi-agent where a pipeline would do).`;

const D2 = `${HEADER('Tool Design & MCP Integration')}

Core concepts to draw scenarios and decisions from:
- Tool schema scoping: a tool's description and JSON Schema are how the model decides WHEN and HOW to call it. Descriptions should be prescriptive about the trigger ("Call this when…"), not just what the tool does. Over-broad tools and vague descriptions cause mis-selection and malformed arguments.
- Bash vs. dedicated tools: bash gives the model breadth but the harness only sees an opaque command string — it cannot gate, render, audit, or parallelize it. Promote an action to a dedicated tool when you need a security gate (hard-to-reverse actions), a staleness check (reject an edit if the file changed), custom rendering, or parallel-safe scheduling.
- Tool results are tokens: large/verbose results burn context. Return the minimum useful payload; offload or summarize large outputs. Programmatic tool calling keeps big intermediate results out of the model's context entirely.
- Consolidating vs. splitting tools: too many near-duplicate tools confuse selection; one over-loaded tool with a mode flag hides intent. Keep the set focused and each tool single-purpose.
- Error handling: a tool result should report failure as a useful message (is_error) so the model can adapt, not a stack trace or silent empty result.
- MCP integration: MCP servers expose third-party capabilities over a standard protocol (stdio or Streamable HTTP). Security boundary matters most — tool results from an MCP server are untrusted input and a prompt-injection vector; credentials belong outside the model's reach (e.g. a vault / proxy that injects auth at egress), never in the prompt. Namespacing avoids tool-name collisions across servers.

Diagnostic fingerprints: "the model keeps calling the wrong tool" (schema/description scoping), "an edit clobbered a concurrent change" (needed a staleness-checking dedicated tool, not bash), "context fills with raw tool output" (result not scoped / should be offloaded), "a tool result contained instructions the agent followed" (MCP/tool-result prompt injection across a trust boundary).`;

const D3 = `${HEADER('Claude Code Configuration & Workflows')}

Core concepts to draw scenarios and decisions from:
- Claude Code configuration surfaces: CLAUDE.md project memory, settings.json (with a precedence order across enterprise / user / project / local scopes), hooks (shell commands the harness runs on lifecycle events — the harness executes them, not the model), slash commands, sub-agents, permission/allow rules, and MCP server config. Prefer architectural-judgment questions over memorized exact file paths or flag names.
- Dependable engineering workflows: give the full task spec up front, use verification gates (tests, review) before claiming done, isolate risky work (e.g. a worktree/branch), and prefer the simplest tier that meets the need.
- Programmatic Claude Code = the Claude Agent SDK; lower-level building blocks = the Claude API (Anthropic SDK). Knowing which surface fits a job is a core competency: a single Messages API call for a bounded transform, the Agent SDK when you want Claude to drive a multi-step coding loop with tools/permissions.

## Claude SDK / API code examples (TypeScript)

### A. Claude Agent SDK — programmatic Claude-Code-style agent
\`\`\`ts
import { query } from "@anthropic-ai/claude-agent-sdk";

// query() drives the full agent loop (read/edit/bash tools, permissions) and
// yields a stream of messages. Use it when Claude should plan and act over
// multiple steps, not answer one prompt.
const run = query({
  prompt: "Add a /health route to the Express app and a test for it.",
  options: {
    model: "claude-opus-4-8",
    permissionMode: "acceptEdits",        // gate writes; or "default" to confirm
    allowedTools: ["Read", "Edit", "Bash"],
  },
});

for await (const msg of run) {
  if (msg.type === "assistant") {
    for (const block of msg.message.content) {
      if (block.type === "text") process.stdout.write(block.text);
    }
  } else if (msg.type === "result") {
    console.log("\\n[done]", msg.subtype, "cost:", msg.total_cost_usd);
  }
}
\`\`\`

### B. Claude API (Anthropic SDK) — single structured-output call
\`\`\`ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const res = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  // Structured outputs guarantee schema-valid JSON (no parse-retry loop).
  output_config: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { summary: { type: "string" }, risk: { type: "string", enum: ["low", "high"] } },
        required: ["summary", "risk"],
      },
    },
  },
  messages: [{ role: "user", content: "Summarize this PR and rate its risk." }],
});
\`\`\`

### C. Claude API — streaming with a stable cached system prefix
\`\`\`ts
// Stream for long/high-max_tokens calls so they can't hit the request timeout,
// and cache the (byte-stable) system prompt so later calls skip reprocessing it.
const stream = client.messages.stream({
  model: "claude-opus-4-8",
  max_tokens: 8000,
  thinking: { type: "adaptive" },           // adaptive thinking on Opus 4.x
  system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: userTask }],
});
stream.on("text", (delta) => process.stdout.write(delta));
const final = await stream.finalMessage();
\`\`\`

Diagnostic fingerprints: "a 'from now on, on every save…' requirement can't be met by memory/prompt" (needs a hook the harness runs, not an instruction to the model), "the wrong settings scope won" (precedence), "an open-ended Agent SDK loop was used where one Messages API call would do" (wrong surface for a bounded task), "JSON output occasionally fails to parse" (should use structured outputs / output_config.format).`;

const D4 = `${HEADER('Prompt Engineering & Structured Output')}

Core concepts to draw scenarios and decisions from:
- Prompt structure & salience: position is a salience lever, not a precedence mechanism. Stable, reusable content goes at the FRONT (so it can be cached); volatile, per-request content goes at the END. Long documents placed "at the top" can wreck prompt-cache hits if they vary.
- Prompt caching is a prefix match: any byte change anywhere in the prefix invalidates everything after it. Silent invalidators — a timestamp or UUID in the system prompt, non-deterministic JSON key order, a varying tool set — drop the hit rate to zero. Verify via cache_read_input_tokens.
- Structured output: prefer output_config.format with a JSON Schema (or strict tool use) over asking for JSON in prose, which is brittle. Schemas cannot use every JSON Schema feature (no recursion, limited numeric/length constraints); additionalProperties:false is required on objects.
- Being explicit: state the mechanism and the format you want; use examples for format, enums for fixed label sets. On recent models, aggressive "CRITICAL: YOU MUST" language overtriggers — dial it back.
- Output-shaping tradeoffs: structured decoding adds constrained-decoding latency on nested schemas; assistant prefills are removed on recent models (use structured outputs instead).

Diagnostic fingerprints: "cache hit rate dropped to zero after a 'harmless' change" (silent prefix invalidator), "the model emits JSON 95% of the time" (should constrain with a schema), "moving the long doc to the top fixed quality but tripled cost" (salience vs. cache-position tradeoff), "an instruction overtriggers a behavior" (over-aggressive prompt language).`;

const D5 = `${HEADER('Context Management & Reliability')}

Core concepts to draw scenarios and decisions from:
- The context window is finite: long-running loops degrade as stale tool results and completed thinking pile up. Symptoms (drift, repetition, forgetting earlier constraints) correlate with trajectory length.
- Compaction vs. context editing: compaction SUMMARIZES earlier context into a block when you near the limit — and you MUST append the response content (including the compaction block) back, or the summarized state is silently lost. Context editing PRUNES stale tool results/thinking by threshold without summarizing. They compose; memory (cross-session persistence) is a third, separate tool.
- Prompt caching for long context: a stable prefix served from cache cuts latency and cost on every turn; the long-context premium and the prefix-match invariant both matter for reliability and budget.
- Reliability patterns: idempotent actions (so a retry is safe), bounded retries with backoff, hard wall-clock timeouts with clean retryable errors (instead of hanging), and handling stop_reason — max_tokens (truncated output, raise/stream) vs. model_context_window_exceeded (compact or split) vs. refusal.
- Token budgeting: max_tokens is an enforced per-response ceiling the model is unaware of; a task budget (where supported) is a countdown the model sees and self-moderates against. Lowballing max_tokens truncates mid-thought.

Diagnostic fingerprints: "quality decays only deep into long sessions" (no compaction/context editing), "summarized state vanished after a turn" (compaction block not appended back), "the call hangs forever" (no wall-clock timeout), "output is cut off mid-sentence" (max_tokens vs. context-window-exceeded — different fixes).`;

const BRIEFS: Record<DomainCode, string> = { D1, D2, D3, D4, D5 };

/** Domain-specific reference material to append as a second system block. */
export function domainBrief(domain: DomainCode): string {
  return BRIEFS[domain];
}

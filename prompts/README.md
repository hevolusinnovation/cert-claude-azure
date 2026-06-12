# Prompts

Source-of-truth prompt text used by the question generator.

| File | Role |
| ---- | ---- |
| [`cca-foundations-system-prompt.md`](cca-foundations-system-prompt.md) | **Operational.** Loaded at runtime and sent as the `system` prompt on every `/api/generate-block` call. Includes the JSON adapter that constrains the model to emit one machine-readable scenario block. Edit this to change how questions are generated. |
| [`cca-foundations-exam-simulator.md`](cca-foundations-exam-simulator.md) | **Reference.** The original chat-style simulator prompt the app is modeled on (one-question-at-a-time interaction protocol, verdicts, running score). The web UI implements that protocol, so the app does not send this verbatim. |

The operational prompt is read by [`lib/exam-prompt.ts`](../lib/exam-prompt.ts) via `fs` at module load, with an embedded fallback copy so generation never breaks if the file is missing. In the standalone/Docker build it is bundled through `outputFileTracingIncludes` in [`next.config.mjs`](../next.config.mjs).

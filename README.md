# CCA Exam Simulator

A live, scenario-based practice-exam platform for the **Claude Certified Architect (CCA) Foundations** exam. Every question is generated on demand by Claude, anchored to a realistic production scenario, and explained option by option.

Built with Next.js (App Router) + TypeScript. All Claude API calls happen server-side; the browser never sees your key.

> **Honesty disclaimer.** These are **original approximations of the exam's published _format_** — not leaked or reproduced exam content. Question style, difficulty, and structure are modeled on the public description of the exam. Always verify the current format on Anthropic's official certification pages.

![screenshot placeholder](docs/screenshot.png)

---

## Bring your own API key

**This repo ships with no API key, and any fork should too.** Each developer or student who clones it supplies their own:

1. Create a key at [console.anthropic.com](https://console.anthropic.com) (Settings → API Keys).
2. Provide it in **your own** environment — locally in `.env.local`, or in your hosting dashboard's environment variables.

The key is read only inside the server-side API route (`app/api/generate-block/route.ts`), via the `ANTHROPIC_API_KEY` environment variable. It is never bundled into client JavaScript, never logged, and `.gitignore` keeps `.env*` files (except `.env.example`) out of git.

If the key is missing at request time, the app shows a friendly setup screen explaining exactly how to configure it — it does not crash.

---

## Local setup

```bash
npm install
cp .env.example .env.local      # then edit .env.local and set ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000.

`.env.example` also defines `ANTHROPIC_MODEL` (default `claude-sonnet-4-6`); override it to use a different model (e.g. `claude-opus-4-8`).

---

## Deploy to Vercel

This app needs a **Node server runtime** — it cannot be hosted on GitHub Pages or any static-only host, because the question-generation endpoint runs server-side.

1. Push your fork to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. In **Project → Settings → Environment Variables**, add `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`).
3. Deploy. Redeploy after changing env vars.

Other Node hosts (Netlify, Railway, Render, a Docker container, etc.) work the same way — set the same environment variable.

---

## How it works

- Choose a **Full mock** (60 questions, weighted toward Domain 1, 120-minute timer) or a **Single domain** set (12 questions).
- Questions are generated in scenario blocks of 4–6. The frontend requests one block at a time and **prefetches the next** while you answer, so there's no visible wait after the first block.
- Each question gives an immediate verdict, an explanation of all four options, and a running score (overall + per domain).
- Results show a per-domain breakdown, an estimated scaled score (a simple linear estimate on the 100–1,000 scale vs. the ~720 pass bar), and the weakest domains to re-drill.
- Progress is saved to `localStorage`, so a refresh won't lose your place. The server stays stateless.

### Domains and full-mock weighting

| Code | Domain                                  | Questions |
| ---- | --------------------------------------- | --------- |
| D1   | Agentic Architecture & Orchestration    | 18        |
| D2   | Tool Design & MCP Integration           | 12        |
| D3   | Claude Code Configuration & Workflows   | 10        |
| D4   | Prompt Engineering & Structured Output  | 10        |
| D5   | Context Management & Reliability        | 10        |

---

## Cost

Questions are generated live, so each session uses Claude API tokens billed to **your** key. A full 60-question mock is roughly a few dozen cents of usage, depending on the model (`claude-sonnet-4-6` by default; Opus-tier models cost more). Single-domain sets cost proportionally less.

## Rate limiting

The API route applies a simple in-memory, per-IP limit (10 block-generations per minute) so a publicly deployed instance doesn't drain your key from a single client. This state lives in the server process's memory: it resets on redeploy and is **not** shared across multiple instances/regions. For serious multi-instance traffic, swap it for a durable store (e.g. Redis/Upstash) — see `lib/rate-limit.ts`.

---

## Scripts

| Command         | What it does                                                    |
| --------------- | --------------------------------------------------------------- |
| `npm run dev`   | Start the dev server                                            |
| `npm run build` | Production build                                                |
| `npm start`     | Run the production build                                        |
| `npm run lint`  | Lint                                                            |
| `npm test`      | Run the lightweight unit tests (JSON extractor, validators, generate flow) |

The tests run TypeScript source directly via Node's native type stripping (Node ≥ 23.6; CI pins Node 24).

---

## Project layout

```
app/
  api/generate-block/route.ts  # server-only: validates, rate-limits, calls Claude
  page.tsx                     # landing page
  exam/page.tsx                # exam runner
lib/
  exam-prompt.ts               # the generation system prompt (verbatim) + JSON adapter
  anthropic.ts                 # server-only Claude client + generate/retry logic
  json-extract.ts              # robust JSON extraction
  validate.ts                  # block schema validation
  request-validation.ts        # request-body validation
  rate-limit.ts                # in-memory per-IP limiter
  domains.ts, score.ts, types.ts, storage.ts
components/                    # client UI (exam runner, results, setup screen, …)
scripts/test.mjs               # lightweight test runner
```

## License

MIT — see [LICENSE](LICENSE).

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

The key is read only inside the server-side generation route (`app/api/sessions/[id]/blocks/[index]/route.ts`), via the `ANTHROPIC_API_KEY` environment variable. It is never bundled into client JavaScript, never logged, and `.gitignore` keeps `.env*` files (except `.env.example`) out of git.

If the key is missing at request time, the app shows a friendly setup screen explaining exactly how to configure it — it does not crash.

---

## Local setup

The app now persists accounts, exam sessions, generated questions, and score history in **Postgres**. The easiest path is to run Postgres via Docker and the app with `npm run dev`:

```bash
npm install
cp .env.example .env.local      # set ANTHROPIC_API_KEY and AUTH_SECRET
make db                         # start only Postgres (docker compose up -d db)
npm run dev
```

Open http://localhost:3000, create an account, and start an exam.

Required environment (`.env.local`):

- `ANTHROPIC_API_KEY` — your key (server-side only; never sent to the browser).
- `AUTH_SECRET` — secret for signing the session cookie. Generate one with `openssl rand -hex 32`.
- `DATABASE_URL` — Postgres connection string. The default `postgres://cca:cca@localhost:5432/cca` matches the bundled `make db` service.
- `ANTHROPIC_MODEL` _(optional)_ — model used to generate questions (default `claude-sonnet-4-6`; e.g. `claude-opus-4-8`).
- `ANTHROPIC_TIMEOUT_MS` _(optional)_ — per-generation timeout (default 120000).

The schema is created automatically on first use (`CREATE TABLE IF NOT EXISTS`), so there's no separate migration step.

---

## Accounts, saved exams & AI coach

- **Accounts.** A lightweight username/password login (passwords hashed with scrypt, session in a signed httpOnly cookie). It is intentionally minimal — enough to scope your exams to you on a locally-run instance.
- **Saved & resumable sessions.** Every exam is a row keyed by a UUID. Generated scenario blocks (questions, correct answers, explanations) are stored as they're produced, so **pausing and resuming never regenerates them** — you don't pay tokens twice. Resume from the **profile page**.
- **Score history.** Overall and per-domain scores are snapshotted when an exam finishes, powering the profile stats.
- **AI performance coach.** On the profile page, Claude reads your aggregated stats and returns a coaching report — verdict vs the 720 bar, weakest domains with concrete sub-topics to drill, and a short study plan.

---

## Deploy to Vercel

This app needs a **Node server runtime** — it cannot be hosted on GitHub Pages or any static-only host, because the question-generation endpoint runs server-side.

1. Push your fork to GitHub and import it at [vercel.com/new](https://vercel.com/new).
2. Provision a serverless Postgres (e.g. [Neon](https://neon.tech)) and copy its connection string.
3. In **Project → Settings → Environment Variables**, add `ANTHROPIC_API_KEY`, `AUTH_SECRET`, and `DATABASE_URL` (and optionally `ANTHROPIC_MODEL`).
4. Deploy. Redeploy after changing env vars.

Other Node hosts (Netlify, Railway, Render, etc.) work the same way — set the same environment variables and point `DATABASE_URL` at a reachable Postgres.

---

## Run with Docker

The app ships with a multi-stage `Dockerfile` that builds Next.js in [standalone mode](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) for a small runtime image, plus a `docker-compose.yml`.

### With Docker Compose (recommended)

Compose runs both the app **and** a Postgres service (with a persistent volume), wired together automatically.

```bash
cp .env.example .env.local      # set ANTHROPIC_API_KEY and AUTH_SECRET
docker compose up --build -d    # or: make up
```

Open http://localhost:3000. Tail logs with `make logs`, open a DB shell with `make db-shell`, stop with `make down`. `make db-reset` drops the data volume (wiping all accounts and sessions).

### With plain Docker

```bash
docker build -t cca-exam-simulator .          # or: make docker-build
docker run --rm -p 3000:3000 \
  --env-file .env.local cca-exam-simulator     # or: make docker-run
```

The key is passed in at **runtime** via `--env-file` / Compose `env_file` — it is never baked into the image. The container runs as an unprivileged `nextjs` user.

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

## Make commands

A `Makefile` wraps the npm scripts plus the Docker workflow. Run `make help` (the default target) to list everything.

### Local (Node)

| Command        | What it does                                  |
| -------------- | --------------------------------------------- |
| `make install` | Install npm dependencies                      |
| `make dev`     | Start the dev server (http://localhost:3000)  |
| `make build`   | Production build                              |
| `make start`   | Run the production build                      |
| `make lint`    | Lint the codebase                             |
| `make test`    | Run the unit tests                            |

### Docker (raw)

| Command             | What it does                                               |
| ------------------- | --------------------------------------------------------- |
| `make docker-build` | Build the production Docker image                         |
| `make docker-run`   | Run the image (reads `.env.local` for `ANTHROPIC_API_KEY`) |
| `make docker-stop`  | Stop the running container                                |
| `make docker-logs`  | Tail logs from the running container                      |

### Docker Compose

| Command     | What it does                                  |
| ----------- | --------------------------------------------- |
| `make up`   | Build and start via docker compose (detached) |
| `make down` | Stop and remove compose services              |
| `make logs` | Tail compose logs                             |

### Housekeeping

| Command      | What it does                                            |
| ------------ | ------------------------------------------------------- |
| `make help`  | Show all available targets                              |
| `make clean` | Remove build artifacts (`.next`, `node_modules/.cache`) |

Override the image name, container name, or port via variables, e.g. `make docker-run PORT=8080`.

---

## Project layout

```text
app/
  api/auth/{register,login,logout,me}/route.ts  # username/password auth
  api/sessions/route.ts                          # create / list exam sessions
  api/sessions/[id]/route.ts                     # load (resume) / autosave progress
  api/sessions/[id]/blocks/[index]/route.ts      # get-or-generate a block (cached → no tokens)
  api/stats/interpretation/route.ts              # AI performance coach
  page.tsx                     # landing page (auth-aware)
  login/, register/, profile/  # auth pages + profile (sessions, stats, coach)
  exam/page.tsx                # exam runner
prompts/
  cca-foundations-system-prompt.md   # operational system prompt (loaded at runtime)
  cca-foundations-exam-simulator.md  # original chat-style prompt (reference)
  coach-system-prompt.md             # AI coach system prompt
lib/
  db.ts                        # Postgres pool + idempotent schema bootstrap
  auth.ts                      # scrypt hashing + signed session cookie
  users.ts, sessions.ts        # user / exam-session / block persistence
  anthropic.ts                 # server-only Claude client + generate/retry/logging
  coach.ts                     # AI interpretation of performance stats
  exam-prompt.ts, load-prompt.ts     # prompt loading (fs + fallback)
  json-extract.ts, validate.ts, request-validation.ts, rate-limit.ts, http.ts
  domains.ts, score.ts, types.ts
components/                    # client UI (exam runner, results, profile, auth, …)
scripts/test.mjs               # lightweight test runner
```

## License

MIT — see [LICENSE](LICENSE).

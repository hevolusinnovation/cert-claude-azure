# Contributing

Thanks for helping improve the CCA Exam Simulator.

## Ground rules

- **Never commit an API key or `.env*` file** (other than `.env.example`). `.gitignore` already excludes them — keep it that way.
- **Keep all Claude API calls server-side.** The key must never reach the client bundle. New model calls belong in `app/api/**` or `lib/anthropic.ts`, not in client components.
- **Only original questions.** Don't add real or memorized exam content. The simulator approximates the published _format_ only.

## Getting started

```bash
npm install
cp .env.example .env.local   # set ANTHROPIC_API_KEY
npm run dev
```

## Before opening a PR

Run all three checks locally — CI runs the same:

```bash
npm test
npm run lint
npm run build
```

## Where things live

- Generation prompt: `lib/exam-prompt.ts`
- Server generate/retry logic: `lib/anthropic.ts`
- Parsing/validation (unit-tested): `lib/json-extract.ts`, `lib/validate.ts`, `lib/request-validation.ts`
- UI: `components/`, `app/`

When changing parsing or validation, add a case to `scripts/test.mjs`.

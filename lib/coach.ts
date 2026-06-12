/**
 * AI interpretation of a candidate's performance statistics. Given the
 * aggregated stats it asks Claude for a coaching report: verdict, weakest
 * domains with concrete sub-topics to drill, and a short study plan.
 *
 * Reuses the same model config and error mapping as question generation.
 */
import Anthropic from '@anthropic-ai/sdk';
import { GenerationError, getApiKey, mapUpstreamError } from './anthropic';
import { DOMAINS } from './domains';
import { loadPrompt } from './load-prompt';
import type { DomainCode, UserStats } from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const COACH_FALLBACK = `You are a study coach for the Claude Certified Architect (CCA) Foundations exam (60 questions, scaled 100–1,000, pass mark 720). Given a JSON object of a candidate's aggregated practice statistics (overall pass/score stats, per-domain correct/total tallies, and a chronological trend), write a concise Markdown coaching report in English with: a one-line verdict vs the 720 bar and trend; the 2–3 weakest domains ranked with specific sub-topics to drill; which domains are solid; and a 3-step prioritised study plan. Be quantitative, honest, and specific. If there is too little data, say so. Output only the Markdown report.`;

const COACH_SYSTEM_PROMPT = loadPrompt('coach-system-prompt.md', COACH_FALLBACK);

function statsForModel(stats: UserStats) {
  const perDomain = (Object.keys(stats.perDomain) as DomainCode[]).map((code) => {
    const s = stats.perDomain[code]!;
    const info = DOMAINS.find((d) => d.code === code);
    return {
      code,
      name: info?.name ?? code,
      scope: info?.blurb ?? '',
      correct: s.correct,
      total: s.total,
      accuracyPct: s.total > 0 ? Math.round((s.correct / s.total) * 100) : null,
    };
  });
  return {
    passBar: 720,
    finishedExams: stats.finishedSessions,
    passedExams: stats.passedCount,
    averageScaledScore: stats.avgScaled,
    bestScaledScore: stats.bestScaled,
    perDomain,
    scaledScoreTrend: stats.trend.map((t) => t.scaled),
  };
}

/** Returns a Markdown coaching report. Throws GenerationError on API trouble. */
export async function interpretStats(stats: UserStats): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new GenerationError('ANTHROPIC_API_KEY is not configured', 500, 'NO_API_KEY');
  }

  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const payload = JSON.stringify(statsForModel(stats), null, 2);

  console.info(
    `[coach] Interpreting stats { model: '${model}', finished: ${stats.finishedSessions} }`,
  );

  let response;
  try {
    response = await client.messages.create(
      {
        model,
        max_tokens: 2000,
        system: COACH_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Here are my practice statistics. Interpret them and tell me what to improve.\n\n${payload}`,
          },
        ],
      },
      { timeout: 60_000 },
    );
  } catch (err) {
    throw mapUpstreamError(err);
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  if (!text) {
    throw new GenerationError('The model returned an empty interpretation.', 502, 'BAD_MODEL_OUTPUT');
  }
  return text;
}

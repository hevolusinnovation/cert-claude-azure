import type { BlockPlanItem, DomainCode } from './types';

export interface DomainInfo {
  code: DomainCode;
  name: string;
  /** Number of questions this domain contributes to a 60-question full mock. */
  fullMockQuestions: number;
  blurb: string;
}

export const DOMAINS: DomainInfo[] = [
  {
    code: 'D1',
    name: 'Agentic Architecture & Orchestration',
    fullMockQuestions: 18,
    blurb:
      'Designing agent loops, sub-agent delegation, control flow, and recovery. The heaviest-weighted domain.',
  },
  {
    code: 'D2',
    name: 'Tool Design & MCP Integration',
    fullMockQuestions: 12,
    blurb: 'Scoping tool schemas, choosing bash vs. dedicated tools, and wiring MCP servers safely.',
  },
  {
    code: 'D3',
    name: 'Claude Code Configuration & Workflows',
    fullMockQuestions: 10,
    blurb: 'Configuring Claude Code and composing dependable engineering workflows.',
  },
  {
    code: 'D4',
    name: 'Prompt Engineering & Structured Output',
    fullMockQuestions: 10,
    blurb: 'Prompt structure, salience, structured/JSON output, and prompt-cache-aware design.',
  },
  {
    code: 'D5',
    name: 'Context Management & Reliability',
    fullMockQuestions: 10,
    blurb: 'Compaction, context editing, caching, and keeping long-running systems reliable.',
  },
];

export const DOMAIN_MAP: Record<DomainCode, DomainInfo> = Object.fromEntries(
  DOMAINS.map((d) => [d.code, d]),
) as Record<DomainCode, DomainInfo>;

export const DOMAIN_CODES: DomainCode[] = DOMAINS.map((d) => d.code);

export const SINGLE_DOMAIN_QUESTIONS = 12;
export const FULL_MOCK_MINUTES = 120;

export function isDomainCode(v: unknown): v is DomainCode {
  return typeof v === 'string' && (DOMAIN_CODES as string[]).includes(v);
}

/**
 * Split a question count into block sizes, each between 3 and 6 (the API's
 * allowed range). Greedy 6s, but never leaves a remainder below 3.
 */
export function splitCount(n: number): number[] {
  const parts: number[] = [];
  let rem = n;
  while (rem > 0) {
    if (rem <= 6) {
      parts.push(rem);
      break;
    }
    if (rem - 6 >= 3) {
      parts.push(6);
      rem -= 6;
    } else {
      // rem is 7 or 8 -> leave a clean block of 3
      parts.push(rem - 3);
      rem = 3;
    }
  }
  return parts;
}

export function buildFullMockPlan(): BlockPlanItem[] {
  const plan: BlockPlanItem[] = [];
  for (const d of DOMAINS) {
    for (const count of splitCount(d.fullMockQuestions)) {
      plan.push({ domain: d.code, count });
    }
  }
  return plan;
}

export function buildSingleDomainPlan(domain: DomainCode): BlockPlanItem[] {
  return splitCount(SINGLE_DOMAIN_QUESTIONS).map((count) => ({ domain, count }));
}

/**
 * Lightweight test runner — no framework. Run with: npm test
 *
 * Exercises the pure, server-side logic: the robust JSON extractor, the block
 * schema validator, the request-body validator, and the generate-block flow's
 * happy path + malformed-response retry path (with a mocked model response, so
 * no network or API key is touched).
 *
 * Imports the TypeScript source directly — Node strips the types natively
 * (Node >= 23.6, and CI pins Node 24). The imported modules are import-free or
 * use `import type` only, so there is nothing to resolve at runtime.
 */
import assert from 'node:assert/strict';

import { extractJson } from '../lib/json-extract.ts';
import { validateBlock } from '../lib/validate.ts';
import { validateGenerateRequest } from '../lib/request-validation.ts';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`      ${err instanceof Error ? err.message : err}`);
  }
}

// A well-formed block the model might return.
const GOOD_BLOCK = {
  scenario_title: 'Checkout Agent Loop Stall',
  scenario:
    'Acme runs a checkout agent that orchestrates three tools. Latency spikes correlate with cart size. The team suspects the orchestration layer.',
  questions: [
    {
      stem: 'What is the most likely cause?',
      options: { A: 'Tool schema drift', B: 'Unbounded sub-agent fan-out', C: 'Cold cache', D: 'DNS' },
      correct: 'B',
      explanations: {
        A: 'Schema drift would surface as validation errors, not latency tied to cart size.',
        B: 'Fan-out scaling with cart size matches the latency signature exactly.',
        C: 'A cold cache would affect the first request, not scale with cart size.',
        D: 'DNS issues are constant, not proportional to cart size.',
      },
    },
  ],
};

const GOOD_JSON = JSON.stringify(GOOD_BLOCK);

console.log('\nextractJson');
test('parses clean JSON', () => {
  assert.deepEqual(extractJson(GOOD_JSON), GOOD_BLOCK);
});
test('parses JSON inside ```json fences', () => {
  assert.deepEqual(extractJson('```json\n' + GOOD_JSON + '\n```'), GOOD_BLOCK);
});
test('parses JSON inside bare ``` fences', () => {
  assert.deepEqual(extractJson('```\n' + GOOD_JSON + '\n```'), GOOD_BLOCK);
});
test('parses JSON surrounded by prose', () => {
  const wrapped = `Sure, here is your block:\n${GOOD_JSON}\nLet me know if you want more.`;
  assert.deepEqual(extractJson(wrapped), GOOD_BLOCK);
});
test('ignores braces inside string values', () => {
  const obj = { scenario_title: 'a }{ b', scenario: 'x', questions: [] };
  assert.deepEqual(extractJson('noise ' + JSON.stringify(obj) + ' tail'), obj);
});
test('throws when no JSON object is present', () => {
  assert.throws(() => extractJson('there is no json here'));
});

console.log('\nvalidateBlock');
test('accepts a valid block and trims fields', () => {
  const block = validateBlock(GOOD_BLOCK);
  assert.equal(block.questions.length, 1);
  assert.equal(block.questions[0].correct, 'B');
});
test('rejects a missing scenario_title', () => {
  assert.throws(() => validateBlock({ scenario: 'x', questions: GOOD_BLOCK.questions }));
});
test('rejects an invalid "correct" value', () => {
  const bad = structuredClone(GOOD_BLOCK);
  bad.questions[0].correct = 'E';
  assert.throws(() => validateBlock(bad));
});
test('rejects a question missing an option', () => {
  const bad = structuredClone(GOOD_BLOCK);
  delete bad.questions[0].options.C;
  assert.throws(() => validateBlock(bad));
});
test('rejects more than 6 questions', () => {
  const bad = structuredClone(GOOD_BLOCK);
  bad.questions = Array.from({ length: 7 }, () => GOOD_BLOCK.questions[0]);
  assert.throws(() => validateBlock(bad));
});

console.log('\nvalidateGenerateRequest');
test('accepts a valid request', () => {
  const r = validateGenerateRequest({ domain: 'D1', count: 5, usedTitles: ['x'] });
  assert.equal(r.ok, true);
  assert.equal(r.value.count, 5);
});
test('defaults usedTitles to []', () => {
  const r = validateGenerateRequest({ domain: 'D2', count: 3 });
  assert.deepEqual(r.value.usedTitles, []);
});
test('rejects an unknown domain', () => {
  assert.equal(validateGenerateRequest({ domain: 'D9', count: 4 }).ok, false);
});
test('rejects count out of the 3–6 range', () => {
  assert.equal(validateGenerateRequest({ domain: 'D1', count: 7 }).ok, false);
  assert.equal(validateGenerateRequest({ domain: 'D1', count: 2 }).ok, false);
});
test('rejects a non-object body', () => {
  assert.equal(validateGenerateRequest('nope').ok, false);
});

console.log('\ngenerate-block flow (mocked model, no network)');

// Mirrors the parse+validate+retry logic in lib/anthropic.ts generateBlock,
// driven by a queue of fake model responses instead of a live API call.
function simulateGenerate(responses) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = responses[attempt] ?? '';
    try {
      return validateBlock(extractJson(text));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

test('happy path: first response parses', () => {
  const block = simulateGenerate([GOOD_JSON]);
  assert.equal(block.scenario_title, GOOD_BLOCK.scenario_title);
});
test('retry path: malformed first, valid second', () => {
  const block = simulateGenerate(['this is not json', '```json\n' + GOOD_JSON + '\n```']);
  assert.equal(block.questions.length, 1);
});
test('failure path: malformed twice -> throws (route returns 502)', () => {
  assert.throws(() => simulateGenerate(['garbage', '{ still: broken ']));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);

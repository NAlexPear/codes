import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { BillingCode, JevResponse } from '../src/codes.ts';
import type { EvaluationCase } from '../src/evaluation.ts';

import { parseCatalog } from '../src/codes.ts';
import {
  evaluateCase,
  parseEvaluationCases,
  summarizeEvaluations,
} from '../src/evaluation.ts';

const THRESHOLDS = { confidence: 0.8, likelihood: 0.5 };

const answer = (
  supported: number,
  confidence = 0.9,
): JevResponse['answers'][string] => {
  let choice: 'not_supported' | 'supported' = 'not_supported';
  if (supported >= THRESHOLDS.likelihood) {
    choice = 'supported';
  }
  return {
    choice,
    confidence,
    probabilities: { needs_review: 0, not_supported: 1 - supported, supported },
    type: 'choice',
  };
};

const responseFor = (
  fixture: EvaluationCase,
  catalog: readonly BillingCode[],
): JevResponse => {
  const expected = new Set(
    fixture.expectedCodes.map(
      ({ code, system }) =>
        `${system.toLowerCase()}\u0000${code.toLowerCase()}`,
    ),
  );
  const answers = Object.fromEntries(
    catalog.map(({ code, system }, index) => {
      let supported = 0.1;
      if (expected.has(`${system.toLowerCase()}\u0000${code.toLowerCase()}`)) {
        supported = 0.9;
      }
      return [`candidate_${index}`, answer(supported)];
    }),
  );
  return {
    answers,
    model: 'mock-jev',
    usage: { input_tokens: 0, output_tokens: 0 },
  };
};

await test('corpus labels map every expected code to the internal catalog', async () => {
  const [catalogSource, corpusSource] = await Promise.all([
    readFile('data/billing-codes.json', 'utf8'),
    readFile('data/hand-surgery-dictations.json', 'utf8'),
  ]);
  const catalog = parseCatalog(JSON.parse(catalogSource) as unknown);
  const fixtures = parseEvaluationCases(JSON.parse(corpusSource) as unknown);
  const evaluations = fixtures.map((fixture) =>
    evaluateCase({
      catalog,
      fixture,
      response: responseFor(fixture, catalog),
      thresholds: THRESHOLDS,
    }),
  );

  assert.deepEqual(summarizeEvaluations(evaluations), {
    automaticExpected: 38,
    automaticUnexpected: 0,
    manualReviewExpected: 0,
    manualReviewUnexpected: 0,
    omittedExpected: 0,
    omittedUnexpected: 292,
  });
});

await test('evaluation distinguishes misses, false positives, and manual review', () => {
  const catalog = parseCatalog([
    {
      code: 'EXPECTED-MISS',
      description: 'Expected but omitted',
      system: 'TEST',
    },
    { code: 'UNEXPECTED', description: 'Unexpected match', system: 'TEST' },
    { code: 'EXPECTED-REVIEW', description: 'Expected review', system: 'TEST' },
  ]);
  const fixture: EvaluationCase = {
    dictation: 'An asymmetric evaluation fixture.',
    expectedCodes: [
      { code: 'EXPECTED-MISS', system: 'TEST' },
      { code: 'EXPECTED-REVIEW', system: 'TEST' },
    ],
    id: 'asymmetric',
  };
  const response: JevResponse = {
    answers: {
      candidate_0: answer(0.49),
      candidate_1: answer(0.9),
      candidate_2: answer(0.7, 0.2),
    },
    model: 'mock-jev',
    usage: { input_tokens: 0, output_tokens: 0 },
  };

  assert.deepEqual(
    summarizeEvaluations([
      evaluateCase({ catalog, fixture, response, thresholds: THRESHOLDS }),
    ]),
    {
      automaticExpected: 0,
      automaticUnexpected: 1,
      manualReviewExpected: 1,
      manualReviewUnexpected: 0,
      omittedExpected: 1,
      omittedUnexpected: 0,
    },
  );
});

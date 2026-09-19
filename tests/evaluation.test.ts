import assert from 'node:assert/strict';
import test from 'node:test';

import type { BillingCode, JevResponse } from '../src/codes.ts';
import type { EvaluationCase } from '../src/evaluation.ts';

import catalogData from '../data/billing-codes.json' with { type: 'json' };
import syntheticCasesData from '../data/hand-surgery-dictations.json' with { type: 'json' };
import sourceCasesData from '../data/hand-surgery-source-evals.json' with { type: 'json' };
import { parseCatalog } from '../src/codes.ts';
import { decisionsFromJev } from '../src/eval-providers.ts';
import {
  evaluateCase,
  hasFailures,
  onlyFailures,
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

const reviewAnswer = (): JevResponse['answers'][string] => ({
  choice: 'needs_review',
  confidence: 0.9,
  probabilities: { needs_review: 0.8, not_supported: 0.1, supported: 0.1 },
  type: 'choice',
});

const responseFor = (
  fixture: EvaluationCase,
  catalog: readonly BillingCode[],
): JevResponse => {
  const expected = new Map(
    fixture.expectedCodes.map((candidate) => [
      `${candidate.system.toLowerCase()}\u0000${candidate.code.toLowerCase()}`,
      candidate,
    ]),
  );
  const answers = Object.fromEntries(
    catalog.map(({ code, system }, index) => {
      const candidate = expected.get(
        `${system.toLowerCase()}\u0000${code.toLowerCase()}`,
      );
      if (
        candidate !== undefined &&
        !candidate.acceptedDispositions.includes('automatic')
      ) {
        return [`candidate_${index}`, reviewAnswer()];
      }
      let supported = 0.9;
      if (candidate === undefined) {
        supported = 0.1;
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

const evaluateFixtures = (
  fixtures: readonly EvaluationCase[],
  catalog: readonly BillingCode[],
): ReturnType<typeof evaluateCase>[] =>
  fixtures.map((fixture) =>
    evaluateCase({
      decisions: decisionsFromJev(
        responseFor(fixture, catalog),
        catalog,
        THRESHOLDS,
      ),
      fixture,
    }),
  );

const ASYMMETRIC_CATALOG = parseCatalog([
  {
    code: 'EXPECTED-MISS',
    description: 'Expected but omitted',
    system: 'TEST',
  },
  { code: 'UNEXPECTED', description: 'Unexpected match', system: 'TEST' },
  { code: 'EXPECTED-REVIEW', description: 'Expected review', system: 'TEST' },
]);
const ASYMMETRIC_FIXTURE: EvaluationCase = {
  dictation: 'An asymmetric evaluation fixture.',
  expectedCodes: [
    {
      acceptedDispositions: ['automatic', 'manualReview'],
      code: 'EXPECTED-MISS',
      system: 'TEST',
    },
    {
      acceptedDispositions: ['automatic', 'manualReview'],
      code: 'EXPECTED-REVIEW',
      system: 'TEST',
    },
  ],
  id: 'asymmetric',
};

await test('corpus labels map every expected code to the internal catalog', () => {
  const catalog = parseCatalog(catalogData);
  const fixtures = parseEvaluationCases(syntheticCasesData);
  const evaluations = evaluateFixtures(fixtures, catalog);

  assert.deepEqual(summarizeEvaluations(evaluations), {
    automaticExpected: 38,
    automaticUnexpected: 0,
    manualReviewExpected: 0,
    manualReviewUnexpected: 0,
    omittedExpected: 0,
    omittedUnexpected: 872,
  });
});

await test('source-grounded labels encode satisfiable automatic and review outcomes', () => {
  const catalog = parseCatalog(catalogData);
  const fixtures = parseEvaluationCases(sourceCasesData);
  const evaluations = evaluateFixtures(fixtures, catalog);

  assert.equal(evaluations.length, 36);
  assert.equal(
    evaluations.some((evaluation) => hasFailures(evaluation)),
    false,
  );
  assert.ok(
    evaluations.some(({ codes }) =>
      codes.some(
        ({ disposition, expected }) =>
          expected && disposition === 'manualReview',
      ),
    ),
  );
});

await test('evaluation distinguishes misses, false positives, and manual review', () => {
  const response: JevResponse = {
    answers: {
      candidate_0: answer(0.49),
      candidate_1: answer(0.9),
      candidate_2: answer(0.7, 0.2),
    },
    model: 'mock-jev',
    usage: { input_tokens: 0, output_tokens: 0 },
  };

  const evaluation = evaluateCase({
    decisions: decisionsFromJev(response, ASYMMETRIC_CATALOG, THRESHOLDS),
    fixture: ASYMMETRIC_FIXTURE,
  });
  assert.deepEqual(summarizeEvaluations([evaluation]), {
    automaticExpected: 0,
    automaticUnexpected: 1,
    manualReviewExpected: 1,
    manualReviewUnexpected: 0,
    omittedExpected: 1,
    omittedUnexpected: 0,
  });
  assert.equal(hasFailures(evaluation), true);
  assert.deepEqual(
    onlyFailures(evaluation).codes.map(({ code }) => code),
    ['UNEXPECTED', 'EXPECTED-MISS'],
  );
});

await test('manual review counts as a passing disposition', () => {
  const catalog = parseCatalog([
    { code: 'DUBIOUS', description: 'Ambiguous candidate', system: 'TEST' },
  ]);
  const fixture: EvaluationCase = {
    dictation: 'An intentionally ambiguous fixture.',
    expectedCodes: [],
    id: 'review-pass',
  };
  const response: JevResponse = {
    answers: {
      candidate_0: {
        choice: 'needs_review',
        confidence: 0.9,
        probabilities: {
          needs_review: 0.8,
          not_supported: 0.1,
          supported: 0.1,
        },
        type: 'choice',
      },
    },
    model: 'mock-jev',
    usage: { input_tokens: 0, output_tokens: 0 },
  };

  const evaluation = evaluateCase({
    decisions: decisionsFromJev(response, catalog, THRESHOLDS),
    fixture,
  });
  assert.equal(hasFailures(evaluation), false);
  assert.deepEqual(onlyFailures(evaluation).codes, []);
});

await test('explicit review labels reject automatic and omitted outcomes', () => {
  const catalog = parseCatalog([
    { code: 'REVIEW', description: 'Ambiguous candidate', system: 'CPT' },
  ]);
  const [fixture] = parseEvaluationCases([
    {
      billing_candidates: {
        cpt: [{ accepted_dispositions: ['manualReview'], code: 'REVIEW' }],
        icd10cm: [],
      },
      dictation: { description: 'The approach is not documented.' },
      id: 'required-review',
    },
  ]);
  assert.ok(fixture);
  const automatic = evaluateCase({
    decisions: decisionsFromJev(
      {
        answers: { candidate_0: answer(0.9) },
        model: 'mock-jev',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      catalog,
      THRESHOLDS,
    ),
    fixture,
  });
  const omitted = evaluateCase({
    decisions: decisionsFromJev(
      {
        answers: { candidate_0: answer(0.1) },
        model: 'mock-jev',
        usage: { input_tokens: 0, output_tokens: 0 },
      },
      catalog,
      THRESHOLDS,
    ),
    fixture,
  });

  assert.equal(hasFailures(automatic), true);
  assert.equal(hasFailures(omitted), true);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import type { JevResponse } from '../src/codes.ts';

import {
  buildJevRequest,
  parseCatalog,
  readCodeResults,
} from '../src/codes.ts';

const catalog = parseCatalog([
  {
    code: 'CODE-A',
    description: 'A documented current procedure',
    system: 'ICD-10-CM',
  },
  {
    code: 'CODE-B',
    description: 'A different current procedure',
    guidance: 'Requires explicit laterality',
    system: 'ICD-10-CM',
  },
]);

await test('buildJevRequest creates independent structured Choice questions for all candidates', () => {
  const request = buildJevRequest(
    'Procedure A was performed.',
    catalog,
    'jev-latest',
  );
  const firstQuestion = request.questions['candidate_0'];
  const secondQuestion = request.questions['candidate_1'];

  assert.deepEqual(request.state, { dictation: 'Procedure A was performed.' });
  assert.ok(firstQuestion);
  assert.ok(secondQuestion);
  assert.equal(firstQuestion.type, 'choice');
  assert.equal(
    secondQuestion.instructions.candidate.guidance,
    'Requires explicit laterality',
  );
  assert.equal(firstQuestion.instructions.inspect, '`dictation`');
  assert.match(
    firstQuestion.instructions.question,
    /ICD-10-CM diagnosis candidate/u,
  );
  assert.match(
    firstQuestion.criteria.supported.evidence.join(' '),
    /active treatment supports an initial-encounter designation/u,
  );
  assert.match(
    firstQuestion.instructions.decision_order.join(' '),
    /Assess the diagnosis independently/u,
  );
  assert.match(
    firstQuestion.instructions.decision_order.join(' '),
    /every candidate matching a documented alternative/u,
  );
  assert.match(
    firstQuestion.instructions.focus,
    /Procedure approach, extent, or completion uncertainty must not lower/u,
  );
});

await test('buildJevRequest gives CPT candidates procedure-specific boundaries', () => {
  const [candidate] = parseCatalog([
    { code: 'CODE-C', description: 'A performed procedure', system: 'CPT' },
  ]);
  assert.ok(candidate);
  const request = buildJevRequest(
    'Procedure C was performed.',
    [candidate],
    'jev-latest',
  );
  const question = request.questions['candidate_0'];

  assert.ok(question);
  assert.match(question.instructions.question, /CPT procedure candidate/u);
  assert.match(
    question.criteria.supported.evidence.join(' '),
    /anatomy, procedure type, approach, and extent/u,
  );
});

await test('readCodeResults keeps likely codes, flags low confidence, and sorts', () => {
  const response: JevResponse = {
    answers: {
      candidate_0: {
        choice: 'supported',
        confidence: 0.4,
        probabilities: { needs_review: 0, not_supported: 0.5, supported: 0.5 },
        type: 'choice',
      },
      candidate_1: {
        choice: 'supported',
        confidence: 0.9,
        probabilities: {
          needs_review: 0,
          not_supported: 0.09,
          supported: 0.91,
        },
        type: 'choice',
      },
    },
    model: 'jev-1.13.0',
    usage: { input_tokens: 10, output_tokens: 2 },
  };

  assert.deepEqual(
    readCodeResults(response, catalog, {
      confidence: 0.8,
      likelihood: 0.5,
    }).map(({ code, likelihood, needsManualReview }) => ({
      code,
      likelihood,
      needsManualReview,
    })),
    [
      { code: 'CODE-B', likelihood: 0.91, needsManualReview: false },
      { code: 'CODE-A', likelihood: 0.5, needsManualReview: true },
    ],
  );
});

await test('parseCatalog rejects duplicate system and code identities', () => {
  assert.throws(
    () =>
      parseCatalog([
        { code: '123', description: 'First', system: 'CPT' },
        { code: '123', description: 'Second', system: 'cpt' },
      ]),
    /Duplicate code catalog entry: cpt 123/u,
  );
});

await test('readCodeResults retains an explicit manual-review outcome', () => {
  const [candidate] = catalog;
  assert.ok(candidate);
  const response: JevResponse = {
    answers: {
      candidate_0: {
        choice: 'needs_review',
        confidence: 0.9,
        probabilities: {
          needs_review: 0.69,
          not_supported: 0.2,
          supported: 0.1,
        },
        type: 'choice',
      },
    },
    model: 'jev-1.13.0',
    usage: { input_tokens: 10, output_tokens: 1 },
  };

  const [result] = readCodeResults(response, [candidate], {
    confidence: 0.8,
    likelihood: 0.5,
  });
  assert.ok(result);
  assert.ok(Math.abs(result.likelihood - 0.79) < 0.001);
  assert.equal(result.needsManualReview, true);
});

await test('readCodeResults accepts strong support despite spread into review', () => {
  const [candidate] = catalog;
  assert.ok(candidate);
  const response: JevResponse = {
    answers: {
      candidate_0: {
        choice: 'supported',
        confidence: 0.7,
        probabilities: {
          needs_review: 0.14,
          not_supported: 0.01,
          supported: 0.85,
        },
        type: 'choice',
      },
    },
    model: 'jev-1.13.0',
    usage: { input_tokens: 10, output_tokens: 1 },
  };

  const [result] = readCodeResults(response, [candidate], {
    confidence: 0.8,
    likelihood: 0.5,
  });
  assert.ok(result);
  assert.equal(result.needsManualReview, false);
});

await test('readCodeResults rejects missing or out-of-range answers', () => {
  const response: JevResponse = {
    answers: {
      candidate_0: {
        choice: 'supported',
        confidence: 1,
        probabilities: { needs_review: 0, not_supported: 0, supported: 1.1 },
        type: 'choice',
      },
    },
    model: 'jev-1.13.0',
    usage: { input_tokens: 10, output_tokens: 2 },
  };

  assert.throws(
    () =>
      readCodeResults(response, catalog, { confidence: 0.8, likelihood: 0.5 }),
    /candidate_0/u,
  );
});

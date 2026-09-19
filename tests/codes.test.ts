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
    system: 'TEST',
  },
  {
    code: 'CODE-B',
    description: 'A different current procedure',
    guidance: 'Requires explicit laterality',
    system: 'TEST',
  },
]);

await test('buildJevRequest creates independent binary Choice questions for all candidates', () => {
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
  assert.match(
    firstQuestion.criteria.not_supported,
    /historical, planned, ruled out/u,
  );
});

await test('readCodeResults keeps likely codes, flags low confidence, and sorts', () => {
  const response: JevResponse = {
    answers: {
      candidate_0: {
        choice: 'supported',
        confidence: 0.4,
        probabilities: { not_supported: 0.5, supported: 0.5 },
        type: 'choice',
      },
      candidate_1: {
        choice: 'supported',
        confidence: 0.9,
        probabilities: { not_supported: 0.09, supported: 0.91 },
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

await test('readCodeResults rejects missing or out-of-range answers', () => {
  const response: JevResponse = {
    answers: {
      candidate_0: {
        choice: 'supported',
        confidence: 1,
        probabilities: { not_supported: 0, supported: 1.1 },
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

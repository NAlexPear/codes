import assert from 'node:assert/strict';
import test from 'node:test';

import type { CodeResult } from '../src/codes.ts';
import type { ChoiceAnswer, ChoiceResponse } from '../src/typesafe.ts';

import { buildEvidenceRequest, readEvidenceResults } from '../src/evidence.ts';

const result = (needsManualReview: boolean): CodeResult => {
  let code = '64721';
  let description = 'Open median nerve decompression at the carpal tunnel';
  let system = 'CPT';
  if (needsManualReview) {
    code = 'G56.02';
    description = 'Carpal tunnel syndrome, left upper limb';
    system = 'ICD-10-CM';
  }
  return {
    code,
    confidence: 0.9,
    description,
    likelihood: 0.95,
    needsManualReview,
    probabilities: { needs_review: 0.05, not_supported: 0.05, supported: 0.9 },
    system,
  };
};

const answer = (choice: string): ChoiceAnswer => ({
  choice,
  confidence: 0.9,
  probabilities: { [choice]: 0.9 },
  type: 'choice',
});

const response = (answers: ChoiceResponse['answers']): ChoiceResponse => ({
  answers,
  model: 'jev-test',
  usage: { input_tokens: 10, output_tokens: 3 },
});

await test('selects verbatim evidence and an actionable review reason', () => {
  const dictation =
    'The right carpal tunnel was released. The diagnosis line says left carpal tunnel syndrome.';
  const results = [result(false), result(true)];
  const request = buildEvidenceRequest(dictation, results, 'jev-latest');
  const enriched = readEvidenceResults(
    dictation,
    results,
    response({
      result_0: answer('sentence_0'),
      result_1: answer('sentence_1'),
      review_1: answer('missing_laterality'),
    }),
  );

  assert.equal(Object.keys(request.questions).length, 3);
  assert.deepEqual(enriched[0]?.evidence, [
    { quote: 'The right carpal tunnel was released.' },
  ]);
  assert.deepEqual(enriched[1]?.review, {
    action: 'Confirm the affected side.',
    category: 'missing_laterality',
  });
});

await test('rejects evidence that is not a supplied transcript sentence', () => {
  const dictation = 'The right carpal tunnel was released.';

  assert.throws(
    () =>
      readEvidenceResults(
        dictation,
        [result(false)],
        response({ result_0: answer('fabricated_quote') }),
      ),
    /invalid evidence/u,
  );
});
